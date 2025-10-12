// Local private includes
#include "AuthzWorker.hpp"
#include "Config.h"
#include "Version.hpp"

// Common public includes
#include "common/CommunicatorFactory.hpp"
#include "common/CredentialFactory.hpp"
#include "common/DynaLog.hpp"
#include "common/ICommunicator.hpp"
#include "common/IMessage.hpp"
#include "common/MessageFactory.hpp"
#include "common/SocketOptions.hpp"
#include "common/TraceException.hpp"
#include "common/Util.hpp"

// Protobuf includes
#include "common/SDMS.pb.h"
#include "common/SDMS_Anon.pb.h"
#include "common/SDMS_Auth.pb.h"
#include "common/Version.pb.h"

// Standard includes
#include <algorithm>
#include <cstdlib>
#include <fstream>
#include <random>
#include <string>
#include <syslog.h>

using namespace std;
using namespace SDMS::Anon;
using namespace SDMS::Auth;

namespace {

/**
 * \brief Designed to generated a random string of characters
 **/
std::string randomAlphaNumericCode() {
  std::string chars =
      "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  std::mt19937 generator(time(nullptr));
  std::uniform_int_distribution<> distribution(0, chars.size() - 1);

  int length = 6; // set the desired length of the random string
  std::string random_string;
  for (int i = 0; i < length; ++i) {
    random_string += chars[distribution(generator)];
  }
  return random_string;
}
} // namespace

namespace SDMS {

static bool log_stream_added = false;
static bool cerr_stream_added = false;

AuthzWorker::AuthzWorker(struct Config *a_config, LogContext log_context)
    : m_config(a_config) {

  m_log_context = log_context;
  m_log_context.thread_name += "-authz_worker";
  m_log_context.thread_id = 0;

  // Convert config item to string for easier manipulation
  m_local_globus_path_root = std::string(m_config->globus_collection_path);

  m_test_path = std::string(m_config->test_path);
  // NOTE the test_path MUST end with '/' this is to prevent authorization
  // by accident to a subfolder i.e.
  //
  // /foobar
  // /foo
  //
  // If m_test_path was meant just for the foo folder but an '/' is missing
  // then both /foobar and /foo would be valid
  //
  // NOTE we also do not want add a '/' if the test_path is emtpy because that
  // would indicate no test path is being used.
  if (!m_test_path.empty() && m_test_path.back() != '/') {
    m_test_path += '/';
  }

  // Add a backslash if not present
  initCommunicator();
}

/**
 * This method is used to initialize the communicator which will talk with
 * the core services
 *
 * Setting up a communicator consists of several steps.
 * 1. Setting up credentials that are needed to communicate securely
 * 2. Creating the configuration options for how the communication should
 *    occur
 * 3. Creating the communicator.
 *
 **/
void AuthzWorker::initCommunicator() {

  m_cred_options[CredentialType::PUBLIC_KEY] = m_config->pub_key;
  m_cred_options[CredentialType::PRIVATE_KEY] = m_config->priv_key;
  m_cred_options[CredentialType::SERVER_KEY] = m_config->server_key;
  CredentialFactory cred_factory;
  m_sec_ctx = cred_factory.create(ProtocolType::ZQTP, m_cred_options);

  // Need to attach a random number to the authz_client_socket so that
  // each authz client is distinct
  std::string authz_thread_id;
  authz_thread_id = "authz_client_socket-" + randomAlphaNumericCode();

  m_comm = [&](const std::string &socket_id, const std::string &address,
               ICredentials &credentials) {
    /// Creating input parameters for constructing Communication Instance
    AddressSplitter splitter(address);

    SocketOptions socket_options;
    socket_options.scheme = splitter.scheme();
    socket_options.class_type = SocketClassType::CLIENT;
    socket_options.direction_type = SocketDirectionalityType::BIDIRECTIONAL;
    socket_options.communication_type = SocketCommunicationType::ASYNCHRONOUS;
    socket_options.connection_life = SocketConnectionLife::INTERMITTENT;
    socket_options.protocol_type = ProtocolType::ZQTP;
    socket_options.connection_security = SocketConnectionSecurity::SECURE;
    socket_options.host = splitter.host();
    socket_options.port = splitter.port();

    if (socket_options.port.has_value()) {
      if (socket_options.port.value() != 7512) {
        DL_WARNING(m_log_context,
                   "Port number is defined for: "
                       << address
                       << " however, it is a non standard port, the standard "
                          "port for connecting to the core server is port "
                          "number 7512, whereas here you are using port: "
                       << socket_options.port.value());
      }
    }
    socket_options.local_id = socket_id;

    uint32_t timeout_on_receive = 50000;
    long timeout_on_poll = 50000;

    CommunicatorFactory comm_factory(m_log_context);

    return comm_factory.create(socket_options, credentials, timeout_on_receive,
                               timeout_on_poll);
  }(authz_thread_id, m_config->server_addr, *m_sec_ctx);
}

/**
 * @brief Determine if the given POSIX path is within the configured test path.
 *
 * A test path can be set in the authorization configuration file to assist
 * with debugging and setup of a DataFed-managed Globus collection.
 * Any authorization associated with this path and its subpaths in the
 * folder hierarchy is automatically approved.
 *
 * @param posix_path The POSIX-style file path to evaluate.
 * @return `true` if the provided path is within the configured test path,
 *         `false` otherwise.
 *
 * @note This method uses the `m_test_path` and its length `m_test_path_len`
 *       to determine if the `posix_path` starts with the test path.
 *       If the test path is not set (`m_test_path_len == 0`), the function
 *       will always return `false`.
 *
 * @attention Use caution when setting a test path, as it bypasses normal
 *            authorization checks for all matching paths.
 *
 * Example:
 * @code
 * AuthzWorker authzWorker;
 * std::string path = "/data/test_path/example_file";
 * if (authzWorker.isTestPath(path)) {
 *     std::cout << "Path is within the test path!" << std::endl;
 * } else {
 *     std::cout << "Path is not within the test path." << std::endl;
 * }
 * @endcode
 */
bool AuthzWorker::isTestPath(const std::string &posix_path) const {
  if (m_test_path.size() > 0 &&
      posix_path.compare(0, m_test_path.size(), m_test_path) == 0) {
    DL_INFO(m_log_context,
            "Allowing request within TEST PATH: " << m_config->test_path);
    return true;
  }
  return false;
}

/**
 * @brief Validates whether the provided POSIX path is properly formatted.
 *
 * This method checks if the given POSIX path starts with the configured
 * Globus root collection path (`m_local_globus_path_root`). If the path is not
 * properly formatted, an error message is logged, and the method returns
 * `false`.
 *
 * @param posix_path The POSIX-style file path to validate.
 * @return `true` if the provided path is valid (properly formatted),
 *         `false` otherwise.
 *
 * @note The validation ensures that the `posix_path` begins with the
 *       `m_local_globus_path_root` prefix. If the path is shorter than the
 *       root prefix, it is considered invalid.
 *
 * @attention An improperly formatted path indicates a configuration or
 *            user error and will result in an error log message.
 *
 * Example:
 * @code
 * AuthzWorker authzWorker;
 * std::string path = "/data/globus_root/example_file";
 * if (authzWorker.isPathValid(path)) {
 *     std::cout << "Path is valid!" << std::endl;
 * } else {
 *     std::cout << "Path is invalid." << std::endl;
 * }
 * @endcode
 *
 * Errors:
 * - Logs an error if the path does not start with `m_local_globus_path_root`.
 * - Logs an error if the path is shorter than `m_local_globus_path_root`.
 */
bool AuthzWorker::isPathValid(const std::string &posix_path) const {
  if (m_local_globus_path_root.length() > posix_path.length()) {
    std::string err_message =
        "Provided path is not properly formatted, should be prefixed with "
        "globus_root_collection_path: ";
    err_message += m_local_globus_path_root + " but is: " + posix_path;
    DL_ERROR(m_log_context, err_message);
    return false;
  }

  auto prefix = posix_path.substr(0, m_local_globus_path_root.length());
  if (prefix.compare(m_local_globus_path_root) != 0) {
    std::string err_message =
        "Provided path is not properly formatted, should be prefixed with "
        "globus_root_collection_path: ";
    err_message += m_local_globus_path_root + " but is: " + prefix;
    DL_ERROR(m_log_context, err_message);
    return false;
  }
  return true;
}

/**
 * @brief Validates whether the provided FTP URL is properly formatted.
 *
 * This method checks if the given FTP URL starts with the required scheme
 * (`ftp://`) and contains at least three slashes, which indicates the presence
 * of a hostname after the scheme. If the URL is not properly formatted, an
 * error message is logged, and the method returns `false`.
 *
 * @param full_ftp_url A C-style string representing the full FTP URL to
 * validate.
 * @return `true` if the URL is valid (properly formatted),
 *         `false` otherwise.
 *
 * @note The method performs the following checks:
 *       - The URL must begin with the `ftp://` scheme.
 *       - The URL must include at least three slashes to indicate a valid
 *         scheme and hostname.
 *
 * @attention Improperly formatted URLs result in error log messages to help
 *            diagnose issues.
 *
 * Example:
 * @code
 * AuthzWorker authzWorker;
 * char url[] = "ftp://hostname/path/to/file";
 * if (authzWorker.isURLValid(url)) {
 *     std::cout << "URL is valid!" << std::endl;
 * } else {
 *     std::cout << "URL is invalid." << std::endl;
 * }
 * @endcode
 *
 * Errors:
 * - Logs an error if the URL does not start with `ftp://`.
 * - Logs an error if the URL contains fewer than three slashes.
 */
bool AuthzWorker::isURLValid(char *full_ftp_url) const {

  std::string scheme = "ftp://";
  auto local_path = std::string(full_ftp_url);
  if (local_path.substr(0, scheme.length()).compare(scheme) != 0) {
    DL_ERROR(m_log_context, "Provided path is not properly formatted, should "
                            "be prefixed with ftp:// but is: "
                                << full_ftp_url);
    return false;
  }

  int count = std::count(local_path.begin(), local_path.end(), '/');
  if (count < 3) {
    DL_ERROR(m_log_context, "Provided path is not properly formatted, should "
                            "be prefixed with ftp://hostname but is: "
                                << full_ftp_url);
    return false;
  }

  // Make sure there are at least 8 characters
  // i.e. ftp://b/
  if (local_path.length() < 8) {
    DL_ERROR(m_log_context,
             "Provided ftp URL is invalid, URL must have host and trailing /");
    return false;
  }

  // index of character after ftp:// index 6
  size_t char_index = 6;
  if (local_path.at(char_index) == '/') {
    DL_ERROR(m_log_context, "Provided ftp URL is missing hostname");
    return false;
  }
  return true;
}

/**
 * @brief Removes the origin (ftp://hostname) from the given FTP URL.
 *
 * This method strips the `ftp://hostname` portion from a provided FTP URL,
 * leaving only the path portion starting from the Globus collection root path.
 * The URL is expected to be in the format:
 * `ftp://hostname/globus_collection_root_path`. The method extracts the
 * substring that follows the third occurrence of a slash (`/`), which is used
 * to identify the path after the hostname.
 *
 * @param full_ftp_url A C-style string representing the full FTP URL, including
 * the hostname and path.
 * @return A string containing the remaining path after the `ftp://hostname`
 * portion.
 *
 * @note The method assumes the URL follows the
 * `ftp://hostname/globus_collection_root_path` format. If there are fewer than
 * three slashes in the URL, it will return the entire string after the first
 * two slashes.
 *
 * @attention The method does not validate the URL structure beyond checking for
 * slashes, so improper formatting may result in unexpected behavior.
 *
 * Example:
 * @code
 * AuthzWorker authzWorker;
 * char url[] = "ftp://hostname/globus_root_path/some/file";
 * std::string path = authzWorker.removeOrigin(url);
 * std::cout << "Path after origin removed: " << path << std::endl;
 * @endcode
 *
 * Errors:
 * - Logs an error if the format does not meet the expected `ftp://hostname/`
 * structure.
 */
std::string AuthzWorker::removeOrigin(char *full_ftp_url) const {

  if (isURLValid(full_ftp_url) == false) {
    EXCEPT(1, "Invalid formatted ftp url.");
  }

  auto local_path = std::string(full_ftp_url);
  char backslash = '/';
  int count = 0;
  size_t index = 0;

  for (size_t i = 0; i < local_path.length(); i++) {
    if (local_path[i] == backslash) {
      count++;
      if (count == 3) {
        index = i;
        break;
      }
    }
  }

  // Extract the substring after the third occurrence of the character
  return local_path.substr(index);
}

/**
 * @brief Retrieves the authorization path from the given FTP URL by removing
 * the origin and validating the path.
 *
 * This method first removes the `ftp://hostname` portion from the provided FTP
 * path using the `removeOrigin` method. Then, it validates the remaining path
 * to ensure it is properly formatted with the expected Globus collection root
 * path. If the path is invalid, an exception is thrown. Finally, it returns the
 * path after the Globus collection root prefix.
 *
 * @param full_ftp_path A C-style string representing the full FTP URL, which
 * includes the scheme, hostname, and path.
 * @return A string containing the authorization path after the `ftp://hostname`
 * portion and the Globus collection root path.
 *
 * @throws EXCEPT(1, "Invalid POSIX path.") If the path is not valid according
 * to the `isPathValid` method.
 *
 * @note The method relies on the `removeOrigin` method to remove the
 * `ftp://hostname` portion and expects the remaining path to start with a valid
 * Globus collection root path.
 *
 * Example:
 * @code
 * AuthzWorker authzWorker;
 * char path[] = "ftp://hostname/globus_root_path/some/file";
 * std::string authzPath = authzWorker.getAuthzPath(path);
 * std::cout << "Authorization Path: " << authzPath << std::endl;
 * @endcode
 *
 * Errors:
 * - Throws an exception if the path is invalid.
 */
std::string AuthzWorker::getAuthzPath(char *full_ftp_path) {
  std::string local_path = removeOrigin(full_ftp_path);

  if (isPathValid(local_path) == false) {
    EXCEPT(1, "Invalid POSIX path: " + std::string(full_ftp_path) +
                  " local_path: " + local_path);
  }

  std::string prefix = local_path.substr(0, m_local_globus_path_root.length());
  if (prefix.length() == 1) {
    if (prefix.compare("/") == 0) {
      return local_path;
    } else {
      EXCEPT(1, "Invalid POSIX path: " + std::string(full_ftp_path) +
                    " local_path: " + local_path + " prefix: " + prefix);
    }
  }
  return local_path.substr(prefix.length());
}

/**
 * @brief Processes the response received from the core service and handles
 * different scenarios such as timeout, errors, and valid responses.
 *
 * This method is designed to process a response from the core service, checking
 * for various conditions such as whether the response contains a message,
 * whether there was a timeout, or whether an error occurred. If the response is
 * valid and contains the expected payload, the method will further inspect it
 * to check for a NACK reply.
 *
 * The method performs the following:
 * - If the response contains a valid message, it extracts the correlation ID.
 * - If the response has a timeout, it logs a warning with details about the
 * service's address and port.
 * - If an error occurs, it logs the error message.
 * - If no errors or timeouts are present, it checks if the payload is a NACK
 * reply.
 * - If the response is a NACK, it logs a debug message.
 *
 * @param response A reference to an `ICommunicator::Response` object that
 * contains the response data.
 * @return `1` if a NACK response was received, `0` otherwise.
 *
 * @throws EXCEPT(1, "Core service did not respond") If the core service
 * response times out.
 *
 * @note This method assumes that the response message and error fields are
 * populated correctly before processing.
 *
 * Example:
 * @code
 * ICommunicator::Response response = communicator.getResponse();
 * int result = authzWorker.processResponse(response);
 * if (result == 1) {
 *     std::cout << "Received NACK reply" << std::endl;
 * } else {
 *     std::cout << "Response processed successfully" << std::endl;
 * }
 * @endcode
 */
int AuthzWorker::processResponse(ICommunicator::Response &response) {
  if (response.message) { // Make sure the message exists before we try to
                          // access it
    m_log_context.correlation_id = std::get<std::string>(
        response.message->get(MessageAttribute::CORRELATION_ID));
  }
  if (response.time_out) {
    std::string error_msg =
        "AuthWorker.cpp Core service did not respond within timeout.";

    AddressSplitter splitter(m_comm->address());

    if (splitter.port().value() != 7512) {

      error_msg += "Port number is defined for: " + m_comm->address() +
                   " however, it is a non standard port, the standard port "
                   "for connecting to the core server is port number 7512, "
                   "whereas here you are using port: " +
                   std::to_string(splitter.port().value());
    }

    DL_WARNING(m_log_context, error_msg);
    EXCEPT(1, "Core service did not respond");
  } else if (response.error) {
    // This will just log the output without throwing.
    DL_ERROR(m_log_context, "AuthWorker.cpp there was an error when "
                            "communicating with the core service: "
                                << response.error_msg);
  } else {

    if (not response.message) {
      DL_ERROR(m_log_context, "No error was reported and no time out occured "
                              "but message is not defined.");
      EXCEPT(1, "This exception indicates that something is very wrong.");
    }

    auto payload =
        std::get<google::protobuf::Message *>(response.message->getPayload());
    Anon::NackReply *nack = dynamic_cast<Anon::NackReply *>(payload);
    if (!nack) {
      return 0;
    } else {
      DL_DEBUG(m_log_context, "Received NACK reply");
    }
  }
  return 1;
}

/**
 * @brief Checks the authorization for a given client and action on a specific
 * path.
 *
 * This method performs the following steps to check authorization:
 * - Logs the client ID being checked.
 * - Sanitizes the provided path using the `getAuthzPath` method. If the path is
 * invalid, an exception is raised.
 * - If the path is determined to be a test path, the method returns early with
 * a `0`, allowing access without further checks.
 * - Constructs an authorization request (`AuthzRequest`) and sets the
 * repository ID, client ID, path, and action to be validated.
 * - Creates a message using `MessageFactory` and sets the public key from the
 * credentials options.
 * - Sends the message through the communicator and waits for a response.
 * - Processes the response using the `processResponse` method and returns the
 * result.
 *
 * This method is used to ensure that the client has proper authorization to
 * perform a specific action on a file or resource. It validates the action
 * against the provided path and client ID, contacting the core service for
 * verification.
 *
 * @param client_id The client ID requesting the action.
 * @param path The path to the file or resource to be accessed.
 * @param action The action (e.g., read, write) that the client wants to
 * perform.
 * @return An integer result based on the response:
 * - `0` if the path is a test path or authorization is granted.
 * - Non-zero value indicating the result of the authorization process (such as
 * the result of the NACK check).
 *
 * @throws EXCEPT(1, "Invalid POSIX path.") If the path cannot be sanitized or
 * is invalid.
 *
 * @note This method relies on the communication layer to send and receive
 * messages to validate authorization and requires a configured communicator and
 * credentials options.
 *
 * Example:
 * @code
 * char client_id[] = "client123";
 * char path[] = "/some/path/to/resource";
 * char action[] = "read";
 * AuthzWorker auth_worker;
 * int result = auth_worker.checkAuth(client_id, path, action);
 * if (result == 0) {
 *     std::cout << "Authorization granted or path is a test path" << std::endl;
 * } else {
 *     std::cout << "Authorization failed or additional checks required" <<
 * std::endl;
 * }
 * @endcode
 */
int AuthzWorker::checkAuth(char *client_id, char *path, char *action) {
  DL_DEBUG(m_log_context, "Checking auth for client: " << client_id);

  // An exception will be raised here if the path is invalid
  std::string sanitized_path = getAuthzPath(path);

  if (isTestPath(sanitized_path)) {
    return 0;
  }

  auto auth_req = std::make_unique<Auth::RepoAuthzRequest>();

  auth_req->set_repo(m_config->repo_id);
  auth_req->set_client(client_id);
  auth_req->set_file(sanitized_path);
  auth_req->set_action(action);

  MessageFactory msg_factory;
  auto message = msg_factory.create(MessageType::GOOGLE_PROTOCOL_BUFFER);
  message->set(MessageAttribute::KEY,
               m_cred_options[CredentialType::PUBLIC_KEY]);
  message->setPayload(std::move(auth_req));

  m_comm->send(*message);
  LogContext log_context = m_log_context;
  log_context.correlation_id =
      std::get<std::string>(message->get(MessageAttribute::CORRELATION_ID));

  auto response = m_comm->receive(MessageType::GOOGLE_PROTOCOL_BUFFER);

  return processResponse(response);
}

} // End namespace SDMS

extern "C" {
// The same
const char *getVersion() {
  static std::string ver_str =
      std::to_string(SDMS::authz::version::MAJOR) + "." +
      std::to_string(SDMS::authz::version::MINOR) + "." +
      std::to_string(SDMS::authz::version::PATCH);

  return ver_str.c_str();
}

const char *getAPIVersion() {
  static std::string ver_str =
      std::to_string(DATAFED_COMMON_PROTOCOL_API_MAJOR) + "." +
      std::to_string(DATAFED_COMMON_PROTOCOL_API_MINOR) + "." +
      std::to_string(DATAFED_COMMON_PROTOCOL_API_PATCH);

  return ver_str.c_str();
}

const char *getReleaseVersion() {
  static std::string ver_str = std::to_string(DATAFED_RELEASE_YEAR) + "." +
                               std::to_string(DATAFED_RELEASE_MONTH) + "." +
                               std::to_string(DATAFED_RELEASE_DAY) + "." +
                               std::to_string(DATAFED_RELEASE_HOUR) + "." +
                               std::to_string(DATAFED_RELEASE_MINUTE);

  return ver_str.c_str();
}

// The same
int checkAuthorization(char *client_id, char *object, char *action,
		struct Config *config) {

	int result = -1;

  // To log errors if there are exceptions the code block below must be defined
  // outside the try catch
#if defined(DONT_USE_SYSLOG)
  SDMS::global_logger.setSysLog(false);
#else
  SDMS::global_logger.setSysLog(true);
#endif
  SDMS::global_logger.setLevel(SDMS::LogLevel::INFO);
  auto log_path_authz = std::string(config->log_path);
  // Only add cerr once we don't need to close it like the file stream
  if( SDMS::cerr_stream_added == false ) {
    SDMS::global_logger.addStream(std::cerr);
    SDMS::cerr_stream_added = true;
  }

  SDMS::LogContext log_context;
  log_context.thread_name = "authz_check";
  log_context.thread_id = 0;

	try {
		std::ofstream log_file_worker;

    // Used to determine if the file stream has been added
		bool added = false;
		// The ofstream must exist for the duration of the log output then it must
    // be removed
    uint32_t stream_id;

		if (log_path_authz.length() > 0) {
			// Append to the existing path because we don't want the C++ and C code
			// trying to write to the same file
			log_path_authz.append("_authz");

			if (SDMS::log_stream_added == false) {

				log_file_worker.open(log_path_authz, std::ios::app);
				if (!log_file_worker.is_open()) {
					DL_ERROR(log_context, "AuthzWorker open log file path failed, path: "
							<< log_path_authz);
				} else {
					stream_id = SDMS::global_logger.addStream(log_file_worker);
					SDMS::log_stream_added = true;
					added = true;
				}
			}
		}

		DL_DEBUG(log_context, "AuthzWorker checkAuthorization "
				<< client_id << ", " << object << ", " << action);

		SDMS::AuthzWorker worker(config, log_context);
		result = worker.checkAuth(client_id, object, action);

		// We don't want to close it unless we can also remove it, and we want to
		// leave it open until we are completely done. But because it is only defined
		// within this function scope we have to close and remove it.
		if (log_file_worker.is_open() && added) {
			log_file_worker.close();
			SDMS::global_logger.removeStream(stream_id);
			SDMS::log_stream_added = false;
		}

	} catch (TraceException &e) {
		DL_ERROR(log_context, "AuthzWorker exception: " << e.toString());
	} catch (exception &e) {
		DL_ERROR(log_context, "AuthzWorker exception: " << e.what());
	}
	return result;
}
}

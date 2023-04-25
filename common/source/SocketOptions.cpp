
// Common public includes
#include "common/SocketOptions.hpp"
#include "common/TraceException.hpp"

// Standard namespace
#include <algorithm>
#include <cctype>
#include <sstream>
#include <string>

namespace SDMS {

  AddressSplitter::AddressSplitter(const std::string & address) {
    std::string copy = address;

    std::string tcp_prefix = "tcp://";
    std::string https_prefix = "https://";
    std::string http_prefix = "http://";
    std::string inproc_prefix = "inproc://";

    if(address.rfind(tcp_prefix,0) == 0){
      copy.erase(0, tcp_prefix.length());
      m_scheme = URIScheme::TCP;
    }else if(address.rfind("http://",0) == 0){
      copy.erase(0, http_prefix.length());
      m_scheme = URIScheme::HTTP;
    } else if(address.rfind("https://",0) == 0) {
      copy.erase(0, https_prefix.length());
      m_scheme = URIScheme::HTTPS;
    } else if(address.rfind("inproc://",0) == 0) {
      copy.erase(0, inproc_prefix.length());
      m_scheme = URIScheme::INPROC;
    } else {
      EXCEPT_PARAM(1, "Error unable to deconstruct address unrecognized scheme: (" << address << ")" );
    }

    // Get the host
    auto pos_slash = copy.find('/');
    if( pos_slash != std::string::npos ){
      copy = copy.substr(0, pos_slash); 
    }

    if( copy.size() < 1 ) {
      EXCEPT_PARAM(1, "Error unable to deconstruct host, it does not appear to be provided in the address.");
    }

    // Check if there is a port separator character i.e. ':'
    auto pos_colon = copy.find(':');
    if( pos_colon != std::string::npos) {
      std::string port;
      // Add 1 so as to ignore the ':' when copying the port number
      if( pos_colon+1 < copy.size() ) {
        port = copy.substr(pos_colon+1);
      } // Else no port was provided

      std::string host;
      if( pos_colon > 0 ) {
        m_host = copy.substr(0, pos_colon);
      }
      if( port.size() > 0 ) {
        // Make sure the port is just numbers and does not contain characters
        if(std::all_of(port.begin(), port.end(), ::isdigit)) {
          // This is not completely safe but better than no check.
          std::istringstream port_ss(port);
          uint64_t local_value;
          port_ss >> local_value;

          uint64_t max_16_bit_val = 65535;
          if(local_value < max_16_bit_val) {
            m_port = static_cast<uint16_t>(local_value); 
          } else {
            EXCEPT_PARAM(1, "Port number exceeds allowed numeric limit of 16 bit unsigned int: " << local_value);
          }
        } else {
          EXCEPT_PARAM(1, "Deconstructing address failed, port contains non-numeric types: " << port);
        }
      }
    } else { // pos_colon != std::string::npos means there is no port provided
      m_host = copy;
    }
  }
}

cmake_minimum_required (VERSION 3.17.0)
project( DataFed CXX C )
include(./cmake/Version.cmake)
include(./cmake/Utils.cmake)

set(DataFed_VERSION "${DATAFED_RELEASE_YEAR}.${DATAFED_RELEASE_MONTH}.${DATAFED_RELEASE_DAY}.${DATAFED_RELEASE_HOUR}.${DATAFED_RELEASE_MINUTE}")

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(THREADS_PREFER_PTHREAD_FLAG ON)

find_package(Threads REQUIRED)

# Globus version to compile repo server with
if( NOT DEFINED GLOBUS_VERSION )
  set(GLOBUS_VERSION  5)
endif()
OPTION(BUILD_AUTHZ "Build DataFed Authz library" FALSE)
OPTION(BUILD_AUTHZ_TESTS "Build DataFed Authz Tests" FALSE)
OPTION(BUILD_AUTHZ_WITH_SYSLOG "Build Authz without syslog" TRUE)
OPTION(BUILD_CORE_SERVER "Build DataFed Core Server" TRUE)
OPTION(BUILD_COMMON "Build DataFed common library" TRUE)
OPTION(BUILD_DOCS "Build documentation" TRUE)
OPTION(BUILD_FOXX "Build Foxx" TRUE)
OPTION(BUILD_REPO_SERVER "Build DataFed Repo Server" FALSE)
OPTION(BUILD_PYTHON_CLIENT "Build python client" TRUE)
OPTION(BUILD_TESTS "Build Tests" TRUE)
OPTION(BUILD_WEB_SERVER "Build DataFed Web Server" TRUE)
OPTION(ENABLE_UNIT_TESTS "Enable unit tests" TRUE)
OPTION(BUILD_SHARED_LIBS "By default DataFed tries to build static libraries
with the exception of libdatafed-authz which must always be a shared library,
it will also try to link with as many static libraries as possible. However,
building with static depencies is not completely possible because some system
libraries must be shared libraries for DataFed to be interoperable. If this
setting is turned on DataFed will build it's libraries as shared and try to
link to shared libraries." OFF)
OPTION(ENABLE_END_TO_END_API_TESTS "Enable end-to-end API testing" FALSE)
OPTION(ENABLE_END_TO_END_WEB_TESTS "Enable end-to-end web testing with Playwright" FALSE)
OPTION(ENABLE_FOXX_TESTS "Enable Foxx testing, off by default because it
  will overwrite the test database." FALSE)

set(INSTALL_REPO_SERVER ${BUILD_REPO_SERVER})
set(INSTALL_AUTHZ ${BUILD_AUTHZ})
set(INSTALL_CORE_SERVER ${BUILD_CORE_SERVER})
set(INSTALL_WEB_SERVER ${BUILD_WEB_SERVER})

set(DATAFED_CONFIG_SH "${DataFed_SOURCE_DIR}/config/datafed.sh")
if(NOT EXISTS ${DATAFED_CONFIG_SH})
  message(FATAL_ERROR "Error: File '${DATAFED_CONFIG_SH}' does not exist. "
    "Please run generate_datafed.sh first to populate defaults."
    "${PROJECT_SOURCE_DIR}/scripts/generate_datafed.sh")
endif()

file(READ "${PROJECT_SOURCE_DIR}/scripts/dependency_versions.sh" DEPENDENCY_VERSIONS)

get_version_from_script(${DEPENDENCY_VERSIONS} "DATAFED_DYNAMIC_LIBRARY_PROTOBUF_VERSION" PROTOBUF_LIBRARY_VERSION)
get_version_from_script(${DEPENDENCY_VERSIONS} "DATAFED_PROTOBUF_VERSION" PROTOBUF_COMPILER_VERSION)
get_version_from_script(${DEPENDENCY_VERSIONS} "DATAFED_NLOHMANN_JSON_VERSION" NLOHMANN_JSON_VERSION)
get_version_from_script(${DEPENDENCY_VERSIONS} "DATAFED_LIBZMQ_VERSION" LIBZMQ_VERSION)
get_version_from_script(${DEPENDENCY_VERSIONS} "DATAFED_LIBSODIUM_VERSION" LIBSODIUM_VERSION)
get_version_from_script(${DEPENDENCY_VERSIONS} "DATAFED_JSON_SCHEMA_VALIDATOR_VERSION" JSON_SCHEMA_VALIDATOR_VERSION)
get_version_from_script(${DEPENDENCY_VERSIONS} "DATAFED_OPENSSL" LOCAL_OPENSSL_VERSION)
get_version_from_script(${DEPENDENCY_VERSIONS} "DATAFED_LIBCURL" LOCAL_CURL_VERSION)
get_version_from_script(${DEPENDENCY_VERSIONS} "DATAFED_BOOST" LOCAL_BOOST_VERSION)
get_version_from_script(${DEPENDENCY_VERSIONS} "DATAFED_ZLIB_VERSION" LOCAL_ZLIB_VERSION)
get_version_from_script(${DEPENDENCY_VERSIONS} "DATAFED_NODE_VERSION" LOCAL_NODE_VERSION)
# Prioritize the CMD line argument over config file
if(NOT DEFINED DATAFED_INSTALL_PATH)
  get_value_from_datafed_sh("DATAFED_INSTALL_PATH" DATAFED_INSTALL_PATH)
endif()

if(NOT DEFINED DATAFED_DOMAIN)
  get_value_from_datafed_sh("DATAFED_DOMAIN" DATAFED_DOMAIN)
  message("TESTING: DATAFED_DOMAIN : ${DATAFED_DOMAIN}")
endif()

if(NOT DEFINED DATAFED_DEPENDENCIES_INSTALL_PATH)
  get_value_from_datafed_sh("DATAFED_DEPENDENCIES_INSTALL_PATH" DEPENDENCY_INSTALL_PATH)
endif()

set(CMAKE_PREFIX_PATH "${DEPENDENCY_INSTALL_PATH}")

if ( BUILD_TESTS )
  include(CTest)
  ENABLE_TESTING()
  set(CMAKE_CTEST_ARGUMENTS "--output-on-failure")
endif()

# Off by default because running it on production would overwrite things on the database
if( NOT DEFINED ENABLE_FOXX_TESTS )
  if( NOT DEFINED ENV{ENABLE_FOXX_TESTS} )
    set(ENABLE_FOXX_TESTS FALSE)
  else()
    set(ENABLE_FOXX_TESTS ENV{ENABLE_FOXX_TESTS})
  endif()
else()
  # Avoid throwing warning by explicit set
  set(ENABLE_FOXX_TESTS ${ENABLE_FOXX_TESTS})
endif()

# To be safe this is by default turned off
if( NOT DEFINED ENABLE_END_TO_END_TESTS )
  set(ENABLE_END_TO_END_TESTS FALSE)
endif()

if(CMAKE_MAKE_PROGRAM MATCHES "(make|gmake)")
    add_definitions( -Wall -Wextra )
endif()

configure_file(
  "${CMAKE_CURRENT_SOURCE_DIR}/common/proto/common/Version.proto.in"
  "${CMAKE_CURRENT_SOURCE_DIR}/common/proto/common/Version.proto"
  @ONLY)

# Create file glob here because need to be made visible here as well
file( GLOB ProtoFiles "${PROJECT_SOURCE_DIR}/common/proto/common/*.proto" )

if( BUILD_WEB_SERVER )
  include(./cmake/Web.cmake)
  file(COPY ${ProtoFiles} DESTINATION "${CMAKE_CURRENT_SOURCE_DIR}/web/")

  if( ENABLE_UNIT_TESTS )
    add_test(NAME unit_tests_web COMMAND "${DEPENDENCY_INSTALL_PATH}/nvm/versions/node/${LOCAL_NODE_VERSION}/bin/npm" "test")
    set_tests_properties(unit_tests_web PROPERTIES WORKING_DIRECTORY ${PROJECT_SOURCE_DIR}/web)
  endif()

endif()

if( BUILD_AUTHZ_TESTS )
  include(./cmake/GSSAPI.cmake)
  include(./cmake/GlobusCommon.cmake)
endif()

if ( BUILD_REPO_SERVER OR BUILD_CORE_SERVER OR BUILD_AUTHZ OR BUILD_COMMON OR BUILD_PYTHON_CLIENT)
  include(./cmake/Protobuf.cmake)
endif()

if ( BUILD_REPO_SERVER OR BUILD_CORE_SERVER OR BUILD_AUTHZ OR BUILD_COMMON)

  include_directories( "/usr/include/globus" )

  include(./cmake/Boost.cmake)

  find_package(Threads REQUIRED)
  ## load in pkg-config support
  find_package(PkgConfig)

  include(./cmake/ZeroMQ.cmake)
  if(NOT CMAKE_BUILD_TYPE)
    set(CMAKE_BUILD_TYPE Release)
  endif()

  set(CMAKE_CXX_FLAGS "-Wall -Wextra -DUSE_DYNALOG -D_FILE_OFFSET_BITS=64")
  set(CMAKE_CXX_FLAGS_DEBUG "-g")
  set(CMAKE_CXX_FLAGS_RELEASE "-O3")

  set(CMAKE_C_FLAGS "-Wall -Wextra")
  set(CMAKE_C_FLAGS_DEBUG "-g")
  set(CMAKE_C_FLAGS_RELEASE "-O3")

  # If it wasn't being built beforehand by default it must be now
  set(BUILD_COMMON TRUE)

endif()

if( BUILD_COMMON )
  include(./cmake/OpenSSL.cmake)
  add_subdirectory( common )
endif()

if( BUILD_CORE_SERVER )
  include(./cmake/JSON.cmake)
  include(./cmake/JSONSchema.cmake)
  include(./cmake/Zlib.cmake)
  include(./cmake/OpenSSL.cmake)
  include(./cmake/CURL.cmake)
endif()

if( BUILD_FOXX OR BUILD_CORE_SERVER )
  add_subdirectory( core )
endif()

if( BUILD_REPO_SERVER OR BUILD_AUTHZ)
  add_subdirectory( repository )
endif()

if( BUILD_PYTHON_CLIENT )
  # make target = pydatafed
  add_subdirectory( python EXCLUDE_FROM_ALL )
endif()

if( BUILD_DOCS )
  if(NOT BUILD_PYTHON_CLIENT)
    message(FATAL_ERROR "Python client must also be build to create documentation for API.")
  endif()
  # make target = docs
  add_subdirectory( doc_source EXCLUDE_FROM_ALL )
endif()

if( INSTALL_REPO_SERVER )
  # Should only need to do this on the same machine that Globus is installed
  install( TARGETS datafed-repo DESTINATION ${DATAFED_INSTALL_PATH}/repo )
  install( CODE "execute_process(COMMAND ${PROJECT_SOURCE_DIR}/scripts/install_repo_service.sh )")
endif()

if( INSTALL_AUTHZ )
  install( TARGETS datafed-authz DESTINATION ${DATAFED_INSTALL_PATH}/authz )
  install( CODE "execute_process(COMMAND ${PROJECT_SOURCE_DIR}/scripts/install_authz.sh )")
endif()

if( INSTALL_CORE_SERVER )
  install( TARGETS datafed-core DESTINATION ${DATAFED_INSTALL_PATH}/core )
endif()

if( INSTALL_WEB_SERVER )
  install( FILES ${ProtoFiles} DESTINATION ${DATAFED_INSTALL_PATH}/web )
  install( DIRECTORY ${PROJECT_SOURCE_DIR}/web/static DESTINATION ${DATAFED_INSTALL_PATH}/web )
  install( DIRECTORY ${PROJECT_SOURCE_DIR}/web/views DESTINATION ${DATAFED_INSTALL_PATH}/web )
  install( FILES ${PROJECT_SOURCE_DIR}/web/version.js DESTINATION ${DATAFED_INSTALL_PATH}/web )
endif()

if( INSTALL_FOXX )
  install(CODE "execute_process(COMMAND ${DataFed_SOURCE_DIR}/scripts/install_foxx.sh
                                OUTPUT_VARIABLE _out
                                ERROR_VARIABLE _err
                                RESULT_VARIABLE _res)
                If (NOT \${_res} EQUAL \"0\")
                    message( FATAL_ERROR \"out: \${_out} install_foxx failed: \${_err}\")
                endif()"
         )
endif()

if (ENABLE_END_TO_END_TESTS)
	if (NOT ENABLE_END_TO_END_API_TESTS AND NOT ENABLE_END_TO_END_WEB_TESTS)
    message (FATAL_ERROR "Cannot run end-to-end tests because one of the ENABLE_END_TO_END web or API flag is not on")
  else()
    add_subdirectory(tests/end-to-end)
    add_subdirectory(tests/end-to-end/web-UI)
  endif()
else()
  if (ENABLE_END_TO_END_API_TESTS)
    if (BUILD_PYTHON_CLIENT)
      add_subdirectory(tests/end-to-end)
    else()
      message (FATAL_ERROR "Cannot run end-to-end tests because BUILD_PYTHON_CLIENT is not on")
    endif()
  endif()
  if (ENABLE_END_TO_END_WEB_TESTS)
    add_subdirectory(tests/end-to-end/web-UI)
  endif()
endif()

find_library(SODIUM NAMES libsodium.a PATHS ${DEPENDENCY_INSTALL_PATH}/lib)

# This is not needed but it is used by zmq I think so we want to print what is found locally just in case
#if (PKG_CONFIG_FOUND)
#  pkg_check_modules(sodium_PKG QUIET libsodium)
#endif()
message("")
message("Tested Dependency Versions")
message("             protobuf Version: ${PROTOBUF_LIBRARY_VERSION}")
message("               protoc Version: ${PROTOBUF_COMPILER_VERSION}")
message("               libzmq Version: ${LIBZMQ_VERSION}")
message("            libsodium Version: ${LIBSODIUM_VERSION}")
message("         nlohman json Version: ${NLOHMANN_JSON_VERSION}")
message("json_schema_validator Version: ${JSON_SCHEMA_VALIDATOR_VERSION}")
message("                 curl Version: ${LOCAL_CURL_VERSION}")
message("              openssl Version: ${LOCAL_OPENSSL_VERSION}")
message("                boost Version: ${LOCAL_BOOST_VERSION}")
message("                 zlib Version: ${LOCAL_ZLIB_VERSION}")
message("")
message("Found Dependency Versions")
message("             protobuf Version: ${DATAFED_PROTOBUF_VERSION_ACTUAL}")
message("               protoc Version: ${DATAFED_PROTOBUF_COMPILER_VERSION_ACTUAL}")
message("               libzmq Version: ${DATAFED_ZEROMQ_VERSION_ACTUAL}")
message("            libsodium Version: ${DATAFED_ZEROMQ_SODIUM_VERSION}")
message("         nlohman json Version: ${DATAFED_JSON_VERSION_ACTUAL}")
message("json_schema_validator Version: ${DATAFED_JSON_SCHEMA_VERSION_ACTUAL}")
message("                 curl Version: ${DATAFED_CURL_VERSION_ACTUAL}")
message("              openssl Version: ${OPENSSL_VERSION}")
message("                boost Version: ${DATAFED_BOOST_VERSION_ACTUAL}")
message("                 zlib Version: ${DATAFED_ZLIB_VERSION_ACTUAL}")
message("")
message("Dependency Paths")
message("                 protobuf Library: ${DATAFED_PROTOBUF_LIBRARY_PATH}")
message("                protoc Executable: ${DATAFED_PROTOC_EXECUTABLE_PATH}")
message("             protobuf Include Dir: ${DATAFED_PROTOBUF_INCLUDE_PATH}")
message("                   libzmq Library: ${DATAFED_ZEROMQ_LIBRARY_PATH}")
message("                libsodium Library: ${DATAFED_ZEROMQ_SODIUM_LIBRARY_PATH}")
message("         nlohman json Include Dir: ${DATAFED_JSON_INCLUDE_PATH}")
message("json_schema_validator Include Dir: ${DATAFED_JSON_SCHEMA_INCLUDE_PATH}")
message("    json_schema_validator Library: ${DATAFED_JSON_SCHEMA_LIBRARY_PATH}")
message("                   crypto Library: ${OPENSSL_CRYPTO_LIBRARY}")
message("                     curl Library: ${DATAFED_CURL_LIBRARIES}")
message("                  openssl Library: ${OPENSSL_SSL_LIBRARY}")
message("          boost date_time Library: ${DATAFED_BOOST_DATE_TIME_LIBRARY_PATH}")
message("boost unit_test_framework Library: ${DATAFED_BOOST_UNIT_TEST_FRAMEWORK_LIBRARY_PATH}")
message("             boost system Library: ${DATAFED_BOOST_SYSTEM_LIBRARY_PATH}")
message("         boost filesystem Library: ${DATAFED_BOOST_FILESYSTEM_LIBRARY_PATH}")
message("    boost program_options Library: ${DATAFED_BOOST_PROGRAM_OPTIONS_LIBRARY_PATH}")
message("                     zlib Library: ${DATAFED_ZLIB_LIBRARIES}")
message("                   gssapi Library: ${DATAFED_GSSAPI_LIBRARIES}")
message("            globus_common Library: ${DATAFED_GLOBUS_COMMON_LIBRARIES}")
message("")


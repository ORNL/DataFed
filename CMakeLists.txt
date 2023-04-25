cmake_minimum_required (VERSION 3.17.0)
project( DataFed CXX C )
include(./cmake/Version.cmake)

#set(DataFed_MAJOR_VERSION 0)
#set(DataFed_MINOR_VERSION 2)
#set(DataFed_PATCH_VERSION 0)
set(DataFed_VERSION "${DATAFED_RELEASE_YEAR}.${DATAFED_RELEASE_MONTH}.${DATAFED_RELEASE_DAY}.${DATAFED_RELEASE_HOUR}.${DATAFED_RELEASE_MINUTE}")

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(THREADS_PREFER_PTHREAD_FLAG ON)

find_package(Threads REQUIRED)

# Globus version to compile repo server with
if( NOT DEFINED GLOBUS_VERSION )
  set(GLOBUS_VERSION  5)
endif()
OPTION(BUILD_REPO_SERVER "Build DataFed Repo Server" FALSE)
OPTION(BUILD_AUTHZ "Build DataFed Authz library" FALSE)
OPTION(BUILD_CORE_SERVER "Build DataFed Core Server" TRUE)
OPTION(BUILD_COMMON "Build DataFed common library" TRUE)
OPTION(BUILD_WEB_SERVER "Build DataFed Web Server" TRUE)
OPTION(BUILD_DOCS "Build documentation" TRUE)
OPTION(BUILD_PYTHON_CLIENT "Build python client" TRUE)
OPTION(BUILD_FOXX "Build Foxx" TRUE)
OPTION(BUILD_TESTS "Build Tests" TRUE)

set(INSTALL_REPO_SERVER ${BUILD_REPO_SERVER})
set(INSTALL_AUTHZ ${BUILD_AUTHZ})
set(INSTALL_CORE_SERVER ${BUILD_CORE_SERVER})
set(INSTALL_WEB_SERVER ${BUILD_WEB_SERVER})

# Off by default because running it on production would overwrite things on the database
if( NOT DEFINED ENABLE_FOXX_TESTS )
  set(ENABLE_FOXX_TESTS FALSE)
endif()
# To be safe this is by default turned off
if( NOT DEFINED ENABLE_END_TO_END_TESTS )
  set(ENABLE_END_TO_END_TESTS FALSE)
endif()

message( "Building for " ${CMAKE_BUILD_TYPE} )

if(CMAKE_MAKE_PROGRAM MATCHES "(make|gmake)")
    add_definitions( -Wall -Wextra )
endif()

# Set the path to the shell script
set(DATAFED_SH_PATH ${PROJECT_SOURCE_DIR}/config/datafed.sh)

if ( NOT EXISTS ${DATAFED_SH_PATH} )
  message(FATAL_ERROR "No datafed.sh config file was found at "
    "${DATAFED_SH_PATH} make sure you first run "
    "${CMAKE_CURRENT_SOURCE_DIR}/scripts/generate_datafed.sh")
endif()

# Create file glob here because need to be made visible here as well
file( GLOB ProtoFiles "${PROJECT_SOURCE_DIR}/common/proto/common/*.proto" )

# Use execute_process to source the shell script and get the value
execute_process(
  COMMAND bash -c "source ${DATAFED_SH_PATH} && echo \$DATAFED_INSTALL_PATH"
  OUTPUT_VARIABLE DATAFED_INSTALL_PATH
  OUTPUT_STRIP_TRAILING_WHITESPACE
  )

configure_file(
  "${CMAKE_CURRENT_SOURCE_DIR}/common/proto/common/Version.proto.in"
  "${CMAKE_CURRENT_SOURCE_DIR}/common/proto/common/Version.proto"
  @ONLY)

if( BUILD_WEB_SERVER )
  configure_file(
    "${CMAKE_CURRENT_SOURCE_DIR}/web/version.js.in"
    "${CMAKE_CURRENT_SOURCE_DIR}/web/version.js"
    @ONLY)

  configure_file(
    "${CMAKE_CURRENT_SOURCE_DIR}/web/package.json.in"
    "${CMAKE_CURRENT_SOURCE_DIR}/web/package.json"
    @ONLY)

  file(COPY ${ProtoFiles} DESTINATION "${CMAKE_CURRENT_SOURCE_DIR}/web/")
endif()

if ( BUILD_REPO_SERVER OR BUILD_CORE_SERVER OR BUILD_AUTHZ OR BUILD_COMMON) 

  include_directories( "/usr/include/globus" )

  if ( DEFINED ENV{BOOST_INC} AND DEFINED ENV{BOOST_LIB} )
          message( "BOOST_INC:" $ENV{BOOST_INC} )
          message( "BOOST_LIB:" $ENV{BOOST_LIB} )
          include_directories( $ENV{BOOST_INC} )
          link_directories( $ENV{BOOST_LIB} )
  else()
    find_package(Boost REQUIRED COMPONENTS unit_test_framework system filesystem
      program_options)
  endif()

  if ( BUILD_TESTS ) 
    include(CTest)
    ENABLE_TESTING()
    set(CMAKE_CTEST_ARGUMENTS "--output-on-failure")
  endif()
  ## load in pkg-config support
  find_package(PkgConfig)
  ## use pkg-config to get hints for 0mq locations
  pkg_check_modules(PC_ZeroMQ QUIET zmq)

  ## use the hint from above to find where 'zmq.h' is located
  find_path(ZeroMQ_INCLUDE_DIR
          NAMES zmq.h
          PATHS ${PC_ZeroMQ_INCLUDE_DIRS}
          )

  ## use the hint from about to find the location of libzmq
  find_library(ZeroMQ_LIBRARY
          NAMES zmq
          PATHS ${PC_ZeroMQ_LIBRARY_DIRS}
          )

  include_directories( ${ZeroMQ_INCLUDE_DIR} )
  link_directories( ${PC_ZeroMQ_LIBRARY_DIRS} )

  if ( DEFINED ENV{PBUF_INC_DIR} AND DEFINED ENV{PBUF_LIB_DIR})
          message( "PBUF_INC_DIR:" $ENV{PBUF_INC_DIR} )
          message( "PBUF_LIB_DIR:" $ENV{PBUF_LIB_DIR} )
          include_directories( $ENV{PBUF_INC_DIR} )
          link_directories( $ENV{PBUF_LIB_DIR} )
    set( Protobuf_LIBRARY $ENV{PBUF_LIB_DIR} )
  endif()

  find_package(Protobuf REQUIRED)
  set( PROTOBUF_IMPORT_DIRS ${PROTOBUF_INCLUDE_DIRS})
  message( TRACE "PROTOBUF_IMPORT_DIRS:" ${PROTOBUF_IMPORT_DIRS} )

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
  add_subdirectory( common )
endif()

if( BUILD_CORE_SERVER )
  find_package(nlohmann_json CONFIG REQUIRED)
  find_package(nlohmann_json_schema_validator CONFIG REQUIRED)
  find_package(OpenSSL REQUIRED)
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
  install( CODE "execute_process(COMMAND ${PROJECT_SOURCE_DIR}/scripts/install_lego_and_certificates.sh )")
  install( CODE "execute_process(COMMAND ${PROJECT_SOURCE_DIR}/scripts/install_core_service.sh )")
endif()

if( INSTALL_WEB_SERVER )
  install( FILES ${ProtoFiles} DESTINATION ${DATAFED_INSTALL_PATH}/web )
  install( DIRECTORY ${PROJECT_SOURCE_DIR}/web/static DESTINATION ${DATAFED_INSTALL_PATH}/web )
  install( DIRECTORY ${PROJECT_SOURCE_DIR}/web/views DESTINATION ${DATAFED_INSTALL_PATH}/web )
  install( CODE "execute_process(COMMAND ${PROJECT_SOURCE_DIR}/scripts/install_ws_service.sh )")
endif()

if( INSTALL_FOXX ) 
  install( CODE "execute_process(COMMAND ${PROJECT_SOURCE_DIR}/scripts/install_foxx.sh )")
endif()

if( ENABLE_END_TO_END_TESTS )
  if( BUILD_PYTHON_CLIENT )  
    add_subdirectory(tests/end-to-end)
  else()
    message(WARNING "Cannot run end-to-end tests requires building the python client which has not been enabled")
  endif()
endif()

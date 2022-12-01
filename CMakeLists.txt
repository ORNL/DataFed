cmake_minimum_required (VERSION 3.0.0)
project( DataFed CXX C )

set(DataFed_MAJOR_VERSION 0)
set(DataFed_MINOR_VERSION 2)
set(DataFed_PATCH_VERSION 0)
set(DataFed_VERSION ${DataFed_MAJOR_VERSION}.${DataFed_MINOR_VERSION}.${DataFed_PATCH_VERSION})

set(CMAKE_CXX_STANDARD 14)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(THREADS_PREFER_PTHREAD_FLAG ON)
set(CMAKE_SKIP_INTALL_ALL_DEPENDENCY TRUE)
find_package(Threads REQUIRED)

# Globus version to compile repo server with
set(GLOBUS_VERSION  5)

OPTION(BUILD_ALL "Build Everything" FALSE)
OPTION(BUILD_REPO_SERVER "Build DataFed Repo Server" ${BUILD_ALL})
OPTION(BUILD_AUTHZ "Build DataFed Authz library" ${BUILD_ALL})
OPTION(BUILD_CORE_SERVER "Build DataFed Core Server" ${BUILD_ALL})
OPTION(BUILD_DOCS "Build documentation" ${BUILD_ALL})
OPTION(BUILD_PYTHON_CLIENT "Build python client" ${BUILD_ALL})
OPTION(BUILD_FOXX "Build Foxx" ${BUILD_ALL})

message(STATUS "")
message(STATUS "BUILD_ALL:           ${BUILD_ALL}")
message(STATUS "BUILD_REPO_SERVER:   ${BUILD_REPO_SERVER}")
message(STATUS "BUILD_AUTHZ:         ${BUILD_AUTHZ}")
message(STATUS "BUILD_CORE_SERVER:   ${BUILD_CORE_SERVER}")
message(STATUS "BUILD_DOCS:          ${BUILD_DOCS}")
message(STATUS "BUILD_PYTHON_CLIENT: ${BUILD_PYTHON_CLIENT}")
message(STATUS "BUILD_FOXX:          ${BUILD_FOXX}")
message(STATUS "")

# CMake Policies - this one prevents boost from complaining
cmake_policy(SET "CMP0057" NEW)

# Specify where the binaries should be built so we can explicitly 
# copy them using custom install targets
set(CMAKE_ARCHIVE_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/lib)
set(CMAKE_LIBRARY_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/lib)
set(CMAKE_RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/bin)

if(CMAKE_MAKE_PROGRAM MATCHES "(make|gmake)")
    add_definitions( -Wall -Wextra )
endif()

# Create file glob here because need to be made visible here as well
file( GLOB ProtoFiles "${PROJECT_SOURCE_DIR}/common/proto/*.proto" )

if ( BUILD_REPO_SERVER OR BUILD_CORE_SERVER OR BUILD_AUTHZ ) 

  include_directories( "/usr/include/globus" )

  find_package(Threads)

  if ( DEFINED ENV{BOOST_INC} AND DEFINED ENV{BOOST_LIB} )
          message( "BOOST_INC:" $ENV{BOOST_INC} )
          message( "BOOST_LIB:" $ENV{BOOST_LIB} )
          include_directories( $ENV{BOOST_INC} )
          link_directories( $ENV{BOOST_LIB} )
  else()
    find_package(Boost REQUIRED PATHS /usr/local/lib COMPONENTS program_options
      system filesystem)
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

  add_subdirectory( common )

endif()

if( BUILD_CORE_SERVER )
  find_package(nlohmann_json CONFIG REQUIRED)
  find_package(nlohmann_json_schema_validator CONFIG REQUIRED)
  find_package(OpenSSL REQUIRED)
  # make target = install-core-server
  # make target = install-core-service
  add_subdirectory( core )
endif()

if( BUILD_REPO_SERVER OR BUILD_AUTHZ)
  # make target = install-repo-server
  # make target = install-repo-service
  # make target = install-authz
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

# make target install-web-server
add_custom_Target(install-web-server
  COMMAND ${CMAKE_COMMAND} -P ${PROJECT_SOURCE_DIR}/cmake/InstallWebServer.cmake
 ${PROJECT_SOURCE_DIR} 
  )
add_custom_Target(install-web-service
  COMMAND ${CMAKE_COMMAND} -P ${PROJECT_SOURCE_DIR}/cmake/InstallWebService.cmake
  DEPENDS install-web-server
  )

# make target install-foxx
add_custom_Target(install-foxx
  COMMAND ${CMAKE_COMMAND} -P ${PROJECT_SOURCE_DIR}/cmake/InstallFoxx.cmake
  )

# Install lego and certificats
add_custom_Target(install-lego-and-certificats
  COMMAND ${PROJECT_SOURCE_DIR}/scripts/install_lego_and_certificates.sh
  )

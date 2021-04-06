cmake_minimum_required (VERSION 3.0.0)
project( SDMS CXX C )

set(SDMS_MAJOR_VERSION 0)
set(SDMS_MINOR_VERSION 1)
set(SDMS_PATCH_VERSION 0)
set(SDMS_VERSION ${SDMS_MAJOR_VERSION}.${SDMS_MINOR_VERSION}.${SDMS_PATCH_VERSION})

set(CMAKE_CXX_STANDARD 11)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(THREADS_PREFER_PTHREAD_FLAG ON)

find_package(Threads REQUIRED)
#find_package(Protobuf REQUIRED)
#find_package(Zeromq REQUIRED)
#find_package(Boost REQUIRED)

OPTION(CLIENT_ONLY "Build client only" OFF)


message( "Building for " ${CMAKE_BUILD_TYPE} )

if(CMAKE_MAKE_PROGRAM MATCHES "(make|gmake)")
    add_definitions( -Wall -Wextra )
endif()

include_directories( "/usr/include/globus" )

if ( DEFINED ENV{RAPIDJSON_INC} )
        message( "RAPIDJSON_INC:" $ENV{RAPIDJSON_INC} )
        include_directories( $ENV{RAPIDJSON_INC} )
endif()

if ( DEFINED ENV{BOOST_INC} AND DEFINED ENV{BOOST_LIB} )
        message( "BOOST_INC:" $ENV{BOOST_INC} )
        message( "BOOST_LIB:" $ENV{BOOST_LIB} )
        include_directories( $ENV{BOOST_INC} )
        link_directories( $ENV{BOOST_LIB} )
else()
	find_package(Boost REQUIRED)
endif()

#if ( DEFINED ENV{ZMQ_INC_DIR} AND DEFINED ENV{ZMQ_LIB_DIR})
#	message( "ZMQ_INC_DIR:" $ENV{ZMQ_INC_DIR} )
#	message( "ZMQ_LIB_DIR:" $ENV{ZMQ_LIB_DIR} )
#	include_directories( $ENV{ZMQ_INC_DIR} )
#	link_directories( $ENV{ZMQ_LIB_DIR} )
#else()
#	find_package(ZeroMQ REQUIRED)
#endif()

## load in pkg-config support
find_package(PkgConfig)
## use pkg-config to get hints for 0mq locations
pkg_check_modules(PC_ZeroMQ QUIET zmq)

## use the hint from above to find where 'zmq.hpp' is located
find_path(ZeroMQ_INCLUDE_DIR
        NAMES zmq.hpp
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
add_subdirectory( test )
add_subdirectory( python )
add_subdirectory( facility )
IF(NOT CLIENT_ONLY)
	add_subdirectory( core )
	add_subdirectory( repository )
ENDIF(NOT CLIENT_ONLY)


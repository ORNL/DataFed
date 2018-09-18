cmake_minimum_required (VERSION 3.0.0)
project( SDMS CXX C )

set(SDMS_MAJOR_VERSION 0)
set(SDMS_MINOR_VERSION 1)
set(SDMS_PATCH_VERSION 0)
set(SDMS_VERSION ${SDMS_MAJOR_VERSION}.${SDMS_MINOR_VERSION}.${SDMS_PATCH_VERSION})

set(CMAKE_CXX_STANDARD 11)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

find_package(Protobuf REQUIRED)
find_package(Boost REQUIRED)

OPTION(CLIENT_ONLY "Build client only" OFF)

message( "Building for " ${CMAKE_BUILD_TYPE} )

if(CMAKE_MAKE_PROGRAM MATCHES "(make|gmake)")
    add_definitions( -Wall -Wextra )
endif()

include_directories( "/usr/include/globus" )

if ( DEFINED ENV{ZMQ_INC_DIR})
	message( "ZMQ_INC_DIR:" $ENV{ZMQ_INC_DIR} )
	include_directories( $ENV{ZMQ_INC_DIR} )
endif()

if ( DEFINED ENV{ZMQ_LIB_DIR})
	message( "ZMQ_LIB_DIR:" $ENV{ZMQ_LIB_DIR} )
	link_directories( $ENV{ZMQ_LIB_DIR}  )
endif()

if ( DEFINED ENV{PBUF_INC_DIR})
        message( "PBUF_INC_DIR:" $ENV{PBUF_INC_DIR} )
        include_directories( $ENV{PBUF_INC_DIR} )
endif()

if ( DEFINED ENV{PBUF_LIB_DIR})
        message( "PBUF_LIB_DIR:" $ENV{PBUF_LIB_DIR} )
        link_directories( $ENV{PBUF_LIB_DIR}  )
endif()

if(NOT CMAKE_BUILD_TYPE)
  set(CMAKE_BUILD_TYPE Release)
endif()

set(CMAKE_CXX_FLAGS "-Wall -Wextra -DUSE_DYNALOG")
set(CMAKE_CXX_FLAGS_DEBUG "-g")
set(CMAKE_CXX_FLAGS_RELEASE "-O3")

set(CMAKE_C_FLAGS "-Wall -Wextra")
set(CMAKE_C_FLAGS_DEBUG "-g")
set(CMAKE_C_FLAGS_RELEASE "-O3")

add_subdirectory( common )
add_subdirectory( facility )
IF(NOT CLIENT_ONLY)
	add_subdirectory( core )
	add_subdirectory( repository )
ENDIF(NOT CLIENT_ONLY)


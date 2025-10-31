cmake_minimum_required (VERSION 3.17.0)

# The below command will by default generate the proto files in this folder
# we want to place them in the binary folder in /proto/common
add_subdirectory(proto/common)

if( BUILD_COMMON )
  configure_file(
    "${CMAKE_CURRENT_SOURCE_DIR}/include/common/Version.hpp.in"
    "${CMAKE_CURRENT_BINARY_DIR}/include/common/Version.hpp"
    @ONLY)
  file( GLOB Sources "source/*.cpp"
    "source/credentials/*cpp"
    "source/communicators/*.cpp"
    "source/messages/*.cpp"
    "source/operators/*.cpp"
    "source/servers/*.cpp"
    "source/support/zeromq/*.cpp"
    "source/sockets/*.cpp")
  if(BUILD_SHARED_LIBS)
    add_library( common SHARED ${Sources})
    target_link_libraries( common PUBLIC ${DATAFED_BOOST_DATE_TIME_LIBRARY_PATH} protobuf::libprotobuf libzmq datafed-protobuf ${OPENSSL_SSL_LIBRARY} ${OPENSSL_CRYPTO_LIBRARY})
  else()
    add_library( common STATIC ${Sources})
    target_link_libraries( common PUBLIC ${DATAFED_BOOST_DATE_TIME_LIBRARY_PATH} protobuf::libprotobuf libzmq-static datafed-protobuf ${OPENSSL_SSL_LIBRARY} ${OPENSSL_CRYPTO_LIBRARY})
  endif()
  set_target_properties(common PROPERTIES POSITION_INDEPENDENT_CODE ON SOVERSION ${DATAFED_COMMON_LIB_MAJOR} VERSION ${DATAFED_COMMON_LIB_MAJOR}.${DATAFED_COMMON_LIB_MINOR}.${DATAFED_COMMON_LIB_PATCH} )
  target_include_directories( common PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/include )
  target_include_directories( common PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/include )
  target_include_directories( common PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/source )

  add_subdirectory(tests)
endif()

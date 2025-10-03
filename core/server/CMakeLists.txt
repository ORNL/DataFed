cmake_minimum_required (VERSION 3.17.0)

configure_file(
  "${CMAKE_CURRENT_SOURCE_DIR}/Version.hpp.in"
  "${CMAKE_CURRENT_SOURCE_DIR}/Version.hpp"
  @ONLY)

file( GLOB Sources "*.cpp" )
file( GLOB Main "main.cpp")
list(REMOVE_ITEM Sources files ${Main})

# Must be public for unit tests to import them
if(BUILD_SHARED_LIBS)
  add_library( datafed-core-lib SHARED ${Sources} )
  target_link_libraries( datafed-core-lib PRIVATE protobuf::libprotobuf Threads::Threads
    "${DATAFED_CURL_LIBRARIES}"
    "${DATAFED_ZLIB_LIBRARIES}"  ${DATAFED_BOOST_LIBRARIES} libzmq nlohmann_json_schema_validator -ldl )
else()
  add_library( datafed-core-lib STATIC ${Sources} )
  target_link_libraries( datafed-core-lib PRIVATE protobuf::libprotobuf Threads::Threads
    "${DATAFED_CURL_LIBRARIES}"
    "${DATAFED_ZLIB_LIBRARIES}"  "${DATAFED_BOOST_LIBRARIES}" libzmq-static
    "${DATAFED_JSON_SCHEMA_LIBRARY_PATH}" -ldl )
endif()
target_include_directories( datafed-core-lib PUBLIC ${CMAKE_CURRENT_SOURCE_DIR} )
set_target_properties(datafed-core-lib PROPERTIES POSITION_INDEPENDENT_CODE ON)
target_link_libraries( datafed-core-lib PUBLIC common datafed-protobuf "${OPENSSL_SSL_LIBRARY}" "${OPENSSL_CRYPTO_LIBRARY}")
add_executable( datafed-core ${Main} )
target_link_libraries( datafed-core datafed-core-lib )

add_subdirectory(tests)

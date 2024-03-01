cmake_minimum_required (VERSION 3.17.0)

configure_file(
  "${CMAKE_CURRENT_SOURCE_DIR}/Version.hpp.in"
  "${CMAKE_CURRENT_SOURCE_DIR}/Version.hpp"
  @ONLY)

file( GLOB Sources "*.cpp" )
file( GLOB Main "main.cpp")
list(REMOVE_ITEM Sources files ${Main})
add_library( datafed-core-lib STATIC ${Sources} )
set_target_properties(datafed-core-lib PROPERTIES POSITION_INDEPENDENT_CODE ON)

# Must be public for unit tests to import them
target_include_directories( datafed-core-lib PUBLIC ${CMAKE_CURRENT_SOURCE_DIR} )
target_link_libraries( datafed-core-lib PUBLIC common datafed-protobuf )
target_link_libraries( datafed-core-lib PRIVATE protobuf::libprotobuf Threads::Threads
  "${CURL_LIBRARIES}" "${OPENSSL_SSL_LIBRARY}" "${OPENSSL_CRYPTO_LIBRARY}" "${ZLIB_LIBRARIES}"
  ${Boost_LIBRARIES} libzmq-static nlohmann_json_schema_validator -ldl )

add_executable( datafed-core ${Main} )
target_link_libraries( datafed-core datafed-core-lib )

add_subdirectory(tests)

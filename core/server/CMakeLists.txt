cmake_minimum_required (VERSION 3.0.0)

file( GLOB Sources "*.cpp" )

add_executable( datafed-core ${Sources} )
add_dependencies( datafed-core common )
target_link_libraries( datafed-core common -lprotobuf -lpthread -lcrypto -lssl -lcurl ${Boost_LIBRARIES} -lzmq -lnlohmann_json_schema_validator )

target_include_directories( datafed-core PRIVATE ${CMAKE_CURRENT_SOURCE_DIR} )

# Refactor 

file( GLOB Sources_refactor "src/protocols/http_clients/*cpp")
#list(APPEND ${Sources_refactor} "src/protocols/http_clients/*cpp")
add_library(datafed-core-refactor ${Sources_refactor})
target_include_directories( datafed-core-refactor PUBLIC "${CMAKE_CURRENT_SOURCE_DIR}/src/protocols/http_clients" )
target_link_libraries( datafed-core-refactor ${Boost_LIBRARIES} common -lcurl )

add_subdirectory(tests)

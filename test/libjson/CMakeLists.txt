cmake_minimum_required (VERSION 3.0.0)

file( GLOB Sources "*.cpp" )

add_executable( libjson-test ${Sources} )
add_dependencies( libjson-test common )
target_link_libraries( libjson-test common -lprotobuf -lpthread -lcrypto -lssl -lcurl -lboost_program_options -lzmq )

target_include_directories( libjson-test PRIVATE ${CMAKE_CURRENT_SOURCE_DIR} )

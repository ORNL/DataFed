cmake_minimum_required (VERSION 3.0.0)

file( GLOB Sources "*.cpp" )
file( GLOB Main "main.cpp")
list(REMOVE_ITEM Sources files ${Main})
message("Main ${Main}")
message("Sources ${Sources}")
add_library( datafed-core-lib STATIC ${Sources} )
set_target_properties(datafed-core-lib PROPERTIES POSITION_INDEPENDENT_CODE ON)
target_include_directories( datafed-core-lib PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/common/include )
target_link_libraries( datafed-core-lib OpenSSL::Crypto common -lprotobuf -lpthread -lcurl -lboost_program_options -lzmq -lnlohmann_json_schema_validator )

add_executable( datafed-core ${Main})
#add_dependencies( datafed-core datafed-core-lib )
target_link_libraries( datafed-core datafed-core-lib )
#target_include_directories( datafed-core PRIVATE ${CMAKE_CURRENT_SOURCE_DIR} )
include_directories(.)

add_subdirectory(tests)

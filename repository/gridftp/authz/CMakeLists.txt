cmake_minimum_required (VERSION 3.0.0)

file( GLOB Sources "*.c" )

add_library( sdmsauthz SHARED ${Sources} )
SET_TARGET_PROPERTIES( sdmsauthz PROPERTIES LINKER_LANGUAGE C )
target_link_libraries( sdmsauthz -lcurl )

target_include_directories( sdmsauthz PRIVATE ${CMAKE_CURRENT_SOURCE_DIR} )

cmake_minimum_required (VERSION 3.0.0)

# Copy README file to build dir
configure_file( ${CMAKE_CURRENT_SOURCE_DIR}/README ${CMAKE_CURRENT_BINARY_DIR} COPYONLY )

# Copy package files to build dir
file( GLOB PkgFiles ${CMAKE_CURRENT_SOURCE_DIR}/*.py )
foreach(file ${PkgFiles})
    configure_file(${file} ${CMAKE_CURRENT_BINARY_DIR} COPYONLY )
endforeach()

# Make scripts build dir
file(MAKE_DIRECTORY ${CMAKE_CURRENT_BINARY_DIR}/scripts)

# Copy scripts to build dir
file( GLOB ScriptFiles ${CMAKE_CURRENT_SOURCE_DIR}/scripts/* )
foreach(file ${ScriptFiles})
    configure_file(${file} ${CMAKE_CURRENT_BINARY_DIR}/scripts COPYONLY )
endforeach()

add_subdirectory( datafed )

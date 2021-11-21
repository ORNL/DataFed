cmake_minimum_required (VERSION 3.0.0)

# Copy doc_source/source tree into build directory

# THis should be done during make stage
file( COPY ${CMAKE_CURRENT_SOURCE_DIR}/source DESTINATION ${CMAKE_CURRENT_BINARY_DIR} )
file( MAKE_DIRECTORY ${CMAKE_CURRENT_BINARY_DIR}/docs )

add_custom_target( docs )
add_dependencies( docs pydatafed )

# Build CLI command reference w/ datafed CLI and place in local doc source directory
# Then run sphinx-build to make doc html

add_custom_command( TARGET docs POST_BUILD
    COMMAND echo "Preparing docs build directories"
    COMMAND rm -rf ${CMAKE_SOURCE_DIR}/docs
    COMMAND mkdir ${CMAKE_SOURCE_DIR}/docs
    COMMAND mkdir -p ${CMAKE_CURRENT_BINARY_DIR}/source/_generated
    COMMAND echo "Generating API docs"
    COMMAND ${CMAKE_COMMAND} -E env "PYTHONPATH=${CMAKE_BINARY_DIR}/python/datafed_pkg/" ${CMAKE_BINARY_DIR}/python/datafed_pkg/scripts/datafed gendoc > ${CMAKE_CURRENT_BINARY_DIR}/source/_generated/cli_python_cmd_ref.rst
    COMMAND echo "Generating docs HTML"
    COMMAND sphinx-build -b html ${CMAKE_CURRENT_BINARY_DIR}/source ${CMAKE_SOURCE_DIR}/docs 
    COMMAND touch ${CMAKE_SOURCE_DIR}/docs/.nojekyll )

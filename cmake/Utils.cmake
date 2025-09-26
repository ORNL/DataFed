

# Function is designed to pull the value of a key value pair file i.e.
#
# file.sh
#
# PROTO_VERSION="v2.1.0"
# ZMQ_VERSION="v5.53.3"
#
# Read the script first
# 
# file(READ "file.sh" SCRIPT_CONTENT)
# get_version_from_script(${SCRIPT_CONTENT} "PROTO_VERSION" value)
# message("$value")
#
# Will output "v2.1.0"
function(get_version_from_script INPUT_STRING PATTERN_TO_MATCH OUTPUT_VERSION)
  string(REGEX MATCH "${PATTERN_TO_MATCH}=(.*)" MATCHED_PART "${INPUT_STRING}")
  if(MATCHED_PART)
    string(STRIP "${CMAKE_MATCH_1}" SANITIZED_OUTPUT_VERSION)
    string(REGEX REPLACE "\"\n.*" "" NEWLINE_REMOVED "${SANITIZED_OUTPUT_VERSION}")
    string(REPLACE "\"" "" REMOVED_QUOTES "${NEWLINE_REMOVED}")
    set(${OUTPUT_VERSION} "${REMOVED_QUOTES}" PARENT_SCOPE)
  endif()
endfunction()

# Function will get exported value from a shell script
#
# i.e. if datafed.sh has 
#
# datafed.sh
# export MY_NAME="Barry"
#
# set(DATAFED_CONFIG_SH "config/datafed.sh") 
# get_value_from_datafed_sh "MY_NAME" name)
# message("$name")
#
# Will output "Barry"
function(get_value_from_datafed_sh INPUT_KEY OUTPUT_VALUE)
  execute_process(
    COMMAND bash "-c" "source ${DATAFED_CONFIG_SH} && echo \$${INPUT_KEY}"
    OUTPUT_VARIABLE OUTPUT_VAR
    OUTPUT_STRIP_TRAILING_WHITESPACE
    )
  set(${OUTPUT_VALUE} "${OUTPUT_VAR}" PARENT_SCOPE)
endfunction()

# Function will get exported value from a shell script
#
# i.e. if dependencies.sh has
#
# dependencies.sh
# export MY_NAME="Barry"
#
# set(DATAFED_CONFIG_SH "external/DataFedDependencies/config/dependencies.sh")
# get_value_from_dependencies_sh "MY_NAME" name)
# message("$name")
#
# Will output "Barry"
function(get_value_from_dependencies_sh INPUT_KEY OUTPUT_VALUE)
  execute_process(
    COMMAND bash "-c" "source ${DATAFED_CONFIG_SH} && echo \$${INPUT_KEY}"
    OUTPUT_VARIABLE OUTPUT_VAR
    OUTPUT_STRIP_TRAILING_WHITESPACE
    )
  set(${OUTPUT_VALUE} "${OUTPUT_VAR}" PARENT_SCOPE)
endfunction()


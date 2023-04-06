cmake_minimum_required(VERSION 3.17.0)
# Why are we running this as a CMake script
#
# The client, server and shell monitoring process need to be run concurrently

message("Running in folder ${CMAKE_ARGV3}")

find_program(TCPDUMP_CMD NAMES tcpdump)
find_program(TIMEOUT_CMD NAMES timeout)

set(BUFFER_TIME_SECONDS 1)
MATH(EXPR MAX_RUN_TIME "${BUFFER_TIME_SECONDS}+1")

# Insecure test should be run first to make sure the communication is occuring
# as expected
execute_process(
  COMMAND ${CMAKE_ARGV3}/test_tcp_secure_client -p "${BUFFER_TIME_SECONDS}" --insecure
  COMMAND ${CMAKE_ARGV3}/test_tcp_secure_server -p "${BUFFER_TIME_SECONDS}" --insecure
  COMMAND ${CMAKE_ARGV3}/test_tcp_insecure.sh ${TCPDUMP_CMD} ${TIMEOUT_CMD} ${MAX_RUN_TIME}
  RESULTS_VARIABLE STATUS1
  )

if("1" IN_LIST STATUS1)
  message(FATAL_ERROR "Insecure tcp test failed, this indicates a network connectivity issues")
endif()

execute_process(
  COMMAND ${CMAKE_ARGV3}/test_tcp_secure_client -p "${BUFFER_TIME_SECONDS}"
  COMMAND ${CMAKE_ARGV3}/test_tcp_secure_server -p "${BUFFER_TIME_SECONDS}"
  COMMAND ${CMAKE_ARGV3}/test_tcp_secure.sh ${TCPDUMP_CMD} ${TIMEOUT_CMD} ${MAX_RUN_TIME}
  RESULTS_VARIABLE STATUS2
  )

if("1" IN_LIST STATUS2)
  message(FATAL_ERROR "Secure tcp test failed, this indicates a problem with the security encryption")
endif()



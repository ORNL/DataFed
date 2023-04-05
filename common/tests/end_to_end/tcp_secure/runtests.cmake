execute_process(
  COMMAND ${CMAKE_ARGV4}/end_to_end_test_tcp_secure_client
  COMMAND ${CMAKE_ARGV4}/end_to_end_test_tcp_secure_server 
  RESULTS_VARIABLE VAR1
  )

message("VAR1 ${VAR1}")

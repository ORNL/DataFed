#!/bin/bash

# If no arguments are provided assume command paths have not been passed in
if [ $# -eq 0 ]; then
  TIMEOUT_CMD="timeout"
  TCPDUMP_CMD="tcpdump"
  MAX_TEST_TIME_SEC=2
else
  TCPDUMP_CMD=$1
  TIMEOUT_CMD=$2
  MAX_TEST_TIME_SEC=$3
fi

# Check that pcap group exists and the user is part of it
if [ $(getent group pcap) ]; then
  if id -nG "$USER" | grep -qw "pcap"; then
    echo "CONTINUE"
  else
    echo "SKIPPING - user does not belong to pcap group cannot run tcp_secure test"
    exit 0
  fi
else
  echo "SKIPPING - pcap group does not exist cannot run tcp_secure test"
  exit 0
fi

echo
echo "Running with:"
echo "TCPDUMP:       ${TCPDUMP_CMD}"
echo "TIMEOUT:       ${TIMEOUT_CMD}"
echo "MAX_TEST_TIME: ${MAX_TEST_TIME_SEC}"

# Grab the first 30 packets sent on the loop back interface (127.0.0.1) and port 7515
match=$("${TIMEOUT_CMD}" "${MAX_TEST_TIME_SEC}" "${TCPDUMP_CMD}" -vvv -A port 7515 -i lo | grep token)

echo "Content of grep ${match}"
# If '.magic_token' is returned from the network sniffer then we know that
# the encryption is not working
if [[ "${match}" == ".magic_token" ]]; then
  echo "FAILED - the connection is insecure we were able to pull out the token"
  exit 1
else
  echo "SUCCESS - the connection is secure we were unable to pull out the token"
  exit 0
fi

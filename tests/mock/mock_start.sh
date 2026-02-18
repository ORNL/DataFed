#!/bin/bash
SCRIPT=$(realpath "${BASH_SOURCE[0]}")
SOURCE=$(dirname "$SCRIPT")

if [ -f ./mock.log ]; then
  rm ./mock.log
fi
"$SOURCE/../mock_core/datafed-mock-core" --gen-keys
"$SOURCE/../mock_core/datafed-mock-core" >mock.log 2>&1 &
sleep 2

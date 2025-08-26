#!/bin/bash

if [ -f ./mock.log ]; then
  rm ./mock.log
fi
./datafed-mock-core --gen-keys
./datafed-mock-core >mock.log 2>&1 &
sleep 2

#!/bin/bash
echo "Stopping Mock Server"
kill $(cat ./server.pid) && rm -f ./server.pid
cat ./mock.log

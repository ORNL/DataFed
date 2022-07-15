#!/bin/bash

set -euf -o pipefail

sudo add-apt-repository ppa:longsleep/golang-backports
sudo apt-get update
sudo apt-get install golang-go

#This was verified for go 1.17
export GO111MODULE=on
go install github.com/go-acme/lego/v4/cmd/lego@latest

#creates a folder go/bin where lego is installed
export PATH=$PATH:~/go/bin

# This should create a folder in ~/.lego/certificates, that contains the
# certificate files you need, we are going to copy them over to the
# /opt/datafed/keys folder
#
# NOTE: To run lego you will need to make sure that nothing else is using port 443
# it will be unable to run if the datafed webserver is also running.
sudo lego --email="brownjs@ornl.gov" --domains="datafed-server-test.ornl.gov" --tls run

# Create the folder
if [ ! -d "/opt/datafed/keys" ]
then
	sudo mkdir -p /opt/datafed/keys
fi

# copy the certificates over
sudo cp ~/.lego/certificates/datafed-server-test.ornl.gov.crt ~/.lego/certificates/datafed-server-test.ornl.gov.key /opt/datafed/keys/


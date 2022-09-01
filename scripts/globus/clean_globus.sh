#!/bin/bash

gateway_name="CADES GCS Gateway"
collection_name="CADES GCS DataFed Testing Mapped"

# Removing the mapped collection will also remove any guest collections

collection_line=$( globus-connect-server collection list | grep "$collection_name" )
if [ ! -z "$collection_line" ]
then
  uuid_of_collection=$( globus-connect-server collection list | grep "$collection_name" | awk '{ print $1 }')
  globus-connect-server collection delete "$uuid_of_collection"
fi

gateway_line=$(globus-connect-server storage-gateway list | grep "$gateway_name" )
if [ ! -z "$gateway_line" ]
then

  spaces_in_name=$(echo $gateway_name | awk '{print gsub("[ \t]",""); exit}')
  columns=$(( $spaces_in_name + 3 ))
  uuid_of_storage_gateway=$( globus-connect-server storage-gateway list | grep "$gateway_name" | awk -v col=$columns '{ print $col }')

# Check if it already exists
  globus-connect-server storage-gateway delete "${uuid_of_storage_gateway}"
fi

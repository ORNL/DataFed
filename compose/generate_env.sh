#!/bin/bash

if [ -f ".env" ]
then
  echo ".env already exist! Will not overwrite!"
  exit 1
fi


cat << EOF > ".env"
EOF

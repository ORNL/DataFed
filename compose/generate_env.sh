#!/bin/bash

if [ -f ".env" ]
then
  echo ".env already exist! Will not overwrite!"
  exit 1
fi


cat << EOF > ".env"
DATAFED_DOMAIN="" # The domain of the metadata core web server
ARANGO_ROOT_PASSWORD=""
DATAFED_USER89_PASSWORD="" # For End to end testing
DATAFED_REPO_FORM_PATH="" # Where the repo form is located also needed for testing
EOF

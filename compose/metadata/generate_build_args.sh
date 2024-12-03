#!/bin/bash

# Description
#
# The point of this file is to generate a .build-args file. The .build-args
# file contains variables that are used when building the docker images.
#
# Example
#
# ./generate_build_args.sh

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")

BUILD_ARG_FILE="$SOURCE/.build-args"
if [ $# -gt 0 ]; then
  # Do not check if file already exists becuase other generate scripts
  # from a different repo might have already put their args in the file
  # and calling this script might be the second step. Where this step would
  # be appending to an existing file.
  BUILD_ARG_FILE="$1/.build-args"
else

  # Force the user to manaully rm the file to avoid accidental overwrites.
  if [ -f "$BUILD_ARG_FILE" ]
  then
    echo "$BUILD_ARG_FILE already exist! Will not overwrite!"
    exit 0
  fi
fi

# Needs to append to the ./build-args.sh file not overwrite.
cat << EOF >> "$BUILD_ARG_FILE"
BASE_IMAGE=ubuntu:focal
EOF

#!/bin/bash

set -euf -o pipefail

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath "${SOURCE}/../../")

BUILD_ARG_FILE="$SOURCE/.build-args"
if [ $# -gt 0 ]; then
    # Do not check if file already exists becuase other generate scripts
    # from a different repo might have already put their args in the file
    # and calling this script might be the second step. Where this step would
    # be appending to an existing file.
    BUILD_ARG_FILE="$1/.build-args"
fi

# Generate arg list

if [ ! -f "$BUILD_ARG_FILE" ]
then
  echo "Missing .build-args file, please run generate_build_args.sh first."
fi

# Load the variables from the build_args
. "$BUILD_ARG_FILE"

"${PROJECT_ROOT}/scripts/compose_build_images.sh" -m -b "$BASE_IMAGE"

#!/bin/bash
# This script is used to rename the dependency libraries that DataFed uses to make them easier to copy between containers by reading the dependency_versions.sh script and renaming them accordingly.
# credit to chatgpt for this script

source "$BUILD_DIR/scripts/dependency_versions.sh"

# Define the list of supported libraries and their environment variable names
supported_libraries=("protobuf" \
  "protoc" \
  "libsodium" \
  "libzmq" \
  "boost_program_options" \
  "boost_filesystem" \
  "libssl" \
  "libcrypto")

library_env_variables=("DATAFED_DYNAMIC_LIBRARY_PROTOBUF_VERSION" \
  "DATAFED_DYNAMIC_LIBRARY_PROTOBUF_VERSION" \
  "DATAFED_LIB_LIBSODIUM_VERSION" \
  "DATAFED_LIB_LIBZMQ_VERSION" \
  "DATAFED_BOOST" \
  "DATAFED_BOOST" \
  "DATAFED_OPENSSL"\
  "DATAFED_CRYPTO_VERSION")

library_names=("libprotobuf.a" \
  "libprotoc.a" \
  "libsodium.a" \
  "libzmq.a" \
  "libboost_program_options.so" \
  "libboost_filesystem.so" \
  "libssl.a" \
  "libcrypto.a")

library_locations=("$LIB_DIR" "$LIB_DIR" "$LIB_DIR" "$LIB_DIR" "/lib/x86_64-linux-gnu" "/lib/x86_64-linux-gnu")

LIBRARIES_BASE_PATH="/libraries"

# Function to print the list of supported libraries
print_supported_libraries() {
  echo "Supported libraries:"
  for library in "${supported_libraries[@]}"; do
    echo "  $library"
  done
}

# Check the number of arguments
if [ "$#" -ne 2 ]; then
  echo "Usage: $0 library_name (to/from)"
  print_supported_libraries
  exit 1
fi

library_name="$1"
direction="$2"

# Check if the provided library name is in the list of supported libraries
if [[ ! " ${supported_libraries[@]} " =~ " ${library_name} " ]]; then
  echo "Unsupported library: $library_name"
  exit 1
fi

# Find the index of the library name in the array
index=0
for ((i = 0; i < ${#supported_libraries[@]}; i++)); do
  if [ "${supported_libraries[i]}" == "$library_name" ]; then
    index=$i
    break
  fi
done

# Get the library version from the corresponding environment variable
library_version="${!library_env_variables[index]}"
library_name="${library_names[index]}"
library_location="${library_locations[index]}"

# Define source and destination filenames
source_filename=""
destination_filename=""

if [ "$direction" == "from" ]; then
  # Copy from versioned to generic filename
  source_filename="$library_location/$library_name"
  destination_filename="$LIBRARIES_BASE_PATH/$library_name"
  if [[ "$library_name" == *".so" ]]; then
    if [ "${library_version}" == "" ]; then
      source_filename="$source_filename"
    else
      source_filename="$source_filename.$library_version"
    fi
  fi
elif [ "$direction" == "to" ]; then
  # Copy from generic to versioned filename
  source_filename="$LIBRARIES_BASE_PATH/$library_name"
  destination_filename="$LIB_DIR/$library_name"
  if [[ "$library_name" == *".so" ]]; then
    if [ "${library_version}" == "" ]; then
      destination_filename="$destination_filename"
    else
      destination_filename="$destination_filename.$library_version"
    fi
  fi
else
  echo "Invalid direction. Use 'to' or 'from'."
  exit 1
fi

# Check if the source file exists
if [ ! -e "$source_filename" ]; then
  echo "Source file '$source_filename' not found."
  exit 1
fi

# Copy the file
cp "$source_filename" "$destination_filename"
if [ $? -eq 0 ]; then
  echo "Successfully copied '$source_filename' to '$destination_filename'."
else
  echo "Failed to copy '$source_filename' to '$destination_filename'."
fi
if [ "$direction" == "to" ]; then
  if [ "${library_version}" == "" ]; then
    ln -s "$LIB_DIR/$library_name" "$LIB_DIR/$library_name"
  else
    major_version=$(echo "$library_version" | awk -F'.' '{ print $1 }')
    ln -s "$LIB_DIR/$library_name.$library_version" "$LIB_DIR/$library_name.$major_version"
    ln -s "$LIB_DIR/$library_name.$library_version" "$LIB_DIR/$library_name"
    echo "linking $LIB_DIR/$library_name.$major_version -> $LIB_DIR/$library_name.$library_version"
    echo "linking $LIB_DIR/$library_name -> $LIB_DIR/$library_name.$library_version"
  fi
fi

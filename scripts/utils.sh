#!/bin/bash
SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")

if [ -z "${PROJECT_ROOT}" ]; then
  PROJECT_ROOT=$(realpath "${SOURCE}/..")
fi

echo "PROJECT ROOT $PROJECT_ROOT"

export_dependency_version_numbers() {
  # Get the content of the function and remove comments
  variables=$(cat "${PROJECT_ROOT}/scripts/dependency_versions.sh")

  local content="$(echo "${variables}" | sed '/^$/d;/^#/d')"

  # Extract variable assignments from the content
  local assignments=$(echo "$content" | grep -Eo '\b[a-zA-Z_][a-zA-Z_0-9]*="[^\"]*"')

  echo "Variables are $variables"
  echo "Content is $content"
  echo "Assignments is $assignments"
  # Loop through each assignment, export the variable
  # Note: This may override existing variables
  for assignment in $assignments; do
    echo "export $assignment"
    export "$assignment"
  done
}

empty_command() {
  "$@"
}

# The purpose of this function is to detect the sudo command
# if it exists use it, if we are running as root set SUDO_CMD to empty_command
# empty_command is needed so that I can do this where sudo doesn't exist
#
# "$SUDO_CMD" apt install curl
#
# If running as root this will expand to
#
# empty_command apt install curl
#
# which expands to
#
# apt install curl
#
# If I left SUDO_CMD blank i.e. "" apt install curl bash would complain
sudo_command() {
  if [ "$(id -u)" -eq 0 ]; then
    export SUDO_CMD="empty_command" # Ignore sudo running as root
  else
    # Check if sudo is available
    if command -v sudo &>/dev/null; then
      export SUDO_CMD=$(command -v sudo)
      return 0
    else
      echo "Error: This script requires sudo but sudo is not installed." >&2
      echo "You are not running as root!" >&2
      exit 1
    fi
    exit $? # Exit with the same status as the sudo command
  fi
}

# Only recognized x.x.x format where all "x" are integers
# Returns true if first version is greater or equal to second version
#
# semantic_version_compatible "1.2.3" "1.1.8"
# echo $?
# Should print 1
#
# semantic_version_compatible "1.2.3" "1.2.8"
# echo $?
# Should print 0
#
#semantic_version_compatible "1.1.1" "1.1.1"
#echo "Should return true 1.1.1 >= 1.1.1"
#
#semantic_version_compatible "1.2.1" "1.1.1"
#echo "Should return true 1.2.1 >= 1.1.1"
#
#semantic_version_compatible "1.2.1" "3.1.1"
#echo "Should return false 1.2.1 >= 3.1.1"
#
#semantic_version_compatible "v1.2.1" "v3.1.1"
#echo "Should return false v1.2.1 >= v3.1.1"
#
#semantic_version_compatible "v1.2.1" "1.1.1"
#echo "Should return true v1.2.1 >= 1.1.1"

semantic_version_compatible() {
  local VER1="$1"
  local VER2="$2"

  # Remove any preceding v from version i.e. v1.1.2
  VER1=$(echo "$VER1" | sed 's/v//g')
  VER2=$(echo "$VER2" | sed 's/v//g')

  maj_1=$(echo "$VER1" | sed 's/\./ /g' | awk '{print $1}')
  min_1=$(echo "$VER1" | sed 's/\./ /g' | awk '{print $2}')
  patch_1=$(echo "$VER1" | sed 's/\./ /g' | awk '{print $3}')
  maj_2=$(echo "$VER2" | sed 's/\./ /g' | awk '{print $1}')
  min_2=$(echo "$VER2" | sed 's/\./ /g' | awk '{print $2}')
  patch_2=$(echo "$VER2" | sed 's/\./ /g' | awk '{print $3}')

  if [ "$maj_1" -gt "$maj_2" ]; then
    return 1
  elif [ "$maj_1" -lt "$maj_2" ]; then
    return 0
  fi

  if [ "$min_1" -gt "$min_2" ]; then
    return 1
  elif [ "$min_1" -lt "$min_2" ]; then
    return 0
  fi

  if [ "$patch_1" -gt "$patch_2" ]; then
    return 1
  elif [ "$patch_1" -lt "$patch_2" ]; then
    return 0
  fi
  return 1
}

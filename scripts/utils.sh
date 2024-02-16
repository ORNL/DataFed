#!/bin/bash
SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")

if [ -z "${PROJECT_ROOT}" ]
then
  PROJECT_ROOT=$(realpath ${SOURCE}/..)
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
			if command -v sudo &> /dev/null; then
					export SUDO_CMD=$(command -v sudo)
			else
					echo "Error: This script requires sudo but sudo is not installed." >&2
					echo "You are not running as root!" >&2
					exit 1
			fi
			exit $?  # Exit with the same status as the sudo command
	fi
}

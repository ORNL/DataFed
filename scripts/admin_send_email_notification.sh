#!/bin/bash
# Description
#
# This script is designed to query the database and get all user emails and
# output them to a file. As well as print them to the terminal.
#
# -e has been removed so that if an error occurs the PASSWORD File is deleted and not left lying around
# -u has been removed because we have no guarantees that the env variables are defined
set -f -o pipefail

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath ${SOURCE}/..)

Help() {
  echo "$(basename $0) Will set up a configuration file for the core server"
  echo
  echo "Syntax: $(basename $0) [-h|u|n|g]"
  echo "options:"
  echo "-h, --help                           Print this help message."
  echo "-u, --user-email-address-file        The path to the email adresses the notification "
  echo "                                     will be sent to."
  echo "-n, --notification-file              The path to the file that will be used as a notification."
  echo "-g, --generate-template-notification Will generate a template file that can be used to create"
  echo "                                     a notification, if this option is chosen no emails will"
  echo "                                     be sent. The path must be provided with this flag."

  echo "NOTE: Do not run this script with sudo!"
}

VALID_ARGS=$(getopt -o hu:n:g: --long 'help',user-email-address-file:,notification-file:,generate-template-notification: -- "$@")
if [[ $? -ne 0 ]]; then
  exit 1
fi
eval set -- "$VALID_ARGS"
while [ : ]; do
  case "$1" in
  -h | --help)
    Help
    exit 0
    ;;
  -u | --user-email-address-file)
    local_USER_EMAIL_ADDRESSES=$2
    shift 2
    ;;
  -n | --notification-file)
    local_NOTIFICATION_FILE=$2
    shift 2
    ;;
  -g | --generate-template-notification)
    local_GENERATE_TEMPLATE=$2
    shift 2
    ;;
  --)
    shift
    break
    ;;
  \?) # incorrect option
    echo "Error: Invalid option"
    exit
    ;;
  esac
done

if [ ! -z "$local_GENERATE_TEMPLATE" ]; then
  echo "Generating Template at $local_GENERATE_TEMPLATE"
  echo "From: datafed@email.ornl.gov" >"$local_GENERATE_TEMPLATE"
  echo "Subject: DataFed Maintenance Notification" >>"$local_GENERATE_TEMPLATE"
  echo "" >>"$local_GENERATE_TEMPLATE"
  echo "Message Body" >>"$local_GENERATE_TEMPLATE"
  echo "" >>"$local_GENERATE_TEMPLATE"
  echo "Best," >>"$local_GENERATE_TEMPLATE"
  echo "" >>"$local_GENERATE_TEMPLATE"
  echo "DataFed Admins" >>"$local_GENERATE_TEMPLATE"
  cat "$local_GENERATE_TEMPLATE"
  echo
  echo "Exiting"
  exit 0
fi

ERROR_DETECTED=0
if [ -z "$local_USER_EMAIL_ADDRESSES" ]; then
  echo "Error Email address file is not defined, this is a required argument"
  echo "      This variable can be set using the command line option -u, --user-email-address-file."
  ERROR_DETECTED=1
fi

# Check if the variable is empty
if [ -z "$local_NOTIFICATION_FILE" ]; then
  # Variable is empty or not defined
  echo "Error Notification file is not defined, this is a required argument"
  echo "      This variable can be set using the command line option -n, --notification-file."
  ERROR_DETECTED=1
fi

if [ "$ERROR_DETECTED" == "1" ]; then
  exit 1
fi

notification=$(cat $local_NOTIFICATION_FILE)
emails=$(cat $local_USER_EMAIL_ADDRESSES)
echo "Sending Notification:"
echo
echo "$notification"
echo
echo "To the following recipients:"

# Assumes that each email address appears on its own line
# hence we set the separator to the newline character
IFS=$'\n'

count=0
read -r -d '' -a email_array <<<"$emails"
for email in "${email_array[@]}"; do
  sendmail --verbose "$email" <<EOF
To: $email
$notification
EOF
  if [ $? -eq 0 ]; then
    echo "Email sent successfully to $email."
  else
    echo "Failed to send email to $email skipping."
  fi
done

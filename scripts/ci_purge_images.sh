#!/bin/bash

set -euf
# The purpose of this script is to prevent the number of images built on a
# VM from taking over to much storage, here we can set the number of GB, that
# we will allow to be stored on the VM, after which we will start deleting
# the oldest one

# Max allowed size of all images in GB
if [ -z "${DATAFED_CI_PURGE_THRESHOLD:-}" ]; then
  local_DATAFED_CI_PURGE_THRESHOLD="15"
else
  local_DATAFED_CI_PURGE_THRESHOLD=$(printenv DATAFED_CI_PURGE_THRESHOLD)
fi

echo "Docker Purge Threshold set to: $local_DATAFED_CI_PURGE_THRESHOLD"

get_size_of_all_images_in_GB() {
  declare -g total_image_size_number="0"
  docker_size_stats=$(docker system df --format "{{.Type}} {{.Size}}")
  total_image_size=$(echo "${docker_size_stats}" | head -1 | awk '{print $2}')
  echo "Image size is $total_image_size"
  if [ ! -z "${total_image_size}" ]; then
    if [ "${total_image_size: -2}" = "GB" ]; then
      # Removes GB postfix
      total_image_size_number="${total_image_size%??}"
      # Removes any floating point pieces i.e. 2.4 = 2 so that it is interpreted
      # as an integer
      total_image_size_number="${total_image_size_number%%.*}"
    elif [ "${total_image_size: -2}" = "MB" ]; then
      # Removes MB postfix
      total_image_size_number="${total_image_size%??}"
      # Removes any floating point pieces i.e. 2.4 = 2 so that it is interpreted
      # as an integer
      total_image_size_number="${total_image_size_number%%.*}"
      # Convert to GB
      total_image_size_number=$(("$total_image_size_number" / 1024))
    elif [ "${total_image_size: -2}" = "kB" ]; then
      # Removes kB postfix
      total_image_size_number="${total_image_size%??}"
      # Removes any floating point pieces i.e. 2.4 = 2 so that it is interpreted
      # as an integer
      total_image_size_number="${total_image_size_number%%.*}"
      # Convert to GB
      total_image_size_number=$(("$total_image_size_number" / 1048576))
    elif [ "${total_image_size: -1}" = "B" ]; then
      # Removes B postfix
      total_image_size_number="${total_image_size%?}"
      # Removes any floating point pieces i.e. 2.4 = 2 so that it is interpreted
      # as an integer
      total_image_size_number="${total_image_size_number%%.*}"
      # Convert to GB
      total_image_size_number=$(("$total_image_size_number" / 1073741824))
    else
      echo "Size reported by 'docker system df --format {{.Type}} {{.Size}}' is"
      echo "given in unsupported format $docker_size_stats"
      echo "Purge script expects format 'X.X<unit>' or 'X<units>' i.e. '4.5GB', '8MB', '0B'"
      exit 1
    fi
  fi
}

purge_oldest_image() {
  oldest_image_id=$(docker image list --format "{{.ID}}" | tail -n1)
  docker image rm "$oldest_image_id" -f
}

get_size_of_all_images_in_GB

while [ "$total_image_size_number" -gt "$local_DATAFED_CI_PURGE_THRESHOLD" ]; do
  purge_oldest_image
  get_size_of_all_images_in_GB
done

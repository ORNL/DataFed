#!/bin/bash

# The purpose of this script is to prevent the number of images built on a 
# VM from taking over to much storage, here we can set the number of GB, that
# we will allow to be stored on the VM, after which we will start deleting
# the oldest one

# Max allowed size of all images in GB
THRESHOLD_IN_GB="5"

get_size_of_all_images_in_GB() {
	declare -g total_image_size_number="0"
	docker_size_stats=$(docker system df  --format "{{.Type}} {{.Size}}")
	echo "docker_size_stats"
	total_image_size=$(echo "${docker_size_stats}" | head -1 | awk '{print $2}'  )
	echo "Image size is $total_image_size"
	if [ ! -z  "${total_image_size}" ]
	then
		if [ "${total_image_size: -2}" = "GB" ]
		then
			total_image_size_number="${total_image_size%??}"
			total_image_size_number="${total_image_size%%.*}"
		fi
	fi
}

purge_oldest_image() {
	oldest_image_id=$(docker image list --format "{{.ID}}" | tail -n1)
	docker image rm "$oldest_image_id" -f
}

get_size_of_all_images_in_GB

while [ "$total_image_size_number" -gt "$THRESHOLD_IN_GB" ]
do
	purge_oldest_image
	get_size_of_all_images_in_GB
done


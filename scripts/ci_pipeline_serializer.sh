#!/bin/bash

set -eu

Help()
{
  echo "$(basename $0) Will check to make sure that there are currently"
  echo "               no other running pipelines before proceeding. This must"
  echo "               be used in conjunction with a job with a resource group."
  echo
  echo "Syntax: $(basename $0) [-h|a]"
  echo "options:"
  echo "-h, --help                        Print this help message"
  echo "-a, --gitlab-api-token            The GitLab API token for checking the"
  echo "                                  status of a pipeline."
}

GITLAB_DATAFED_REPO_API_TOKEN=$(printenv GITLAB_DATAFED_REPO_API_TOKEN || true)
if [ -z "$GITLAB_DATAFED_REPO_API_TOKEN" ]
then
  local_GITLAB_DATAFED_REPO_API_TOKEN=""
else
  local_GITLAB_DATAFED_REPO_API_TOKEN="$GITLAB_DATAFED_REPO_API_TOKEN"
fi

VALID_ARGS=$(getopt -o ha: --long 'help',gitlab-api-token: -- "$@")
if [[ $? -ne 0 ]]; then
      exit 2;
fi
eval set -- "$VALID_ARGS"
while [ : ]; do
  case "$1" in
    -h | --help)
        Help
        exit 0
        ;;
    -a | --gitlab-api-token)
        local_GITLAB_DATAFED_REPO_API_TOKEN=$2
        shift 2
        ;;
    --) shift; 
        break 
        ;;
    \?) # incorrect option
        echo "Error: Invalid option"
        exit;;
  esac
done

if [ -z "$local_GITLAB_DATAFED_REPO_API_TOKEN" ]
then
  echo "The GitLab token for accessing the API of the DataFed repo is missing."
  echo "It is a required parameter."
  exit 2
fi

# NOTE: Many of the functions below are taken from here: https://gitlab.com/alexandrchumakin/wait-pipeline/-/blob/main/wait-pipelines.sh?ref_type=heads
#
# Will grab all of the pipelines with the provided status
#
# Example
#
# get_pipelines "status"
get_pipelines()
{
  status=$1
  pipelines=$(curl --silent --noproxy '*' --header "PRIVATE-TOKEN:$local_GITLAB_DATAFED_REPO_API_TOKEN" "$CI_API_V4_URL/projects/$CI_PROJECT_ID/pipelines?status=$status")
  echo $pipelines
}

# Will count all of the pipelines with the "running" status and the "pending" status
get_pipelines_count()
{
  pipelines=$(get_pipelines running)
  active_count=$(echo $pipelines | jq '. | length')
  pending_jobs=$(get_pending_jobs_count)
  result=$(($active_count+$pending_jobs))
  echo $result
}

get_pending_jobs_count()
{
  pending_pipelines=$(get_pipelines pending)

  jobs_count=0
  echo "$pending_pipelines" | jq '.[].id' | while read -r pipeline_id; do
    finished_jobs_len=$(curl --silent --noproxy '*' --header "PRIVATE-TOKEN:$local_GITLAB_DATAFED_REPO_API_TOKEN" "$CI_API_V4_URL/projects/$CI_PROJECT_ID/pipelines/$pipeline_id/jobs?scope[]=failed&scope[]=success" | jq '. | length')
    if [ $finished_jobs_len -gt 0 ]; then ((jobs_count=jobs_count+1)); fi
  done

  echo $jobs_count
}

start_time=$(date +%s)
pipelines_count=$(get_pipelines_count)

# Code execution will loop here until there is only one running pipeline... this one. At which point the job 
# should proceed and thus release the resource group.
printf "Currently $pipelines_count active pipeline$([ $pipelines_count -gt 1 ] && echo "s were" || echo " was") found\n"
until [ $pipelines_count -eq 1 ]
do
  printf '.'
  pipelines_count=$(get_pipelines_count)
  sleep 5
done

end_time=$(date +%s)
total_time=$(( end_time - start_time ))
minutes=$((total_time / 60))
seconds=$((total_time - 60*minutes))
final_time=$(echo "$([ $minutes -ne 0 ] && echo "$minutes minutes, " || echo "")$seconds seconds")
printf "\nLooks like it's only 1 active pipeline at this moment. Proceeding after $final_time\n"

#!/bin/bash

set -u

Help()
{
  echo "$(basename $0) Will determine if a Open Stack VM exists if not it will"
  echo " triger a GitLab pipeline to create the VM. It requires that you "
  echo "provide the Open Stack VM ID"
  echo
  echo "Syntax: $(basename $0) [-h|i|s|c|g|a]"
  echo "options:"
  echo "-h, --help                        Print this help message"
  echo "-i, --app-credential-id           The application credentials id for"
  echo "                                  accessing the open stack API. If env"
  echo "                                  variable OS_APP_ID exists it will use"
  echo "                                  it."
  echo "-s, --app-credential-secret       The application credential secret for"
  echo "                                  accessing the open stack API. If the "
  echo "                                  env variable OS_APP_SECRET exists it"
  echo "                                  can be used."
  echo "-c, --compute-instance-id         The id of the instance we are trying"
  echo "                                  to check."
  echo "-g, --gitlab-trigger-token        The GitLab token for restarting the CI"
  echo "                                  pipeline to generate the VMs."
  echo "-a, --gitlab-api-token            The GitLab API token for checking the"
  echo "                                  status of a pipeline."
}

OS_APP_ID=$(printenv OS_APP_ID || true)
if [ -z "$OS_APP_ID" ]
then
  local_OS_APP_ID=""
else
  local_OS_APP_ID="$OS_APP_ID"
fi

OS_APP_SECRET=$(printenv OS_APP_SECRET || true)
if [ -z "$OS_APP_SECRET" ]
then
  # This is the port that is open and listening on"
  # the core server."
  local_OS_APP_SECRET=""
else
  local_OS_APP_SECRET="$OS_APP_SECRET"
fi

GITLAB_DATAFEDCI_REPO_TRIGGER_TOKEN=$(printenv GITLAB_DATAFEDCI_REPO_TRIGGER_TOKEN || true)
if [ -z "$GITLAB_DATAFEDCI_REPO_TRIGGER_TOKEN" ]
then
  local_GITLAB_DATAFEDCI_REPO_TRIGGER_TOKEN=""
else
  local_GITLAB_DATAFEDCI_REPO_TRIGGER_TOKEN="$GITLAB_DATAFEDCI_REPO_TRIGGER_TOKEN"
fi

GITLAB_DATAFEDCI_REPO_API_TOKEN=$(printenv GITLAB_DATAFEDCI_REPO_API_TOKEN || true)
if [ -z "$GITLAB_DATAFEDCI_REPO_API_TOKEN" ]
then
  local_GITLAB_DATAFEDCI_REPO_API_TOKEN=""
else
  local_GITLAB_DATAFEDCI_REPO_API_TOKEN="$GITLAB_DATAFEDCI_REPO_API_TOKEN"
fi

COMPUTE_INSTANCE_ID=""

VALID_ARGS=$(getopt -o hi:s:c:g:a: --long 'help',app-credential-id:,app-credential-secret:,compute-instance-id:,gitlab-trigger-token:,gitlab-api-token: -- "$@")
if [[ $? -ne 0 ]]; then
      exit 1;
fi
eval set -- "$VALID_ARGS"
while [ : ]; do
  case "$1" in
    -h | --help)
        Help
        exit 0
        ;;
    -i | --app-credential-id)
        local_OS_APP_ID=$2
        shift 2
        ;;
    -s | --app-credential-secret)
        local_OS_APP_SECRET=$2
        shift 2
        ;;
    -c | --compute-instance-id)
        COMPUTE_INSTANCE_ID=$2
        shift 2
        ;;
    -g | --gitlab-trigger-token)
        local_GITLAB_DATAFEDCI_REPO_TRIGGER_TOKEN=$2
        shift 2
        ;;
    -a | --gitlab-api-token)
        local_GITLAB_DATAFEDCI_REPO_API_TOKEN=$2
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

if [ -z "$local_OS_APP_ID" ]
then
  echo "The open stack application credential id has not been defined this is"
  echo " a required parameter."
  exit 1
fi

if [ -z "$local_OS_APP_SECRET" ]
then
  echo "The open stack application credential secret has not been defined this is"
  echo " a required parameter."
  exit 1
fi

if [ -z "$COMPUTE_INSTANCE_ID" ]
then
  echo "The open stack compute instance id has not been defined this is"
  echo " a required parameter."
  exit 1
fi

if [ -z "$local_GITLAB_DATAFEDCI_REPO_TRIGGER_TOKEN" ]
then
  echo "The GitLab token for triggering the CI pipeline has not been defined it"
  echo "is a required parameter."
  exit 1
fi

if [ -z "$local_GITLAB_DATAFEDCI_REPO_API_TOKEN" ]
then
  echo "The GitLab token for accessing the API of the datafedci repo."
  echo "It is a required parameter."
  exit 1
fi

data=$(curl -s --retry 5 -i -X POST \
  -H "Content-Type: application/json" \
  -d "{
        \"auth\": {
            \"identity\": {
                \"methods\": [\"application_credential\"],
                \"application_credential\": {
                    \"id\": \"$OS_APP_ID\",
                    \"secret\": \"$OS_APP_SECRET\"
                }
            }
        }
    }" \
      https://orc-open.ornl.gov:13000/v3/auth/tokens) 
error_code=$?
if [ "$error_code" == "6" ]
then
  echo "Unable to connect to Open Stack API endpoints, make sure you are"
  echo "connected to the network"
  exit 1
fi

# Make sure jq is installed
jq_path=$(which jq)
if [ -z "$jq_path" ]
then
  echo "jq command not found exiting!"
  exit 1
fi

body=$(echo $data | sed 's/^.*{\"token/{\"token/' )

compute_url=$(echo "$body" | jq '.token.catalog[] | select(.name=="nova") |.endpoints[] | select(.interface=="public") | .url ')
sanitize_compute_url=$(echo $compute_url | sed 's/\"//g')

header=$(echo "$data" | sed 's/{\"token.*//')
subject_token=$(echo "$data" | grep "X-Subject-Token" | awk '{print $2}' )

sanitize_subject_token=${subject_token:0:268}

compute_instances=$(curl -s --retry 5 -H "X-Auth-Token: $sanitize_subject_token" "$sanitize_compute_url/servers/detail" | jq)

################################################################################
# Check 1 - Do VMs Exist
################################################################################

# Make sure the instances exist if not we should run the pipeline

CI_DATAFED_VMS=$(echo "$compute_instances" | jq '.servers[].id')

CI_DATAFED_VMS_SANITIZED=($(echo "$CI_DATAFED_VMS" | sed 's/\"//g'))

found_vm_id_in_list="0"
for ID in "${CI_DATAFED_VMS_SANITIZED[@]}"
do
  if [ "$ID" == "$COMPUTE_INSTANCE_ID" ]
  then
    echo "Found: $COMPUTE_INSTANCE_ID"
    found_vm_id_in_list="1"
    break
  fi
done

if [ "$found_vm_id_in_list" == "0" ]
then
    echo "VM: $COMPUTE_INSTANCE_ID is Unhealthy, does not exist, triggering pipeline."

    #datafedci_repo_api_trigger_to_run_ci_pipeline
    # Here we need to make a request to the code.ornl.gov at datafedci
    gitlab_response=$(curl -s --retry 5 --request POST \
      --form token="$local_GITLAB_DATAFEDCI_REPO_TRIGGER_TOKEN" \
      --form ref="main" \
      "https://code.ornl.gov/api/v4/projects/10830/trigger/pipeline")
    echo "Gilab response"
    echo "$gitlab_response"
    pipeline_id=$(echo "$gitlab_response" | jq '.id' )
    echo "id is $pipeline_id"

    gitlab_response_status=$(curl -s --retry 5 --request GET \
      --form token="$local_GITLAB_DATAFEDCI_REPO_TRIGGER_TOKEN" \
      --form ref="main" \
      "https://code.ornl.gov/api/v4/projects/10830/pipelines/$pipeline_id")
    echo "Gitlab reponse status"
    echo "$gitlab_response_status"
    MAX_COUNT=40
    count=0
    while [ "$found_vm_id_in_list" == "0" ]
    do
      echo "$count Waiting for pipeline to start VM ..."
      sleep 30s
      # Run while loop and sleep until VM shows up or timeout is hit
      compute_instances=$(curl -s --retry 5 -H "X-Auth-Token: $sanitize_subject_token" "$sanitize_compute_url/servers/detail" | jq)
      CI_DATAFED_VMS=$(echo "$compute_instances" | jq '.servers[].id')
      CI_DATAFED_VMS_SANITIZED=($(echo "$CI_DATAFED_VMS" | sed 's/\"//g'))
      found_vm_id_in_list="0"
      for ID in "${CI_DATAFED_VMS_SANITIZED[@]}"
      do
        if [ "$ID" == "$COMPUTE_INSTANCE_ID" ]
        then
          echo "Found: $COMPUTE_INSTANCE_ID"
          found_vm_id_in_list="1"
          break
        fi
      done
      count=$(($count + 1))

      if [ "$count" == "$MAX_COUNT" ]
      then
        echo "Exceeded time limit!"
        exit 1
      fi
    done
fi

################################################################################
# Check 2 - Is the VM running
################################################################################
# This will need to be passed to the GitLab repo and set as an env variable instance

INSTANCE_STATUS=$(echo "$compute_instances" | jq --arg COMPUTE_INSTANCE_ID "$COMPUTE_INSTANCE_ID" '.servers[] | select(.id==$COMPUTE_INSTANCE_ID) | .status ')

INSTANCE_STATUS_SANITIZED=$(echo "$INSTANCE_STATUS" | sed 's/\"//g')

# If the status is not ACTIVE trigger the GitLab pipeline
VM_IS_ACTIVE=1
if [[ "$INSTANCE_STATUS_SANITIZED" != "ACTIVE" ]]
then
  VM_IS_ACTIVE=0
fi

if [ "$VM_IS_ACTIVE" -eq "0" ]
then
  echo "VM: $COMPUTE_INSTANCE_ID is Unhealthy triggering pipeline."

  #datafedci_repo_api_trigger_to_run_ci_pipeline
  # Here we need to make a request to the code.ornl.gov at datafedci
  gitlab_response=$(curl -s --retry 5 --request POST \
    --form token="$local_GITLAB_DATAFEDCI_REPO_TRIGGER_TOKEN" \
    --form ref="main" \
    "https://code.ornl.gov/api/v4/projects/10830/trigger/pipeline")

    echo "Gilab response"
    echo "$gitlab_response"

    pipeline_id=$(echo "$gitlab_response" | jq '.id' )
    echo "id is $pipeline_id"

    gitlab_response_status=$(curl -s --retry 5 --request GET \
      --form token="$local_GITLAB_DATAFEDCI_REPO_TRIGGER_TOKEN" \
      --form ref="main" \
      "https://code.ornl.gov/api/v4/projects/10830/pipelines/$pipeline_id")
    echo "Gitlab reponse status"
    echo "$gitlab_response_status"
 

    MAX_COUNT=40
    count=0
    while [ "$VM_IS_ACTIVE" -eq "0" ]
    do

      echo "$count Waiting for pipeline to start VM ..."
      sleep 30s
      compute_instances=$(curl -s --retry 5 -H "X-Auth-Token: $sanitize_subject_token" "$sanitize_compute_url/servers/detail" | jq)
      INSTANCE_STATUS=$(echo "$compute_instances" | jq --arg COMPUTE_INSTANCE_ID "$COMPUTE_INSTANCE_ID" '.servers[] | select(.id==$COMPUTE_INSTANCE_ID) | .status ')

      INSTANCE_STATUS_SANITIZED=$(echo "$INSTANCE_STATUS" | sed 's/\"//g')

      # If the status is not ACTIVE trigger the GitLab pipeline
      VM_IS_ACTIVE=1
      if [[ "$INSTANCE_STATUS_SANITIZED" != "ACTIVE" ]]
      then
        VM_IS_ACTIVE=0
      fi
      count=$(($count + 1))

      if [ "$count" == "$MAX_COUNT" ]
      then
        echo "Exceeded time limit!"
        exit 1
      fi
    done

else
  echo "VM: $COMPUTE_INSTANCE_ID is Healthy."
  exit 0
fi


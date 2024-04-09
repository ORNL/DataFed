import globus_sdk
from globus_sdk import AuthClient, GroupsClient
from globus_sdk.scopes import GroupsScopes
import subprocess
import sys
import os
import utils

# Define your client ID and client secret
CLIENT_ID = "f8d0afca-7ac4-4a3c-ac05-f94f5d9afce8"  # NATIVE

# The Globus project the GCS endpoint will be created in
if os.getenv("DATAFED_GCS_ROOT_NAME") is not None:
    DATAFED_GCS_ROOT_NAME = os.getenv("DATAFED_GCS_ROOT_NAME")
else:
    DATAFED_GCS_ROOT_NAME = "DataFed Repo"

if os.getenv("DATAFED_GLOBUS_PROJECT_NAME") is not None:
    PROJECT_NAME = os.getenv("DATAFED_GLOBUS_PROJECT_NAME")
else:
    PROJECT_NAME = DATAFED_GCS_ROOT_NAME + " Project"

# This is for confidential client
if os.getenv("DATAFED_GLOBUS_CLIENT_NAME") is not None:
    CLIENT_NAME = os.getenv("DATAFED_GLOBUS_CLIENT_NAME")
else:
    CLIENT_NAME = DATAFED_GCS_ROOT_NAME + " Setup Client"

# Name of the client secret used by the confidential client
if os.getenv("DATAFED_GLOBUS_CRED_NAME") is not None:
    CRED_NAME = os.getenv("DATAFED_GLOBUS_CRED_NAME")
else:
    CRED_NAME = DATAFED_GCS_ROOT_NAME + " Cred"

# Name of the file where we will store confidential client credentials
if os.getenv("DATAFED_GLOBUS_CRED_FILE_PATH") is not None:
    CRED_FILE_PATH = os.getenv("DATAFED_GLOBUS_CRED_FILE_PATH")
else:
    CRED_FILE_PATH = "./client_cred.json"

# Name to give to endpoint
if os.getenv("DATAFED_GLOBUS_ENDPOINT_NAME") is not None:
    ENDPOINT_NAME = os.getenv("DATAFED_GLOBUS_ENDPOINT_NAME")
else:
    ENDPOINT_NAME = DATAFED_GCS_ROOT_NAME + " Endpoint"

# Path to deployment key
if os.getenv("DATAFED_GLOBUS_DEPLOYMENT_KEY_PATH") is not None:
    DEPLOYMENT_KEY_PATH = os.getenv("DATAFED_GLOBUS_DEPLOYMENT_KEY_PATH")
else:
    DEPLOYMENT_KEY_PATH = "./deployment-key.json"


client = globus_sdk.NativeAppAuthClient(CLIENT_ID)
# manage_projects scope to create a project
group_scope = GroupsScopes.make_mutable("all")
client.oauth2_start_flow(
    requested_scopes="openid profile email "
    "urn:globus:auth:scope:auth.globus.org:manage_projects "
    "urn:globus:auth:scope:auth.globus.org:view_identities " + str(group_scope),
    refresh_tokens=True,
)

authorize_url = client.oauth2_get_authorize_url(query_params={"prompt": "login"})
print("Please go to this URL and login: \n", authorize_url)
auth_code = input("Please enter the authorization code: ")

token_response = client.oauth2_exchange_code_for_tokens(auth_code)

print("Token Response is")

print(token_response)

refresh_token_auth = token_response.by_resource_server["auth.globus.org"][
    "refresh_token"
]
refresh_token_groups = token_response.by_resource_server["groups.api.globus.org"][
    "refresh_token"
]

rt_authorizer = globus_sdk.RefreshTokenAuthorizer(refresh_token_auth, client)

rt_authorizer_groups = globus_sdk.RefreshTokenAuthorizer(refresh_token_groups, client)
ac_rt = AuthClient(authorizer=rt_authorizer)
gr_rt = GroupsClient(authorizer=rt_authorizer_groups)

userinfo = ac_rt.oauth2_userinfo()

# Will get the primary email and id
identity_id = userinfo["sub"]
email = userinfo["email"]
username = userinfo["preferred_username"]
organization = userinfo["identity_provider_display_name"]

# check if project exists already
project_exists = utils.projectExists(ac_rt, PROJECT_NAME)

if project_exists:

    projects = ac_rt.get_projects()
    project_id = utils.getProjectId(projects, PROJECT_NAME)
    print(f"project id is {project_id}")
    clients_in_project = utils.getClientsInProject(ac_rt, project_id)

    if len(clients_in_project) == 0:
        print(
            "No clients were detected in the project we can just delete the"
            "project and be done."
        )
    else:

        # Check if the deployment key exists if it does read it and verify that the
        # client exists for the globus connect server if it does not then we will
        # call the setup command

        gcs_id_from_deployment_key = utils.getGCSClientIDFromDeploymentFile(
            DEPLOYMENT_KEY_PATH
        )

        valid_key = utils.isGCSDeploymentKeyValid(
            ac_rt, project_id, ENDPOINT_NAME, gcs_id_from_deployment_key
        )

        all_gcs_client_ids = utils.getAllGCSClientIds(ac_rt, project_id, ENDPOINT_NAME)

        if valid_key is False and len(all_gcs_client_ids) > 0:
            print(
                "Looks like gcs client does not exist in the cloud"
                f" for the project: {project_id}."
                "Maybe you have the wrong deployment key cloud_ids {all_gcs_client_ids}"
                f"deployment key id {gcs_id_from_deployment_key}"
            )
            sys.exit(1)

        if gcs_id_from_deployment_key is None and len(all_gcs_client_ids) > 0:
            print(
                "Looks like deployment key does not exist, please either "
                "add the correct deployment."
                f" cloud_ids {all_gcs_client_ids}"
                f"deployment key id {gcs_id_from_deployment_key}"
            )
            sys.exit(1)

        if len(all_gcs_client_ids) > 0:

            if utils.command_exists("globus-connect-server") is False:
                print(
                    "Cannot create deployment key, we require globus-connect-server to be installed"
                )
                sys.exit(1)

            else:

                print(
                    "Now that we know a GCS instance exists we have to make sure"
                    "we have valid credentials to run the globus-connect-server command"
                    "non interatively, this means we have to create credentials and a"
                    "client if they don't exist and when we are done with everything"
                    "delete them."
                )

                client_id, client_secret = utils.createClient(
                    ac_rt, CLIENT_NAME, project_id, CRED_NAME, CRED_FILE_PATH
                )

                ac_rt.update_project(project_id, admin_ids=[identity_id, client_id])

                bash_command = f'GCS_CLI_CLIENT_ID="{client_id}" GCS_CLI_CLIENT_SECRET="{client_secret}" '
                bash_command += "globus-connect-server endpoint cleanup "
                bash_command += f' --deployment-key "{DEPLOYMENT_KEY_PATH}" '
                bash_command += " --agree-to-delete-endpoint"
                print("Bash command to run")
                print(bash_command)

                proc = subprocess.Popen(
                    bash_command,
                    stdin=subprocess.PIPE,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    universal_newlines=True,
                    shell=True,
                    text=True,
                )

                output, error = proc.communicate(input="yes\n")

                # Print the output and error, if any
                print(output)
                print(error)

        # Now we can try to delete the remaining clients that are in the project
        # Get all of the clients that are not gcs clients and delete them

        utils.deleteAllNonGCSClients(ac_rt, project_id)

    # CLOSE - if len(clients_in_project) == 0:

    # Try to remove project this will only work if there are no other clients in
    # the project
    print(f"Attempting to remove project {project_id}")
    project_remove = ac_rt.delete_project(project_id)
    print(project_remove)

# Now trying to clean up groups
group_display_name = f"{DATAFED_GCS_ROOT_NAME} Group"

utils.deleteGroup(gr_rt, group_display_name)

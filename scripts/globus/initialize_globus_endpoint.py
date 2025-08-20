import globus_sdk
import utils
from globus_sdk import AuthClient, GroupsClient
from globus_sdk.scopes import GroupsScopes

import os
import sys

# Hard coded Native Client ID
CLIENT_ID = "f8d0afca-7ac4-4a3c-ac05-f94f5d9afce8"

# The Globus project the GCS endpoint will be created in
default_DATAFED_GCS_ROOT_NAME = "DataFed Repo"
DATAFED_GCS_ROOT_NAME = os.getenv(
    "DATAFED_GCS_ROOT_NAME", default_DATAFED_GCS_ROOT_NAME
)
if len(DATAFED_GCS_ROOT_NAME) == 0:
    CRED_FILE_PATH = default_DATAFED_GCS_ROOT_NAME

default_PROJECT_NAME = DATAFED_GCS_ROOT_NAME + " Project"
PROJECT_NAME = os.getenv("DATAFED_GLOBUS_PROJECT_NAME", default_PROJECT_NAME)
if len(PROJECT_NAME) == 0:
    PROJECT_NAME = default_PROJECT_NAME

# This is for confidential client
default_CLIENT_NAME = DATAFED_GCS_ROOT_NAME + " Setup Client"
CLIENT_NAME = os.getenv("DATAFED_GLOBUS_CLIENT_NAME", default_CLIENT_NAME)
if len(CLIENT_NAME) == 0:
    CLIENT_NAME = default_CLIENT_NAME

# Name of the client secret used by the confidential client
default_CRED_NAME = DATAFED_GCS_ROOT_NAME + " Cred"
CRED_NAME = os.getenv("DATAFED_GLOBUS_CRED_NAME", default_CRED_NAME)
if len(CRED_NAME) == 0:
    CRED_NAME = default_CRED_NAME

# Name of the file where we will store confidential client credentials
default_CRED_FILE_PATH = os.path.abspath("./globus/client_cred.json")
CRED_FILE_PATH = os.getenv("DATAFED_GLOBUS_CRED_FILE_PATH", default_CRED_FILE_PATH)
if len(CRED_FILE_PATH) == 0:
    CRED_FILE_PATH = default_CRED_FILE_PATH

# Name to give to endpoint
default_ENDPOINT_NAME = DATAFED_GCS_ROOT_NAME + " Endpoint"
ENDPOINT_NAME = os.getenv("DATAFED_GLOBUS_ENDPOINT_NAME", default_ENDPOINT_NAME)
if len(ENDPOINT_NAME) == 0:
    ENDPOINT_NAME = default_ENDPOINT_NAME

# Path to deployment key
default_DEPLOYMENT_KEY_PATH = os.path.abspath("./globus/deployment-key.json")
DEPLOYMENT_KEY_PATH = os.getenv(
    "DATAFED_GLOBUS_DEPLOYMENT_KEY_PATH", default_DEPLOYMENT_KEY_PATH
)
if len(DEPLOYMENT_KEY_PATH) == 0:
    DEPLOYMENT_KEY_PATH = default_DEPLOYMENT_KEY_PATH

# Path to deployment key
default_DATAFED_GLOBUS_CONTROL_PORT = "443"
DATAFED_GLOBUS_CONTROL_PORT = os.getenv(
    "DATAFED_GLOBUS_CONTROL_PORT", default_DATAFED_GLOBUS_CONTROL_PORT
)
if len(DATAFED_GLOBUS_CONTROL_PORT) == 0:
    DATAFED_GLOBUS_CONTROL_PORT = default_DATAFED_GLOBUS_CONTROL_PORT

DATAFED_GLOBUS_SUBSCRIPTION = os.getenv("DATAFED_GLOBUS_SUBSCRIPTION")
if len(DATAFED_GLOBUS_SUBSCRIPTION) == 0:
    DATAFED_GLOBUS_SUBSCRIPTION = None

client = globus_sdk.NativeAppAuthClient(CLIENT_ID)

# manage_projects scope to create a project
# view_identities to user information for creating GCS server

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
# Extract the token
refresh_token_auth = token_response.by_resource_server["auth.globus.org"][
    "refresh_token"
]
refresh_token_groups = token_response.by_resource_server["groups.api.globus.org"][
    "refresh_token"
]
rt_authorizer = globus_sdk.RefreshTokenAuthorizer(refresh_token_auth, client)

rt_authorizer_groups = globus_sdk.RefreshTokenAuthorizer(refresh_token_groups, client)
# auth_client_refresh_token
ac_rt = AuthClient(authorizer=rt_authorizer)
gr_rt = GroupsClient(authorizer=rt_authorizer_groups)

userinfo = ac_rt.oauth2_userinfo()
# Will get the primary email and id
identity_id = userinfo["sub"]
email = userinfo["email"]
username = userinfo["preferred_username"]
print("username")
print(username)
print("userinfo")
print(userinfo)
organization = userinfo["identity_provider_display_name"]

# Need to determine the project uuid
if utils.projectExists(ac_rt, PROJECT_NAME) is False:
    project_id = utils.createProject(ac_rt, PROJECT_NAME, userinfo)
else:
    project_id = utils.getProjectId(ac_rt, PROJECT_NAME)

count = utils.countProjects(ac_rt, PROJECT_NAME)

if count != 1:
    print(
        "Something is wrong there should be at least one project with name"
        f" {PROJECT_NAME} instead there are {count} with that name"
    )
    sys.exit(1)

print(f"Project id is {project_id}")
client_id, client_secret = utils.createClient(
    ac_rt, CLIENT_NAME, project_id, CRED_NAME, CRED_FILE_PATH
)

# Add the globus client as an admin to the project
ac_rt.update_project(project_id, admin_ids=[identity_id, client_id])

# Get clients in project
clients_in_project = utils.getClientsInProject(ac_rt, project_id)

# Check if the deployment key exists if it does read it and verify that the
# client exists for the globus connect server if it does not then we will
# call the setup command
utils.createGCSEndpoint(
    ac_rt,
    client_id,
    client_secret,
    project_id,
    DEPLOYMENT_KEY_PATH,
    ENDPOINT_NAME,
    DATAFED_GLOBUS_CONTROL_PORT,
    userinfo,
)

if DATAFED_GLOBUS_SUBSCRIPTION is not None:
    # Create subscription subgroup
    # Note: get_group_by_subscription_id doesn't exist in current globus-sdk
    # We'll use get_my_groups and filter by subscription_id
    my_groups = gr_rt.get_my_groups()
    
    # Try to find a group with matching subscription_id
    parent_group_id = None
    for group in my_groups:
        if group.get("subscription_id") == DATAFED_GLOBUS_SUBSCRIPTION:
            parent_group_id = group["id"]
            print(f"Found group with subscription {DATAFED_GLOBUS_SUBSCRIPTION}")
            break
    
    # If no group found with subscription, try to create one or use first available
    if parent_group_id is None:
        print(f"Warning: No group found with subscription_id {DATAFED_GLOBUS_SUBSCRIPTION}")
        # For now, we'll skip the group creation if we can't find the parent
        print("Skipping group creation due to missing parent group")
    else:
        print(f"Using parent group: {parent_group_id}")
        group_name = f"{DATAFED_GCS_ROOT_NAME} Group"

        if utils.groupExists(gr_rt, group_name):
            print("Group exists already")
            group_id = utils.getGroupId(gr_rt, group_name)
        else:
            print(f"Group does not exist {group_name}")
            package = {
                "name": group_name,
                "description": "DataFed Repository Subscription Group, used for"
                "granting access to the application client to setup the repository in "
                "Globus",
                "parent_id": str(parent_group_id),
            }

            result = gr_rt.create_group(package)
            group_id = result["id"]

        print("group id")
        print(group_id)

        batch = globus_sdk.BatchMembershipActions()
        batch.add_members(client_id, role="admin")
        result = gr_rt.batch_membership_action(group_id, batch)

        print("membership_action")
        print(result)
        package = {"subscription_id": DATAFED_GLOBUS_SUBSCRIPTION}
        result = gr_rt.update_group(group_id, package)
        print("update group")
        print(result)


import globus_sdk
import subprocess
import utils
from globus_sdk import AuthClient, AccessTokenAuthorizer
import json
import os
import sys


# Hard coded Native Client ID
CLIENT_ID = 'f8d0afca-7ac4-4a3c-ac05-f94f5d9afce8'
# The Globus project the GCS endpoint will be created in
PROJECT_NAME="Dev Testing"

# This is for confidential client
CLIENT_NAME = "DataFed Repo Setup Client"
# Name of the client secret used by the confidential client
CRED_NAME="DataFed Repo Cred"
# Name of the file where we will store confidential client credentials
CRED_FILE_NAME="client_cred.json"
# Name to give to endpoint
ENDPOINT_NAME="endpt-DataFed-CADES-test"
# Path to deployment key
DEPLOYMENT_KEY_PATH="./deployment-key.json"
client = globus_sdk.NativeAppAuthClient(CLIENT_ID)

# manage_projects scope to create a project
# view_identities to user information for creating GCS server
client.oauth2_start_flow(requested_scopes="openid profile email urn:globus:auth:scope:auth.globus.org:manage_projects urn:globus:auth:scope:auth.globus.org:view_identities", refresh_tokens=True)

authorize_url = client.oauth2_get_authorize_url(query_params={"prompt": "login"})
print("Please go to this URL and login: \n", authorize_url)
auth_code = input("Please enter the authorization code: ")

token_response = client.oauth2_exchange_code_for_tokens(auth_code)
# Extract the token
refresh_token_auth = token_response.by_resource_server['auth.globus.org']['refresh_token']
rt_authorizer = globus_sdk.RefreshTokenAuthorizer(refresh_token_auth, client)
# auth_client_refresh_token
ac_rt = AuthClient(authorizer=rt_authorizer)

userinfo = ac_rt.oauth2_userinfo()
# Will get the primary email and id
identity_id = userinfo["sub"]
email = userinfo["email"]
username = userinfo["preferred_username"]
organization = userinfo["identity_provider_display_name"]

# Need to determine the project uuid
project_id = utils.createProject(ac_rt, PROJECT_NAME, userinfo)

count = utils.countProjects(ac_rt, PROJECT_NAME)

if count != 1:
    print("Something is wrong there should be at least one project with name"
          f" {PROJECT_NAME} instead there are {count} with that name")
    sys.exit(1)

print(f"Project id is {project_id}")
client_id, client_secret = utils.createClient(
        ac_rt,
        CLIENT_NAME,
        project_id,
        CRED_NAME,
        CRED_FILE_NAME)

# Add the globus client as an admin to the project
ac_rt.update_project(project_id,admin_ids=[identity_id, client_id])

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
        userinfo)


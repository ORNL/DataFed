import globus_sdk
from globus_sdk.scopes import GroupsScopes
from globus_sdk import AuthClient, GroupsClient

import utils

import os, sys

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

default_REDIRECT_CLIENT_NAME = DATAFED_GCS_ROOT_NAME + " Web Server Client"
REDIRECT_CLIENT_NAME = os.getenv("DATAFED_GLOBUS_REDIRECT_CLIENT_NAME", default_REDIRECT_CLIENT_NAME)
if len(REDIRECT_CLIENT_NAME) == 0:
    REDIRECT_CLIENT_NAME = default_REDIRECT_CLIENT_NAME

default_REDIRECT_CRED_NAME = DATAFED_GCS_ROOT_NAME + " Web Server Cred"
REDIRECT_CRED_NAME = os.getenv("DATAFED_GLOBUS_REDIRECT_CRED_NAME", default_REDIRECT_CRED_NAME)
if len(REDIRECT_CRED_NAME) == 0 :
    REDIRECT_CRED_NAME = default_REDIRECT_CRED_NAME

default_REDIRECT_CRED_FILE_PATH = os.path.abspath("./globus/webserver_cred.json")
REDIRECT_CRED_FILE_PATH = os.getenv("DATAFED_GLOBUS_REDIRECT_CRED_FILE_PATH", default_REDIRECT_CRED_FILE_PATH)
if len(REDIRECT_CRED_FILE_PATH) == 0:
    REDIRECT_CRED_FILE_PATH = default_REDIRECT_CRED_FILE_PATH

default_DOMAIN = "localhost"
DOMAIN = os.getenv("DATAFED_DOMAIN", default_DOMAIN)
if len(DOMAIN) == 0:
    DOMAIN = default_DOMAIN
REDIRECT_PATH = os.path.join("https://", DOMAIN, "ui/authn")

# begin oauth
client = globus_sdk.NativeAppAuthClient(CLIENT_ID)

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

redirect_c_id, redirect_c_secret = utils.createRedirectClient(
    ac_rt, REDIRECT_CLIENT_NAME, project_id, REDIRECT_CRED_NAME, REDIRECT_CRED_FILE_PATH, REDIRECT_PATH
)

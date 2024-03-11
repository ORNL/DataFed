
import globus_sdk
from globus_sdk import AuthClient, AccessTokenAuthorizer
import json
import os

TOKEN_FILE = "globus_tokens.json"

# Define your client ID and client secret
CLIENT_ID = 'f8d0afca-7ac4-4a3c-ac05-f94f5d9afce8' # NATIVE

client = globus_sdk.NativeAppAuthClient(CLIENT_ID)
# manage_projects scope to create a project
client.oauth2_start_flow(requested_scopes="openid profile email urn:globus:auth:scope:auth.globus.org:manage_projects urn:globus:auth:scope:auth.globus.org:view_identities", refresh_tokens=True)

authorize_url = client.oauth2_get_authorize_url(query_params={"prompt": "login"})
print("Please go to this URL and login: \n", authorize_url)
auth_code = input("Please enter the authorization code: ")

token_response = client.oauth2_exchange_code_for_tokens(auth_code)

print("Token Response is")

print(token_response)

# Extract the access token
access_token_auth = token_response.by_resource_server['auth.globus.org']['access_token']
refresh_token_auth = token_response.by_resource_server['auth.globus.org']['refresh_token']

rt_authorizer = globus_sdk.RefreshTokenAuthorizer(refresh_token_auth, client)
ac_rt = AuthClient(authorizer=rt_authorizer)

print("User info is")
userinfo = ac_rt.oauth2_userinfo()
print(userinfo)

# Will get the primary email and id
identity_id = userinfo["sub"]
email = userinfo["email"]
print("AuthClient")
print(dir(ac_rt))


PROJECT_NAME="Dev Testing"
project_id=None
# check if project exists already
project_exists = False
for project in ac_rt.get_projects():
    print(f"name: {project['display_name']}")
    print(f"id: {project['id']}")
    print()

    if project['display_name'] == PROJECT_NAME:
        project_exists = True
        project_id = project['id']
        break

if project_exists is False:
    project_create_result = ac_rt.create_project("Dev Testing",
        contact_email=email, admin_ids=[identity_id,CLIENT_ID ])
    project_id = project_create_result['project']['id']

CLIENT_NAME = "DataFed Repo Setup Client"

client_exists = False

get_client_result = ac_rt.get_clients()
for client in get_client_result['clients']:
    if client['name'] == CLIENT_NAME and client['project'] == project_id:
        client_exists = True
        client_id = client['id']
        break

if client_exists is False:
    result = ac_rt.create_client("DataFed Repo Setup Client", project=project_id, public_client=False) #client_type="confidential_client")
    client_id = result["client"]["id"]

print("Created client")
print(client_id)

CRED_NAME="DataFed Repo Cred"
get_client_cred_result = ac_rt.get_client_credentials(client_id) #client_type="confidential_client")
cred_exists_on_cloud = False
for cred in get_client_cred_result['credentials']:
    if cred['name'] == CRED_NAME: 
        # Should have stored secret locally
        cred_exists_on_cloud = True
        cred_id = cred['id']
        break

CRED_FILE_NAME="client_cred.json"
# Check if secret is cached locally       
cred_exists_locally = False
cred_empty = True
if os.path.exists(CRED_FILE_NAME):
    cred_exists_locally = True
    file_size = os.path.getsize(CRED_FILE_NAME)
    # Check if the file size is 0 (empty)
    if file_size != 0:
        cred_empty = False

create_new_credential = True
remove_cached_credential = True
remove_old_credential = False
if cred_exists_on_cloud:
    if cred_exists_locally and cred_empty is False: 
        # Check to see if the local secret is the same id and not just the same
        # name
        with open(CRED_FILE_NAME, 'r') as f:
            loaded_data = json.load(f)
            if loaded_data['id'] == cred_id:
                create_new_credential = False
                remove_cached_credential = False
                remove_old_credential = True 


if remove_old_credential:
    ac_rt.delete_client_credential(client_id, cred_id)

if remove_cached_credential:
    if os.path.exists(CRED_FILE_NAME):
        os.remove(CRED_FILE_NAME)

if create_new_credential:
    cred_result = ac_rt.create_client_credential(client_id, CRED_NAME)
    print(cred_result)
    # Have to change this to a dict 
    obj = {
            'client': cred_result['credential']['client'],
            'id': cred_result['credential']['id'],
            'name': cred_result['credential']['name'],
            'secret': cred_result['credential']['secret']
            }
    with open(CRED_FILE_NAME, 'w') as f:
        json.dump(obj, f)


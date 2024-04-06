
import globus_sdk
import subprocess
import utils
from globus_sdk import AuthClient, AccessTokenAuthorizer
import json
import os
import sys


# The Globus project the GCS endpoint will be created in
DATAFED_GCS_ROOT_NAME = os.getenv("DATAFED_GCS_ROOT_NAME", "DataFed Repo")
PROJECT_NAME=os.getenv("DATAFED_GLOBUS_PROJECT_NAME", DATAFED_GCS_ROOT_NAME + " Project")
# This is for confidential client
CLIENT_NAME = os.getenv("DATAFED_GLOBUS_CLIENT_NAME", DATAFED_GCS_ROOT_NAME + " Setup Client")
# Name of the client secret used by the confidential client
CRED_NAME=os.getenv("DATAFED_GLOBUS_CRED_NAME",DATAFED_GCS_ROOT_NAME + " Cred")
# Name of the file where we will store confidential client credentials
CRED_FILE_PATH=os.getenv("DATAFED_GLOBUS_CRED_FILE_PATH","./client_cred.json")
ENDPOINT_ID = os.getenv("GCS_CLI_ENDPOINT_ID")
ENDPOINT_NAME = os.getenv("DATAFED_GLOBUS_ENDPOINT_NAME",DATAFED_GCS_ROOT_NAME + " Endpoint")
# Path to deployment key
DEPLOYMENT_KEY_PATH=os.getenv("DATAFED_GLOBUS_DEPLOYMENT_KEY_PATH","./deployment-key.json")

# Path to deployment key
DATAFED_GLOBUS_CONTROL_PORT=os.getenv("DATAFED_GLOBUS_CONTROL_PORT", "443")
DATAFED_GCS_URL=os.getenv("DATAFED_GCS_URL")
client_id = os.getenv("GCS_CLI_CLIENT_ID")
client_secret = os.getenv("GCS_CLI_CLIENT_SECRET")
mapped_collection_id = os.getenv("MAPPED_COLLECTION_ID")
mapped_collection_name = os.getenv("DATAFED_GCS_COLLECTION_MAPPED", f"{DATAFED_GCS_ROOT_NAME} Collection Mapped")
guest_collection_name = os.getenv("DATAFED_GCS_COLLECTION_GUEST",f"{DATAFED_GCS_ROOT_NAME} Collection Guest")
storage_gateway_id = os.getenv("STORAGE_GATEWAY_ID")
storage_gateway_name = os.getenv("DATAFED_GCS_STORAGE_GATEWAY",f"{DATAFED_GCS_ROOT_NAME} Storage Gateway")
local_username = os.getenv("DATAFED_REPO_USER")

if ENDPOINT_ID is None:
    raise Exception("GCS_CLI_ENDPOINT_ID must be defined as an env varaible")
if DATAFED_GCS_URL is None:
    raise Exception("Unable to create guest collection, DATAFED_GCS_URL is not"
                    " defined.")
if local_username is None:
    raise Exception("DATAFED_REPO_USER is not defined.")

#client = globus_sdk.NativeAppAuthClient(CLIENT_ID)

# manage_projects scope to create a project
# view_identities to user information for creating GCS server
#client.oauth2_start_flow(requested_scopes="openid profile email urn:globus:auth:scope:auth.globus.org:manage_projects urn:globus:auth:scope:auth.globus.org:view_identities", refresh_tokens=True)
#
#authorize_url = client.oauth2_get_authorize_url(query_params={"prompt": "login"})
#print("Please go to this URL and login: \n", authorize_url)
#auth_code = input("Please enter the authorization code: ")
#
#token_response = client.oauth2_exchange_code_for_tokens(auth_code)
## Extract the token
#refresh_token_auth = token_response.by_resource_server['auth.globus.org']['refresh_token']
#rt_authorizer = globus_sdk.RefreshTokenAuthorizer(refresh_token_auth, client)
## auth_client_refresh_token
#ac_rt = AuthClient(authorizer=rt_authorizer)
#
#userinfo = ac_rt.oauth2_userinfo()
## Will get the primary email and id
#identity_id = userinfo["sub"]
#email = userinfo["email"]
#username = userinfo["preferred_username"]
#organization = userinfo["identity_provider_display_name"]

if client_id is None:
    client_id = getClientIdFromCredFile(CRED_FILE_PATH)

if client_secret is None:
    client_secret = getCredentialFromFile(CRED_FILE_PATH, client_id)

client = globus_sdk.ConfidentialAppAuthClient(client_id, client_secret)

scopes="openid profile email urn:globus:auth:scope:auth.globus.org:manage_projects urn:globus:auth:scope:auth.globus.org:view_identities"
authorizer = globus_sdk.ClientCredentialsAuthorizer(client, scopes)
#cc_authorizer = globus_sdk.ClientCredentialsAuthorizer(confidential_client,
#        scopes)

#token_response = client.oauth2_client_credentials_tokens()

#refresh_token_auth = token_response.by_resource_server['auth.globus.org']['refresh_token']
#rt_authorizer = globus_sdk.RefreshTokenAuthorizer(refresh_token_auth, client)
# the useful values that you want at the end of this
#globus_auth_data = token_response.by_resource_server["auth.globus.org"]
#globus_transfer_data =
#token_response.by_resource_server["transfer.api.globus.org"]
#globus_auth_token = globus_auth_data["access_token"]
#globus_transfer_token = globus_transfer_data["access_token"]

gcs_client = globus_sdk.GCSClient(DATAFED_GCS_URL, authorizer=authorizer)


import globus_sdk
from globus_sdk import scopes

# constants
#endpoint_hostname = "https://ecf8ed.08cc.data.globus.org"
#endpoint_id = "769c7ed0-744a-41b5-b4a8-db37b10b1ac9"
#mapped_collection_id = "580ecb92-de56-42ee-a5ec-3d3886767b94"
#storage_gateway_id = "3fdd7f41-4a05-4856-8fcd-2fb50066c590"

# client credentials
# This client identity must have the needed permissions to create a guest
# collection on the mapped collection, and a valid mapping to a local account
# on the storage gateway that matches the local_username
# If using user tokens, the user must be the one with the correct permissions
# and identity mapping.
#client_id = "4de65cd7-4363-4510-b652-f8d15a43a0af"
#client_secret = "*redacted*"
#local_username = "datafed"

# The scope the client will need, note that primary scope is for the endpoint,
# but it has a dependency on the mapped collection's data_access scope

# Build a GCSClient to act as the client by using a ClientCredentialsAuthorizor
confidential_client = globus_sdk.ConfidentialAppAuthClient(
    client_id=client_id, client_secret=client_secret
)
scope = scopes.GCSEndpointScopeBuilder(ENDPOINT_ID).make_mutable("manage_collections")
authorizer = globus_sdk.ClientCredentialsAuthorizer(confidential_client, scopes=scope)
client = globus_sdk.GCSClient(DATAFED_GCS_URL, authorizer=authorizer)

collection_list = client.get_collection_list()
print("collection_list")
print(collection_list)

mapped_collection_found = False

for item in collection_list["data"]:
    print(item["display_name"])
    if mapped_collection_id is not None:
        if item["id"] == mapped_collection_id:
            mapped_collection_found = True
            if item["display_name"] != mapped_collection_name:
                raise Exception("Expected display name is different from what "
                                "is expected for mapped collection "
                                f"{mapped_collection_id}, if using non standard"
                                " display name for mapped collection "
                                f"{mapped_collection_name} then the "
                                "MAPPED_COLLECTION_NAME env variable must be "
                                "set.")
            break
    elif item["display_name"] == mapped_collection_name:
        mapped_collection_found = True
        mapped_collection_id = item["id"]
        break

if mapped_collection_found == False:
    raise Exception("Missing required mapped collection")

storage_gateway_found = False
storage_gateway_list = client.get_storage_gateway_list()
for item in storage_gateway_list["data"]:
    print(item["display_name"])
    if storage_gateway_id is not None:
        if item["id"] == storage_gateway_id:
            storage_gateway_found = True
            if item["display_name"] != storage_gateway_name:
                raise Exception("Expected display name is different from what "
                                "is expected for storage gateway "
                                f"{storage_gateway_id}, if using non standard"
                                " display name for storage gateway "
                                f"{storage_gateway_name} then the "
                                "DATAFED_GCS_STORAGE_GATEWAY env variable must be "
                                "set.")
            break
    elif item["display_name"] == storage_gateway_name:
        storage_gateway_found = True
        storage_gateway_id = item["id"]
        break
    
if storage_gateway_found == False:
    raise Exception("Missing required storage gateway")


# Get the mapped collection id
scope.add_dependency(scopes.GCSCollectionScopeBuilder(mapped_collection_id).data_access)
authorizer = globus_sdk.ClientCredentialsAuthorizer(confidential_client, scopes=scope)
client = globus_sdk.GCSClient(DATAFED_GCS_URL, authorizer=authorizer)

guest_collection_found = False

for item in collection_list["data"]:
    print(item["display_name"])
    if item["display_name"] == guest_collection_name:
        guest_collection_found = True
        guest_collection_id = item["id"]
        break
    
# https://github.com/globus/globus-sdk-python/blob/main/docs/examples/guest_collection_creation.rst
if guest_collection_found == False:
    credential_document = globus_sdk.UserCredentialDocument(
        storage_gateway_id=storage_gateway_id,
        identity_id=client_id,
        username=local_username,
    )
    client.create_user_credential(credential_document)

# Create the collection
    collection_document = globus_sdk.GuestCollectionDocument(
        public="True",
        collection_base_path="/",
        display_name=guest_collection_name,
        mapped_collection_id=mapped_collection_id,
    )
    response = client.create_collection(collection_document)
    guest_collection_id = response["id"]
    print(f"guest collection {guest_collection_id} created")


# For guest collection creation see

import globus_sdk
from globus_sdk import scopes

import utils
import os


# The Globus project the GCS endpoint will be created in
DATAFED_GCS_ROOT_NAME = os.getenv("DATAFED_GCS_ROOT_NAME", "DataFed Repo")
PROJECT_NAME = os.getenv(
    "DATAFED_GLOBUS_PROJECT_NAME", DATAFED_GCS_ROOT_NAME + " Project"
)
# This is for confidential client
CLIENT_NAME = os.getenv(
    "DATAFED_GLOBUS_CLIENT_NAME", DATAFED_GCS_ROOT_NAME + " Setup Client"
)
# Name of the client secret used by the confidential client
CRED_NAME = os.getenv("DATAFED_GLOBUS_CRED_NAME", DATAFED_GCS_ROOT_NAME + " Cred")
# Name of the file where we will store confidential client credentials
CRED_FILE_PATH = os.getenv("DATAFED_GLOBUS_CRED_FILE_PATH", "./client_cred.json")
ENDPOINT_ID = os.getenv("GCS_CLI_ENDPOINT_ID")
ENDPOINT_NAME = os.getenv(
    "DATAFED_GLOBUS_ENDPOINT_NAME", DATAFED_GCS_ROOT_NAME + " Endpoint"
)
# Path to deployment key
DEPLOYMENT_KEY_PATH = os.getenv(
    "DATAFED_GLOBUS_DEPLOYMENT_KEY_PATH", "./deployment-key.json"
)

BASE_PATH = os.getenv("DATAFED_GCS_COLLECTION_BASE_PATH", "/")

# Path to deployment key
DATAFED_GLOBUS_CONTROL_PORT = os.getenv("DATAFED_GLOBUS_CONTROL_PORT", "443")
DATAFED_GCS_URL = os.getenv("DATAFED_GCS_URL")
client_id = os.getenv("GCS_CLI_CLIENT_ID")
client_secret = os.getenv("GCS_CLI_CLIENT_SECRET")
mapped_collection_id = os.getenv("MAPPED_COLLECTION_ID")
mapped_collection_name = os.getenv(
    "DATAFED_GCS_COLLECTION_MAPPED", f"{DATAFED_GCS_ROOT_NAME} Collection Mapped"
)
guest_collection_name = os.getenv(
    "DATAFED_GCS_COLLECTION_GUEST", f"{DATAFED_GCS_ROOT_NAME} Collection Guest"
)
storage_gateway_id = os.getenv("STORAGE_GATEWAY_ID")
storage_gateway_name = os.getenv(
    "DATAFED_GCS_STORAGE_GATEWAY", f"{DATAFED_GCS_ROOT_NAME} Storage Gateway"
)
local_username = os.getenv("DATAFED_REPO_USER")

if ENDPOINT_ID is None:
    raise Exception("GCS_CLI_ENDPOINT_ID must be defined as an env varaible")
if DATAFED_GCS_URL is None:
    raise Exception(
        "Unable to create guest collection, DATAFED_GCS_URL is not" " defined."
    )
if local_username is None:
    raise Exception("DATAFED_REPO_USER is not defined.")

if client_id is None:
    client_id = utils.getClientIdFromCredFile(CRED_FILE_PATH)

if client_secret is None:
    client_secret = utils.getCredentialFromFile(CRED_FILE_PATH, client_id)

client = globus_sdk.ConfidentialAppAuthClient(client_id, client_secret)

auth_scopes = (
    "openid profile email "
    "urn:globus:auth:scope:auth.globus.org:manage_projects "
    "urn:globus:auth:scope:auth.globus.org:view_identities"
)

authorizer = globus_sdk.ClientCredentialsAuthorizer(client, auth_scopes)

gcs_client = globus_sdk.GCSClient(DATAFED_GCS_URL, authorizer=authorizer)

# The scope the client will need, note that primary scope is for the endpoint,
# but it has a dependency on the mapped collection's data_access scope

# Build a GCSClient to act as the client by using a ClientCredentialsAuthorizor
confidential_client = globus_sdk.ConfidentialAppAuthClient(
    client_id=client_id, client_secret=client_secret
)

token_response = confidential_client.oauth2_client_credentials_tokens()
globus_transfer_data = token_response.by_resource_server["transfer.api.globus.org"]
globus_transfer_token = globus_transfer_data["access_token"]
authorizer_tc = globus_sdk.AccessTokenAuthorizer(globus_transfer_token)
tc = globus_sdk.TransferClient(authorizer=authorizer_tc)

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
                raise Exception(
                    "Expected display name is different from what "
                    "is expected for mapped collection "
                    f"{mapped_collection_id}, if using non standard"
                    " display name for mapped collection "
                    f"{mapped_collection_name} then the "
                    "MAPPED_COLLECTION_NAME env variable must be "
                    "set."
                )
            break
    elif item["display_name"] == mapped_collection_name:
        mapped_collection_found = True
        mapped_collection_id = item["id"]
        break

if mapped_collection_found is False:
    raise Exception("Missing required mapped collection")

storage_gateway_found = False
storage_gateway_list = client.get_storage_gateway_list()
for item in storage_gateway_list["data"]:
    print(item["display_name"])
    if storage_gateway_id is not None:
        if item["id"] == storage_gateway_id:
            storage_gateway_found = True
            if item["display_name"] != storage_gateway_name:
                raise Exception(
                    "Expected display name is different from what "
                    "is expected for storage gateway "
                    f"{storage_gateway_id}, if using non standard"
                    " display name for storage gateway "
                    f"{storage_gateway_name} then the "
                    "DATAFED_GCS_STORAGE_GATEWAY env variable must be "
                    "set."
                )
            break
    elif item["display_name"] == storage_gateway_name:
        storage_gateway_found = True
        storage_gateway_id = item["id"]
        break

if storage_gateway_found is False:
    raise Exception("Missing required storage gateway")


# Get the mapped collection id
scope.add_dependency(scopes.GCSCollectionScopeBuilder(mapped_collection_id).data_access)
authorizer = globus_sdk.ClientCredentialsAuthorizer(confidential_client, scopes=scope)
client = globus_sdk.GCSClient(DATAFED_GCS_URL, authorizer=authorizer)

guest_collection_found = False
guest_collection_id = None
existing_base_path = None

for item in collection_list["data"]:
    print(item["display_name"])
    if item["display_name"] == guest_collection_name:
        guest_collection_found = True
        guest_collection_id = item["id"]
        # Try to get the existing base path from the collection list
        existing_base_path = item.get("collection_base_path")
        break

# Only delete and recreate the guest collection if the base path has changed
should_recreate_collection = False
if guest_collection_found:
    if existing_base_path is None:
        # If we can't get the base path from the list, try to get collection details
        try:
            collection_details = client.get_collection(guest_collection_id)
            existing_base_path = collection_details.get("collection_base_path")
        except Exception as e:
            print(f"Warning: Could not retrieve existing collection details: {e}")
            # If we can't get the existing base path, we'll recreate to be safe
            existing_base_path = None
    
    if existing_base_path is None:
        print(f"Unable to determine existing base path for guest collection {guest_collection_id}")
        print("Recreating collection to ensure correct configuration")
        should_recreate_collection = True
    elif existing_base_path != BASE_PATH:
        print(f"Base path changed from '{existing_base_path}' to '{BASE_PATH}'")
        print(f"Recreating guest collection {guest_collection_id}")
        should_recreate_collection = True
    else:
        print(f"Base path unchanged ('{existing_base_path}'), keeping existing guest collection {guest_collection_id}")
        should_recreate_collection = False

if should_recreate_collection:
    print(f"Removing current guest collection {guest_collection_id}")
    response = client.delete_collection(guest_collection_id)
    # Reset the flag so we create a new collection below
    guest_collection_found = False

user_credential_list = client.get_user_credential_list(storage_gateway_id)
user_credential_found = False

for item in user_credential_list["data"]:
    print(item["identity_id"])
    if item["identity_id"] == client_id:
        user_credential_found = True
        break

# https://github.com/globus/globus-sdk-python/blob/main/docs/examples/guest_collection_creation.rst
if user_credential_found is False:
    credential_document = globus_sdk.UserCredentialDocument(
        storage_gateway_id=storage_gateway_id,
        identity_id=client_id,
        username=local_username,
    )
    client.create_user_credential(credential_document)

# Only create a new collection if we don't have an existing one
# (either it never existed or we deleted it due to base path change)
if not guest_collection_found:
    # We are recreating the collection from scratch because we are unable to update
    # the base path once the collection has been made this is a limitation of Globus
    # Create the collection
    collection_document = globus_sdk.GuestCollectionDocument(
        public="True",
        collection_base_path=BASE_PATH,
        display_name=guest_collection_name,
        mapped_collection_id=mapped_collection_id,
    )
    response = client.create_collection(collection_document)
    guest_collection_id = response["id"]
    print(f"guest collection {guest_collection_id} created")
else:
    print(f"Using existing guest collection {guest_collection_id}")

# Create ACL rule for Guest anonymous access
acl_list = tc.endpoint_acl_list(endpoint_id=guest_collection_id)
create_acl = True
update_acl = False
acl_id = None
for item in acl_list["DATA"]:
    if item["principal_type"] == "all_authenticated_users":
        create_acl = False
        acl_id = item["id"]
        if item["permissions"] != "rw":
            print("Need to update acl for all users permissions are incorrect")
            update_acl = True
        else:
            print("ACL rule already exists for all users")
        break

rule_data = {
    "DATA_TYPE": "access",
    "path": "/",
    "permissions": "rw",
    "principal": "",
    "principal_type": "all_authenticated_users",
    "role_id": None,
    "role_type": None,
}
if create_acl:
    print(f"Creating acl rule for guest_collection {guest_collection_id}")
    tc.add_endpoint_acl_rule(endpoint_id=guest_collection_id, rule_data=rule_data)
elif update_acl:
    print(f"Updating acl rule ({acl_id}) for guest_collection {guest_collection_id}")
    tc.update_endpoint_acl_rule(
        endpoint_id=guest_collection_id, rule_id=acl_id, rule_data=rule_data
    )

acl_list = tc.endpoint_acl_list(endpoint_id=guest_collection_id)
print(acl_list)

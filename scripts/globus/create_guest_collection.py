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

auth_client = globus_sdk.ConfidentialAppAuthClient(client_id, client_secret)

auth_scopes = (
    "openid profile email "
    "urn:globus:auth:scope:auth.globus.org:manage_projects "
    "urn:globus:auth:scope:auth.globus.org:view_identities"
)

auth_authorizer = globus_sdk.ClientCredentialsAuthorizer(auth_client, auth_scopes)

gcs_client = globus_sdk.GCSClient(DATAFED_GCS_URL, authorizer=auth_authorizer)

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
manage_collections_authorizer = globus_sdk.ClientCredentialsAuthorizer(confidential_client, scopes=scope)
manage_collections_client = globus_sdk.GCSClient(DATAFED_GCS_URL, authorizer=manage_collections_authorizer)

collection_list = manage_collections_client.get_collection_list()
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
storage_gateway_list = manage_collections_client.get_storage_gateway_list()
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
final_authorizer = globus_sdk.ClientCredentialsAuthorizer(confidential_client, scopes=scope)
final_client = globus_sdk.GCSClient(DATAFED_GCS_URL, authorizer=final_authorizer)

guest_collection_found = False
guest_collection_id = None
existing_base_path = None

for item in collection_list["data"]:
    print(item["display_name"])
    if item["display_name"] == guest_collection_name:
        guest_collection_found = True
        guest_collection_id = item["id"]
        # The collection list doesn't contain base path information
        # We'll need to get it from collection details
        existing_base_path = None
        print(f"Found existing guest collection {guest_collection_id}")
        print(f"Collection data keys: {list(item.keys())}")
        break

def should_recreate_guest_collection(collection_id, current_base_path, cache_directory):
    """
    Determine if the guest collection should be recreated based on base path changes.
    
    Args:
        collection_id: ID of the existing guest collection
        current_base_path: Current base path from environment
        cache_directory: Directory for cache files
    
    Returns:
        tuple: (should_recreate: bool, reason: str)
    """
    # Normalize base paths to handle edge cases
    current_base_path = current_base_path.rstrip('/') if current_base_path != '/' else '/'
    
    # Get cached base path
    cached_base_path = utils.get_cached_base_path(collection_id, cache_directory)
    
    if cached_base_path:
        cached_base_path = cached_base_path.rstrip('/') if cached_base_path != '/' else '/'
        print(f"Found cached base path: '{cached_base_path}'")
    else:
        print("No cached base path found")
    
    print(f"Current BASE_PATH environment variable: '{current_base_path}'")
    
    # Check for manual override first
    force_recreate = os.getenv("DATAFED_FORCE_RECREATE_GUEST_COLLECTION", "false").lower() == "true"
    if force_recreate:
        return True, "DATAFED_FORCE_RECREATE_GUEST_COLLECTION is set, forcing recreation"
    
    # Compare base paths
    if cached_base_path is None:
        return False, "No cached base path available, keeping existing collection to avoid unnecessary recreation"
    elif cached_base_path != current_base_path:
        return True, f"Base path changed from '{cached_base_path}' to '{current_base_path}'"
    else:
        return False, f"Base path unchanged ('{cached_base_path}'), keeping existing guest collection"

# Check if we should recreate the guest collection
should_recreate_collection = False
recreate_reason = ""

if guest_collection_found:
    print(f"Found existing guest collection {guest_collection_id}")
    
    # Since we can't retrieve the base path from the Globus API for guest collections,
    # we'll use a local cache file to track the last known base path
    cache_dir = os.path.dirname(CRED_FILE_PATH)
    should_recreate_collection, recreate_reason = should_recreate_guest_collection(
        guest_collection_id, BASE_PATH, cache_dir
    )
    
    print(f"Decision: {recreate_reason}")
    if should_recreate_collection:
        print("Action: Will recreate guest collection")

def recreate_guest_collection(client, collection_id, cache_directory):
    """
    Safely delete an existing guest collection and clean up cache.
    
    Args:
        client: GCS client for API calls
        collection_id: ID of collection to delete
        cache_directory: Directory containing cache files
    
    Returns:
        bool: True if deletion was successful, False otherwise
    """
    try:
        print(f"Removing current guest collection {collection_id}")
        response = client.delete_collection(collection_id)
        print(f"Successfully deleted guest collection {collection_id}")
        
        # Clean up the old cache file
        if utils.remove_cached_base_path(collection_id, cache_directory):
            print(f"Cleaned up cache for collection {collection_id}")
        
        return True
        
    except Exception as e:
        print(f"Error deleting guest collection {collection_id}: {e}")
        print("Attempting to continue with existing collection...")
        return False

if should_recreate_collection:
    cache_dir = os.path.dirname(CRED_FILE_PATH)
    deletion_successful = recreate_guest_collection(final_client, guest_collection_id, cache_dir)
    
    if deletion_successful:
        # Reset the flag so we create a new collection below
        guest_collection_found = False
    else:
        # If deletion failed, keep using the existing collection
        should_recreate_collection = False
        print("Will continue using existing guest collection due to deletion failure")

user_credential_list = final_client.get_user_credential_list(storage_gateway_id)
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
    final_client.create_user_credential(credential_document)

def create_new_guest_collection(client, base_path, collection_name, collection_id):
    """
    Create a new guest collection with error handling.
    
    Args:
        client: GCS client for API calls
        base_path: Base path for the collection
        collection_name: Display name for the collection
        collection_id: ID of the mapped collection
    
    Returns:
        str: Collection ID if successful, None if failed
    """
    try:
        # Validate base path format
        if not base_path:
            raise ValueError("Base path cannot be empty")
        
        # Normalize base path
        normalized_base_path = base_path.rstrip('/') if base_path != '/' else '/'
        
        collection_document = globus_sdk.GuestCollectionDocument(
            public=True,
            collection_base_path=normalized_base_path,
            display_name=collection_name,
            mapped_collection_id=collection_id,
        )
        
        response = client.create_collection(collection_document)
        collection_id = response["id"]
        print(f"Successfully created guest collection {collection_id} with base path '{normalized_base_path}'")
        return collection_id
        
    except Exception as e:
        print(f"Error creating guest collection: {e}")
        return None

# Only create a new collection if we don't have an existing one
# (either it never existed or we deleted it due to base path change)
if not guest_collection_found:
    # We are recreating the collection from scratch because we are unable to update
    # the base path once the collection has been made this is a limitation of Globus
    guest_collection_id = create_new_guest_collection(
        final_client, BASE_PATH, guest_collection_name, mapped_collection_id
    )
    
    if guest_collection_id is None:
        print("Failed to create guest collection. Exiting.")
        exit(1)
else:
    print(f"Using existing guest collection {guest_collection_id}")

# Cache the current base path for future comparisons
cache_dir = os.path.dirname(CRED_FILE_PATH)
if utils.cache_base_path(guest_collection_id, BASE_PATH, cache_dir):
    print(f"Successfully cached base path for future comparisons")
else:
    print("Warning: Failed to cache base path - future runs may unnecessarily recreate collection")

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
            print(f"ACL rule already exists for all users for {guest_collection_id}")
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

#!/usr/bin/env python3
"""
Create a guest collection on a Globus Connect Server endpoint.
This script creates guest collections with proper permissions for all authenticated users.
"""

import argparse
import os
import sys
import globus_sdk
from globus_sdk import scopes
import utils


def create_guest_collection(
    gcs_client,
    tc_client,
    collection_name: str,
    mapped_collection_id: str,
    base_path: str = "/",
    public: bool = True,
    all_authenticated_users: bool = True
) -> str:
    """
    Create a guest collection.
    
    Args:
        gcs_client: GCS client with collection management scope
        tc_client: Transfer client for ACL management
        collection_name: Display name for the guest collection
        mapped_collection_id: ID of the mapped collection
        base_path: Base path within the mapped collection
        public: Whether collection should be public
        all_authenticated_users: Grant access to all authenticated users
        
    Returns:
        Collection ID of the created guest collection
    """
    # Normalize base path
    base_path = base_path.rstrip('/') if base_path != '/' else '/'
    
    print(f"Creating guest collection: {collection_name}")
    print(f"  Mapped collection: {mapped_collection_id}")
    print(f"  Base path: {base_path}")
    print(f"  Public: {public}")
    
    # Create the guest collection
    collection_document = globus_sdk.GuestCollectionDocument(
        public=public,
        collection_base_path=base_path,
        display_name=collection_name,
        mapped_collection_id=mapped_collection_id,
    )
    
    try:
        response = gcs_client.create_collection(collection_document)
        collection_id = response["id"]
        print(f"Successfully created guest collection: {collection_id}")
        
        # Set up ACL for all authenticated users if requested
        if all_authenticated_users:
            print("Setting up access for all authenticated users...")
            
            rule_data = {
                "DATA_TYPE": "access",
                "path": "/",
                "permissions": "rw",
                "principal": "",
                "principal_type": "all_authenticated_users",
                "role_id": None,
                "role_type": None,
            }
            
            tc_client.add_endpoint_acl_rule(
                endpoint_id=collection_id,
                rule_data=rule_data
            )
            print("  Access granted to all authenticated users")
        
        return collection_id
        
    except Exception as e:
        print(f"Error creating guest collection: {e}")
        raise


def main():
    parser = argparse.ArgumentParser(
        description="Create a guest collection on a GCS endpoint"
    )
    
    parser.add_argument(
        "collection_name",
        help="Display name for the guest collection"
    )
    
    parser.add_argument(
        "--mapped-collection",
        help="Name or ID of the mapped collection (default: from env GCS_COLLECTION_NAME)",
        default=os.getenv("GCS_COLLECTION_NAME")
    )
    
    parser.add_argument(
        "--base-path",
        help="Base path within the mapped collection (default: /)",
        default="/"
    )
    
    parser.add_argument(
        "--private",
        action="store_true",
        help="Make the collection private (default: public)"
    )
    
    parser.add_argument(
        "--no-all-users",
        action="store_true",
        help="Don't grant access to all authenticated users"
    )
    
    parser.add_argument(
        "--endpoint-url",
        help="GCS endpoint URL (default: from deployment key)",
        default=None
    )
    
    parser.add_argument(
        "--cred-file",
        help="Path to credentials file",
        default="/opt/globus/client_cred.json"
    )
    
    parser.add_argument(
        "--deployment-key",
        help="Path to deployment key file",
        default="/opt/globus/deployment-key.json"
    )
    
    parser.add_argument(
        "--env-file",
        help="Path to .env file to load",
        default=None
    )
    
    args = parser.parse_args()
    
    # Load environment from file if specified
    if args.env_file:
        env_vars = utils.load_env_file(args.env_file)
        for key, value in env_vars.items():
            if key not in os.environ:
                os.environ[key] = value
    
    # Get credentials
    client_id, client_secret = utils.get_client_credentials(args.cred_file)
    if not client_id or not client_secret:
        print(f"ERROR: Could not load credentials from {args.cred_file}")
        print("Please run init-globus.py first to set up credentials")
        sys.exit(1)
    
    # Get endpoint ID
    endpoint_id = utils.get_endpoint_id(args.deployment_key)
    if not endpoint_id:
        print(f"ERROR: Could not get endpoint ID from {args.deployment_key}")
        sys.exit(1)
    
    # Get endpoint URL
    if args.endpoint_url:
        gcs_url = args.endpoint_url
    else:
        # Try to get from deployment key info
        deployment_data = utils.load_json_file(args.deployment_key)
        if deployment_data and "domain_name" in deployment_data:
            gcs_url = f"https://{deployment_data['domain_name']}"
        else:
            # Try to get from environment
            gcs_hostname = os.getenv("GCS_HOSTNAME")
            if gcs_hostname:
                gcs_url = f"https://{gcs_hostname}"
            else:
                print("ERROR: Could not determine GCS endpoint URL")
                print("Please specify --endpoint-url or set GCS_HOSTNAME")
                sys.exit(1)
    
    print(f"Using GCS endpoint: {gcs_url}")
    
    # Create Globus clients
    auth_client = globus_sdk.ConfidentialAppAuthClient(client_id, client_secret)
    
    # Get tokens for transfer client
    token_response = auth_client.oauth2_client_credentials_tokens()
    transfer_data = token_response.by_resource_server["transfer.api.globus.org"]
    transfer_token = transfer_data["access_token"]
    
    # Create transfer client for ACL management
    transfer_authorizer = globus_sdk.AccessTokenAuthorizer(transfer_token)
    tc = globus_sdk.TransferClient(authorizer=transfer_authorizer)
    
    # Create GCS client with collection management scope
    collection_scope = scopes.GCSEndpointScopeBuilder(endpoint_id).make_mutable("manage_collections")
    collection_authorizer = globus_sdk.ClientCredentialsAuthorizer(auth_client, scopes=collection_scope)
    gcs_client = globus_sdk.GCSClient(gcs_url, authorizer=collection_authorizer)
    
    # Get list of existing collections
    print("Fetching existing collections...")
    collections = gcs_client.get_collection_list()
    
    # Find the mapped collection
    mapped_collection = None
    mapped_collection_id = None
    
    for coll in collections["data"]:
        if args.mapped_collection:
            # Check by name or ID
            if (coll.get("display_name") == args.mapped_collection or 
                coll.get("id") == args.mapped_collection):
                mapped_collection = coll
                mapped_collection_id = coll["id"]
                break
    
    if not mapped_collection_id:
        print(f"ERROR: Could not find mapped collection: {args.mapped_collection}")
        print("\nAvailable collections:")
        for coll in collections["data"]:
            if coll.get("collection_type") != "guest":
                print(f"  - {coll.get('display_name')} ({coll.get('id')})")
        sys.exit(1)
    
    print(f"Using mapped collection: {mapped_collection.get('display_name')} ({mapped_collection_id})")
    
    # Check if guest collection already exists
    existing_guest = None
    for coll in collections["data"]:
        if (coll.get("display_name") == args.collection_name and 
            coll.get("collection_type") == "guest"):
            existing_guest = coll
            break
    
    if existing_guest:
        print(f"\nWARNING: Guest collection '{args.collection_name}' already exists")
        print(utils.format_collection_info(existing_guest))
        
        if not utils.confirm_action("Do you want to continue anyway?"):
            print("Aborted")
            sys.exit(0)
    
    # Add data_access scope for the mapped collection
    collection_scope.add_dependency(
        scopes.GCSCollectionScopeBuilder(mapped_collection_id).data_access
    )
    
    # Re-authorize with the additional scope
    final_authorizer = globus_sdk.ClientCredentialsAuthorizer(auth_client, scopes=collection_scope)
    final_gcs_client = globus_sdk.GCSClient(gcs_url, authorizer=final_authorizer)
    
    # Create the guest collection
    try:
        collection_id = create_guest_collection(
            final_gcs_client,
            tc,
            args.collection_name,
            mapped_collection_id,
            args.base_path,
            public=not args.private,
            all_authenticated_users=not args.no_all_users
        )
        
        print(f"\nSuccess! Guest collection created: {collection_id}")
        print(f"You can access it at: https://app.globus.org/file-manager/collections/{collection_id}")
        
    except Exception as e:
        print(f"\nERROR: Failed to create guest collection: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
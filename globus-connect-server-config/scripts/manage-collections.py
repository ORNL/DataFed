#!/usr/bin/env python3
"""
Manage collections on a Globus Connect Server endpoint.
List, inspect, update, and delete collections.
"""

import argparse
import os
import sys
import json
import globus_sdk
from globus_sdk import scopes
import utils


def list_collections(gcs_client) -> list:
    """List all collections on the endpoint."""
    response = gcs_client.get_collection_list()
    return response.get("data", [])


def get_collection_details(gcs_client, collection_id: str) -> dict:
    """Get detailed information about a collection."""
    return gcs_client.get_collection(collection_id)


def delete_collection(gcs_client, collection_id: str) -> bool:
    """Delete a collection."""
    try:
        gcs_client.delete_collection(collection_id)
        return True
    except Exception as e:
        print(f"Error deleting collection: {e}")
        return False


def list_storage_gateways(gcs_client) -> list:
    """List all storage gateways on the endpoint."""
    response = gcs_client.get_storage_gateway_list()
    return response.get("data", [])


def list_user_credentials(gcs_client, storage_gateway_id: str) -> list:
    """List user credentials for a storage gateway."""
    response = gcs_client.get_user_credential_list(storage_gateway_id)
    return response.get("data", [])


def display_collections(collections: list, verbose: bool = False):
    """Display collections in a formatted way."""
    if not collections:
        print("No collections found")
        return
    
    # Group by type
    mapped_collections = []
    guest_collections = []
    
    for coll in collections:
        if coll.get("collection_type") == "guest":
            guest_collections.append(coll)
        else:
            mapped_collections.append(coll)
    
    if mapped_collections:
        print("\n=== Mapped Collections ===")
        for coll in mapped_collections:
            print(f"\nName: {coll.get('display_name')}")
            print(f"  ID: {coll.get('id')}")
            print(f"  Storage Gateway: {coll.get('storage_gateway_id')}")
            if verbose:
                print(f"  Public: {coll.get('public', False)}")
                print(f"  Guest Collections Allowed: {coll.get('allow_guest_collections', False)}")
    
    if guest_collections:
        print("\n=== Guest Collections ===")
        for coll in guest_collections:
            print(f"\nName: {coll.get('display_name')}")
            print(f"  ID: {coll.get('id')}")
            print(f"  Mapped Collection: {coll.get('mapped_collection_id')}")
            if verbose:
                print(f"  Base Path: {coll.get('collection_base_path', '/')}")
                print(f"  Public: {coll.get('public', False)}")


def display_storage_gateways(gateways: list, gcs_client=None):
    """Display storage gateways in a formatted way."""
    if not gateways:
        print("No storage gateways found")
        return
    
    print("\n=== Storage Gateways ===")
    for gw in gateways:
        print(f"\nName: {gw.get('display_name')}")
        print(f"  ID: {gw.get('id')}")
        print(f"  Type: {gw.get('connector')}")
        
        # Show allowed domains
        allowed_domains = gw.get("allowed_domains", [])
        if allowed_domains:
            print(f"  Allowed Domains: {', '.join(allowed_domains)}")
        
        # Show user credentials if we have a client
        if gcs_client:
            try:
                creds = list_user_credentials(gcs_client, gw['id'])
                if creds:
                    print("  User Credentials:")
                    for cred in creds:
                        print(f"    - {cred.get('username')} ({cred.get('identity_id')})")
            except:
                pass


def main():
    parser = argparse.ArgumentParser(
        description="Manage collections on a GCS endpoint"
    )
    
    subparsers = parser.add_subparsers(dest="command", help="Command to execute")
    
    # List command
    list_parser = subparsers.add_parser("list", help="List collections")
    list_parser.add_argument(
        "--type",
        choices=["all", "mapped", "guest"],
        default="all",
        help="Type of collections to list"
    )
    list_parser.add_argument(
        "-v", "--verbose",
        action="store_true",
        help="Show detailed information"
    )
    
    # Info command
    info_parser = subparsers.add_parser("info", help="Get collection details")
    info_parser.add_argument(
        "collection",
        help="Collection name or ID"
    )
    info_parser.add_argument(
        "--json",
        action="store_true",
        help="Output as JSON"
    )
    
    # Delete command
    delete_parser = subparsers.add_parser("delete", help="Delete a collection")
    delete_parser.add_argument(
        "collection",
        help="Collection name or ID to delete"
    )
    delete_parser.add_argument(
        "-y", "--yes",
        action="store_true",
        help="Don't ask for confirmation"
    )
    
    # Gateways command
    gw_parser = subparsers.add_parser("gateways", help="List storage gateways")
    gw_parser.add_argument(
        "-v", "--verbose",
        action="store_true",
        help="Show user credentials"
    )
    
    # Global options
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
    
    if not args.command:
        parser.print_help()
        sys.exit(1)
    
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
        # Try to get from environment or guess from hostname
        gcs_hostname = os.getenv("GCS_HOSTNAME")
        if gcs_hostname:
            gcs_url = f"https://{gcs_hostname}"
        else:
            print("ERROR: Could not determine GCS endpoint URL")
            print("Please specify --endpoint-url or set GCS_HOSTNAME")
            sys.exit(1)
    
    # Create Globus clients
    auth_client = globus_sdk.ConfidentialAppAuthClient(client_id, client_secret)
    
    # Create GCS client with collection management scope
    collection_scope = scopes.GCSEndpointScopeBuilder(endpoint_id).make_mutable("manage_collections")
    collection_authorizer = globus_sdk.ClientCredentialsAuthorizer(auth_client, scopes=collection_scope)
    gcs_client = globus_sdk.GCSClient(gcs_url, authorizer=collection_authorizer)
    
    # Execute command
    if args.command == "list":
        collections = list_collections(gcs_client)
        
        # Filter by type if requested
        if args.type == "mapped":
            collections = [c for c in collections if c.get("collection_type") != "guest"]
        elif args.type == "guest":
            collections = [c for c in collections if c.get("collection_type") == "guest"]
        
        display_collections(collections, verbose=args.verbose)
        
    elif args.command == "info":
        collections = list_collections(gcs_client)
        
        # Find collection by name or ID
        target_collection = None
        for coll in collections:
            if (coll.get("display_name") == args.collection or 
                coll.get("id") == args.collection):
                target_collection = coll
                break
        
        if not target_collection:
            print(f"ERROR: Collection not found: {args.collection}")
            sys.exit(1)
        
        # Get detailed info
        try:
            details = get_collection_details(gcs_client, target_collection["id"])
            
            if args.json:
                print(json.dumps(details, indent=2))
            else:
                print(utils.format_collection_info(details))
                
                # Show additional details
                if details.get("storage_gateway_id"):
                    print(f"  Storage Gateway: {details['storage_gateway_id']}")
                if details.get("allow_guest_collections") is not None:
                    print(f"  Guest Collections Allowed: {details['allow_guest_collections']}")
                if details.get("enable_anonymous_writes") is not None:
                    print(f"  Anonymous Writes: {details['enable_anonymous_writes']}")
                    
        except Exception as e:
            print(f"ERROR: Could not get collection details: {e}")
            sys.exit(1)
            
    elif args.command == "delete":
        collections = list_collections(gcs_client)
        
        # Find collection by name or ID
        target_collection = None
        for coll in collections:
            if (coll.get("display_name") == args.collection or 
                coll.get("id") == args.collection):
                target_collection = coll
                break
        
        if not target_collection:
            print(f"ERROR: Collection not found: {args.collection}")
            sys.exit(1)
        
        # Confirm deletion
        print(f"About to delete collection:")
        print(utils.format_collection_info(target_collection))
        
        if not args.yes:
            if not utils.confirm_action("Are you sure you want to delete this collection?"):
                print("Aborted")
                sys.exit(0)
        
        # Delete collection
        if delete_collection(gcs_client, target_collection["id"]):
            print(f"Successfully deleted collection: {target_collection['display_name']}")
        else:
            print("Failed to delete collection")
            sys.exit(1)
            
    elif args.command == "gateways":
        gateways = list_storage_gateways(gcs_client)
        display_storage_gateways(
            gateways, 
            gcs_client=gcs_client if args.verbose else None
        )


if __name__ == "__main__":
    main()
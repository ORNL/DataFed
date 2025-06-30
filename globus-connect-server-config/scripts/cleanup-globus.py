#!/usr/bin/env python3
"""
Clean up Globus Connect Server resources from the cloud.
This script removes the GCS endpoint, clients, project, and groups.
"""

import os
import sys
import subprocess
import json
import argparse
import globus_sdk
from globus_sdk import AuthClient, GroupsClient
from globus_sdk.scopes import GroupsScopes
import utils


def get_confirmation(message):
    """Get user confirmation for destructive actions."""
    print(f"\n{message}")
    response = input("Are you sure you want to continue? (yes/no): ")
    return response.lower() == "yes"


def cleanup_gcs_endpoint(auth_client, client_id, client_secret, deployment_key_path):
    """Run globus-connect-server endpoint cleanup command."""
    if not os.path.exists(deployment_key_path):
        print(f"Deployment key not found at {deployment_key_path}")
        return False
    
    if not utils.command_exists("globus-connect-server"):
        print("Warning: globus-connect-server CLI not found.")
        print("The endpoint must be cleaned up manually or from a system with GCS installed.")
        return False
    
    print("Running globus-connect-server endpoint cleanup...")
    
    bash_command = f'GCS_CLI_CLIENT_ID="{client_id}" '
    bash_command += f'GCS_CLI_CLIENT_SECRET="{client_secret}" '
    bash_command += "globus-connect-server endpoint cleanup "
    bash_command += f'--deployment-key "{deployment_key_path}" '
    bash_command += "--agree-to-delete-endpoint"
    
    print(f"Command: {bash_command}")
    
    try:
        proc = subprocess.Popen(
            bash_command,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            universal_newlines=True,
            shell=True,
            text=True,
        )
        
        output, error = proc.communicate()
        
        if output:
            print(output)
        if error:
            print(error)
        
        return proc.returncode == 0
    except Exception as e:
        print(f"Error running cleanup command: {e}")
        return False


def delete_all_non_gcs_clients(auth_client, project_id):
    """Delete all clients in the project except GCS endpoints."""
    clients = utils.get_clients_in_project(auth_client, project_id)
    deleted_count = 0
    
    for client in clients:
        if (
            client["project"] == project_id
            and client.get("client_type") != "globus_connect_server"
        ):
            try:
                auth_client.delete_client(client["id"])
                print(f"Deleted client: {client['name']} ({client['id']})")
                deleted_count += 1
            except Exception as e:
                print(f"Error deleting client {client['name']}: {e}")
    
    return deleted_count


def delete_group(groups_client, group_name):
    """Delete a group by name."""
    try:
        my_groups = groups_client.get_my_groups()
        for group in my_groups:
            if group["name"] == group_name:
                groups_client.delete_group(group["id"])
                print(f"Deleted group: {group_name} ({group['id']})")
                return True
    except Exception as e:
        print(f"Error deleting group {group_name}: {e}")
    return False


def main():
    parser = argparse.ArgumentParser(description="Clean up Globus Connect Server resources")
    parser.add_argument(
        "--force", 
        action="store_true", 
        help="Skip confirmation prompts"
    )
    parser.add_argument(
        "--keep-project",
        action="store_true",
        help="Keep the Globus project (only remove endpoint and clients)"
    )
    args = parser.parse_args()

    # Configuration from environment variables
    CLIENT_ID = os.getenv("GLOBUS_NATIVE_APP_ID", "f8d0afca-7ac4-4a3c-ac05-f94f5d9afce8")
    GCS_ROOT_NAME = os.getenv("GCS_ROOT_NAME", "GCS Endpoint")
    PROJECT_NAME = os.getenv("GCS_PROJECT_NAME", f"{GCS_ROOT_NAME} Project")
    CLIENT_NAME = os.getenv("GCS_CLIENT_NAME", f"{GCS_ROOT_NAME} Setup Client")
    ENDPOINT_NAME = os.getenv("GCS_ENDPOINT_NAME", f"{GCS_ROOT_NAME}")
    GROUP_NAME = f"{GCS_ROOT_NAME} Group"
    
    # File paths
    CRED_FILE_PATH = os.getenv("CRED_FILE_PATH", "./globus/client_cred.json")
    DEPLOYMENT_KEY_PATH = os.getenv("DEPLOYMENT_KEY_PATH", "./globus/deployment-key.json")
    
    print("=== Globus Connect Server Cleanup ===")
    print(f"Project: {PROJECT_NAME}")
    print(f"Endpoint: {ENDPOINT_NAME}")
    
    if not args.force:
        if not get_confirmation("This will permanently delete your GCS endpoint and associated resources."):
            print("Cleanup cancelled.")
            return
    
    # Check if credential files exist
    if not os.path.exists(CRED_FILE_PATH):
        print(f"Error: Client credentials not found at {CRED_FILE_PATH}")
        print("Please ensure you have initialized the endpoint first.")
        sys.exit(1)
    
    # Load client credentials
    try:
        with open(CRED_FILE_PATH, "r") as f:
            cred_data = json.load(f)
            setup_client_id = cred_data.get("client")
            setup_client_secret = cred_data.get("secret")
    except Exception as e:
        print(f"Error reading credentials: {e}")
        sys.exit(1)
    
    # Authenticate
    print("\n1. Authenticating with Globus...")
    client = globus_sdk.NativeAppAuthClient(CLIENT_ID)
    group_scope = GroupsScopes.make_mutable("all")
    client.oauth2_start_flow(
        requested_scopes="openid profile email "
        "urn:globus:auth:scope:auth.globus.org:manage_projects "
        "urn:globus:auth:scope:auth.globus.org:view_identities " + str(group_scope),
        refresh_tokens=True,
    )
    
    authorize_url = client.oauth2_get_authorize_url(query_params={"prompt": "login"})
    print(f"\nPlease go to this URL and login:\n{authorize_url}")
    auth_code = input("\nPlease enter the authorization code: ")
    
    try:
        token_response = client.oauth2_exchange_code_for_tokens(auth_code)
    except Exception as e:
        print(f"Error exchanging auth code: {e}")
        sys.exit(1)
    
    # Create authorized clients
    refresh_token_auth = token_response.by_resource_server["auth.globus.org"]["refresh_token"]
    refresh_token_groups = token_response.by_resource_server["groups.api.globus.org"]["refresh_token"]
    
    rt_authorizer = globus_sdk.RefreshTokenAuthorizer(refresh_token_auth, client)
    rt_authorizer_groups = globus_sdk.RefreshTokenAuthorizer(refresh_token_groups, client)
    
    auth_client = AuthClient(authorizer=rt_authorizer)
    groups_client = GroupsClient(authorizer=rt_authorizer_groups)
    
    # Get user info
    userinfo = auth_client.oauth2_userinfo()
    print(f"Authenticated as: {userinfo['preferred_username']}")
    
    # Check if project exists
    print(f"\n2. Checking for project '{PROJECT_NAME}'...")
    project_id = utils.get_project_id(auth_client, PROJECT_NAME)
    
    if not project_id:
        print(f"Project '{PROJECT_NAME}' not found. Nothing to clean up.")
        return
    
    print(f"Found project ID: {project_id}")
    
    # Get all clients in the project
    clients_in_project = utils.get_clients_in_project(auth_client, project_id)
    print(f"Found {len(clients_in_project)} clients in the project")
    
    # Clean up GCS endpoint if it exists
    if os.path.exists(DEPLOYMENT_KEY_PATH):
        print("\n3. Cleaning up GCS endpoint...")
        gcs_id = utils.get_endpoint_id_from_file(DEPLOYMENT_KEY_PATH)
        
        if gcs_id:
            # Check if endpoint still exists in the cloud
            valid_key = utils.is_gcs_deployment_key_valid(
                auth_client, project_id, ENDPOINT_NAME, gcs_id
            )
            
            if valid_key:
                # Use the setup client credentials for cleanup
                cleanup_success = cleanup_gcs_endpoint(
                    auth_client, setup_client_id, setup_client_secret, DEPLOYMENT_KEY_PATH
                )
                
                if cleanup_success:
                    print("GCS endpoint cleaned up successfully")
                else:
                    print("Warning: GCS endpoint cleanup may have failed")
            else:
                print("GCS endpoint not found in cloud (may have been deleted already)")
    
    # Delete all non-GCS clients
    print("\n4. Cleaning up clients...")
    deleted_count = delete_all_non_gcs_clients(auth_client, project_id)
    print(f"Deleted {deleted_count} non-GCS clients")
    
    # Try to delete the project
    if not args.keep_project:
        print(f"\n5. Attempting to delete project '{PROJECT_NAME}'...")
        try:
            auth_client.delete_project(project_id)
            print(f"Successfully deleted project '{PROJECT_NAME}'")
        except Exception as e:
            print(f"Could not delete project: {e}")
            print("The project may still contain GCS endpoints or other resources.")
    
    # Clean up groups
    print(f"\n6. Cleaning up groups...")
    if delete_group(groups_client, GROUP_NAME):
        print(f"Deleted group '{GROUP_NAME}'")
    else:
        print(f"Group '{GROUP_NAME}' not found or could not be deleted")
    
    print("\n=== Cleanup Complete ===")
    print("\nNote: Local files (credentials, deployment keys) have NOT been deleted.")
    print("To remove local files, run: ./bin/cleanup.sh --local")


if __name__ == "__main__":
    main()
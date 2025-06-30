#!/usr/bin/env python3
"""
Initialize Globus Connect Server endpoint using DataFed's proven approach.
This script creates the necessary Globus project, client credentials,
and deployment key for GCS.
"""

import os
import sys
import globus_sdk
from globus_sdk import AuthClient, GroupsClient
from globus_sdk.scopes import GroupsScopes
import utils

# Configuration from environment variables
CLIENT_ID = os.getenv("GLOBUS_NATIVE_APP_ID", "f8d0afca-7ac4-4a3c-ac05-f94f5d9afce8")  # Native app client ID
GCS_ROOT_NAME = os.getenv("GCS_ROOT_NAME", "GCS Endpoint")
PROJECT_NAME = os.getenv("GCS_PROJECT_NAME", f"{GCS_ROOT_NAME} Project")
CLIENT_NAME = os.getenv("GCS_CLIENT_NAME", f"{GCS_ROOT_NAME} Setup Client")
CRED_NAME = os.getenv("GCS_CRED_NAME", f"{GCS_ROOT_NAME} Credentials")
ENDPOINT_NAME = os.getenv("GCS_ENDPOINT_NAME", f"{GCS_ROOT_NAME}")
SUBSCRIPTION_ID = os.getenv("GLOBUS_SUBSCRIPTION_ID", "")
CONTROL_PORT = os.getenv("GCS_CONTROL_PORT", "443")

# File paths - use environment variables if running on host, otherwise container paths
CRED_FILE_PATH = os.getenv("CRED_FILE_PATH", "/opt/globus/client_cred.json")
DEPLOYMENT_KEY_PATH = os.getenv("DEPLOYMENT_KEY_PATH", "/opt/globus/deployment-key.json")


def setup_subscription_group(groups_client, subscription_id, group_name, client_id):
    """Set up subscription group if subscription ID is provided."""
    if not subscription_id:
        print("No subscription ID provided, skipping group setup")
        return
    
    try:
        # Get subscription group
        result = groups_client.get_group_by_subscription_id(subscription_id)
        parent_group_id = result["group_id"]
        
        # Check if subgroup exists
        my_groups = groups_client.get_my_groups()
        group_id = None
        for group in my_groups:
            if group["name"] == group_name:
                group_id = group["id"]
                print(f"Group '{group_name}' already exists")
                break
        
        if not group_id:
            # Create subgroup
            package = {
                "name": group_name,
                "description": f"Group for {GCS_ROOT_NAME} GCS endpoint management",
                "parent_id": str(parent_group_id)
            }
            result = groups_client.create_group(package)
            group_id = result["id"]
            print(f"Created group '{group_name}' with ID: {group_id}")
        
        # Add client as admin
        batch = globus_sdk.BatchMembershipActions()
        batch.add_members(client_id, role="admin")
        groups_client.batch_membership_action(group_id, batch)
        
        # Associate with subscription
        groups_client.update_group(group_id, {"subscription_id": subscription_id})
        print(f"Associated group with subscription {subscription_id}")
        
    except Exception as e:
        print(f"Warning: Could not set up subscription group: {e}")


def main():
    """Main initialization function."""
    print("=== Globus Connect Server Initialization ===")
    print(f"Endpoint Name: {ENDPOINT_NAME}")
    print(f"Project Name: {PROJECT_NAME}")
    print()
    
    # Check if deployment key already exists
    if os.path.exists(DEPLOYMENT_KEY_PATH):
        print(f"Deployment key already exists at {DEPLOYMENT_KEY_PATH}")
        print("If you want to reinitialize, please remove this file first.")
        return
    
    # Initialize native app client
    client = globus_sdk.NativeAppAuthClient(CLIENT_ID)
    
    # Request necessary scopes
    group_scope = GroupsScopes.make_mutable("all")
    client.oauth2_start_flow(
        requested_scopes="openid profile email "
        "urn:globus:auth:scope:auth.globus.org:manage_projects "
        "urn:globus:auth:scope:auth.globus.org:view_identities " + str(group_scope),
        refresh_tokens=True
    )
    
    # Get authorization
    authorize_url = client.oauth2_get_authorize_url(query_params={"prompt": "login"})
    print("Please go to this URL and login:")
    print(authorize_url)
    print()
    auth_code = input("Please enter the authorization code: ")
    
    # Exchange code for tokens
    token_response = client.oauth2_exchange_code_for_tokens(auth_code)
    
    # Create authorizers
    auth_tokens = token_response.by_resource_server["auth.globus.org"]
    auth_authorizer = globus_sdk.RefreshTokenAuthorizer(
        auth_tokens["refresh_token"], 
        client
    )
    
    groups_tokens = token_response.by_resource_server.get("groups.api.globus.org", {})
    groups_authorizer = None
    if groups_tokens:
        groups_authorizer = globus_sdk.RefreshTokenAuthorizer(
            groups_tokens["refresh_token"], 
            client
        )
    
    # Create clients
    auth_client = AuthClient(authorizer=auth_authorizer)
    groups_client = GroupsClient(authorizer=groups_authorizer) if groups_authorizer else None
    
    # Get user info
    userinfo = auth_client.oauth2_userinfo()
    print(f"Authenticated as: {userinfo['preferred_username']}")
    print()
    
    # Create or get project using DataFed's proven approach
    if not utils.project_exists(auth_client, PROJECT_NAME):
        project_id = utils.create_project(auth_client, PROJECT_NAME, userinfo)
        print(f"Created project '{PROJECT_NAME}' with ID: {project_id}")
    else:
        project_id = utils.get_project_id(auth_client, PROJECT_NAME)
        print(f"Using existing project '{PROJECT_NAME}' with ID: {project_id}")
    
    # Verify we have exactly one project with this name
    count = utils.count_projects(auth_client, PROJECT_NAME)
    if count != 1:
        print(f"Error: Found {count} projects with name '{PROJECT_NAME}', expected exactly 1")
        sys.exit(1)
    
    # Create client and credentials using DataFed's robust approach
    print()
    print("Setting up Globus client and credentials...")
    try:
        client_id, client_secret = utils.create_client(
            auth_client, 
            CLIENT_NAME, 
            project_id, 
            CRED_NAME,
            CRED_FILE_PATH
        )
        print(f"Client ID: {client_id}")
        print(f"Credentials saved to: {CRED_FILE_PATH}")
    except Exception as e:
        print(f"Error setting up client: {e}")
        sys.exit(1)
    
    # Update project admins to include both user and client
    identity_id = userinfo["sub"]
    try:
        auth_client.update_project(project_id, admin_ids=[identity_id, client_id])
        print("Added client as project admin")
    except Exception as e:
        print(f"Warning: Could not add client as project admin: {e}")
    
    # Set up subscription group if applicable
    if SUBSCRIPTION_ID and groups_client:
        group_name = f"{GCS_ROOT_NAME} Group"
        setup_subscription_group(groups_client, SUBSCRIPTION_ID, group_name, client_id)
    
    # Create GCS endpoint using DataFed's proven approach
    print()
    print("Setting up GCS endpoint...")
    try:
        utils.create_gcs_endpoint(
            auth_client,
            client_id,
            client_secret,
            project_id,
            DEPLOYMENT_KEY_PATH,
            ENDPOINT_NAME,
            CONTROL_PORT,
            userinfo,
        )
    except Exception as e:
        print(f"Error setting up GCS endpoint: {e}")
        sys.exit(1)
    
    print()
    print("=== Initialization Complete ===")
    print(f"Project ID: {project_id}")
    print(f"Client ID: {client_id}")
    print(f"Credentials saved to: {CRED_FILE_PATH}")
    print(f"Deployment key saved to: {DEPLOYMENT_KEY_PATH}")
    print()
    print("Next steps:")
    print("1. The GCS endpoint has been configured automatically")
    print("2. Use the setup-globus.sh script to configure storage gateways and collections")
    print("3. Start the docker compose services")


if __name__ == "__main__":
    main()
#!/usr/bin/env python3
"""
Initialize Globus Connect Server endpoint.
This script creates the necessary Globus project, client credentials,
and deployment key for GCS.
"""

import os
import sys
import json
import globus_sdk
from globus_sdk import AuthClient, GroupsClient
from globus_sdk.scopes import GroupsScopes

# Configuration from environment variables
CLIENT_ID = os.getenv("INIT_CLIENT_ID", "f8d0afca-7ac4-4a3c-ac05-f94f5d9afce8")  # Native app client ID
GCS_ROOT_NAME = os.getenv("GCS_ROOT_NAME", "GCS Endpoint")
PROJECT_NAME = os.getenv("GCS_PROJECT_NAME", f"{GCS_ROOT_NAME} Project")
CLIENT_NAME = os.getenv("GCS_CLIENT_NAME", f"{GCS_ROOT_NAME} Setup Client")
CRED_NAME = os.getenv("GCS_CRED_NAME", f"{GCS_ROOT_NAME} Credentials")
ENDPOINT_NAME = os.getenv("GCS_ENDPOINT_NAME", f"{GCS_ROOT_NAME}")
SUBSCRIPTION_ID = os.getenv("GLOBUS_SUBSCRIPTION_ID", "")
CONTROL_PORT = os.getenv("GCS_CONTROL_PORT", "443")

# File paths
CRED_FILE_PATH = "/opt/globus/client_cred.json"
DEPLOYMENT_KEY_PATH = "/opt/globus/deployment-key.json"


def get_project_id(auth_client, project_name):
    """Get project ID by name."""
    projects = auth_client.get_projects()
    for project in projects:
        if project["display_name"] == project_name:
            return project["id"]
    return None


def create_project(auth_client, project_name, userinfo):
    """Create a new project if it doesn't exist."""
    project_id = get_project_id(auth_client, project_name)
    if project_id:
        print(f"Project '{project_name}' already exists with ID: {project_id}")
        return project_id
    
    identity_id = userinfo["sub"]
    email = userinfo["email"]
    
    result = auth_client.create_project(
        project_name, 
        contact_email=email, 
        admin_ids=[identity_id]
    )
    project_id = result["project"]["id"]
    print(f"Created project '{project_name}' with ID: {project_id}")
    return project_id


def get_client_id(auth_client, client_name, project_id):
    """Get client ID by name and project."""
    clients = auth_client.get_clients()
    for client in clients["clients"]:
        if client["name"] == client_name and client["project"] == project_id:
            return client["id"]
    return None


def create_client(auth_client, client_name, project_id, cred_name):
    """Create confidential client and credentials."""
    client_id = get_client_id(auth_client, client_name, project_id)
    
    if client_id:
        print(f"Client '{client_name}' already exists with ID: {client_id}")
        # Check if we have valid credentials
        if os.path.exists(CRED_FILE_PATH):
            with open(CRED_FILE_PATH, 'r') as f:
                creds = json.load(f)
                if creds.get("client") == client_id:
                    print("Using existing credentials")
                    return client_id, creds["secret"]
    else:
        # Create new client
        result = auth_client.create_client(
            client_name, 
            project=project_id, 
            public_client=False
        )
        client_id = result["client"]["id"]
        print(f"Created client '{client_name}' with ID: {client_id}")
    
    # Create new credentials
    cred_result = auth_client.create_client_credential(client_id, cred_name)
    
    # Save credentials to file
    cred_data = {
        "client": client_id,
        "id": cred_result["credential"]["id"],
        "name": cred_result["credential"]["name"],
        "secret": cred_result["credential"]["secret"]
    }
    
    os.makedirs(os.path.dirname(CRED_FILE_PATH), exist_ok=True)
    with open(CRED_FILE_PATH, 'w') as f:
        json.dump(cred_data, f, indent=2)
    
    print(f"Saved credentials to {CRED_FILE_PATH}")
    return client_id, cred_result["credential"]["secret"]


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
    
    # Create project
    project_id = create_project(auth_client, PROJECT_NAME, userinfo)
    
    # Create client and credentials
    client_id, client_secret = create_client(
        auth_client, 
        CLIENT_NAME, 
        project_id, 
        CRED_NAME
    )
    
    # Update project admins
    identity_id = userinfo["sub"]
    auth_client.update_project(project_id, admin_ids=[identity_id, client_id])
    print(f"Added client as project admin")
    
    # Set up subscription group if applicable
    if SUBSCRIPTION_ID and groups_client:
        group_name = f"{GCS_ROOT_NAME} Group"
        setup_subscription_group(groups_client, SUBSCRIPTION_ID, group_name, client_id)
    
    print()
    print("=== Initialization Complete ===")
    print(f"Project ID: {project_id}")
    print(f"Client ID: {client_id}")
    print(f"Credentials saved to: {CRED_FILE_PATH}")
    print()
    print("Next steps:")
    print("1. Run 'globus-connect-server endpoint setup' using these credentials")
    print("2. The deployment key will be saved to:", DEPLOYMENT_KEY_PATH)
    print("3. Use the setup-globus.sh script to configure storage gateways and collections")


if __name__ == "__main__":
    main()
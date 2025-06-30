#!/usr/bin/env python3
"""
Utilities for Globus Connect Server credential management.
Adapted from DataFed's proven approach for production use.
"""

import json
import os
import subprocess
import sys


def get_project_id(auth_client, project_name):
    """Get project ID by name."""
    projects = auth_client.get_projects()
    for project in projects:
        if project["display_name"] == project_name:
            return project["id"]
    return None


def project_exists(auth_client, project_name):
    """Check if project exists."""
    project_id = get_project_id(auth_client, project_name)
    return project_id is not None


def create_project(auth_client, project_name, userinfo):
    """Create a new project if it doesn't exist."""
    identity_id = userinfo["sub"]
    email = userinfo["email"]

    if not project_exists(auth_client, project_name):
        project_create_result = auth_client.create_project(
            project_name, contact_email=email, admin_ids=[identity_id]
        )
        return project_create_result["project"]["id"]

    return get_project_id(auth_client, project_name)


def count_projects(auth_client, project_name):
    """Count projects with given name."""
    projects = auth_client.get_projects()
    count = 0
    for project in projects:
        if project["display_name"] == project_name:
            count += 1
    return count


def get_client_id(auth_client, client_name, project_id):
    """Get client ID by name and project."""
    get_client_result = auth_client.get_clients()
    for client in get_client_result["clients"]:
        if client["name"] == client_name and client["project"] == project_id:
            return client["id"]
    return None


def get_clients_in_project(auth_client, project_id):
    """Get all clients in a project."""
    get_client_result = auth_client.get_clients()
    clients_in_project = []
    for client in get_client_result["clients"]:
        if client["project"] == project_id:
            clients_in_project.append(client)
    return clients_in_project


def create_new_client(auth_client, client_name, project_id):
    """Create a new confidential client."""
    client_id = get_client_id(auth_client, client_name, project_id)

    if not client_id:
        result = auth_client.create_client(
            client_name, project=project_id, public_client=False
        )
        client_id = result["client"]["id"]
        print(f"Created client '{client_name}' with ID: {client_id}")
    else:
        print(f"Client '{client_name}' already exists with ID: {client_id}")

    return client_id


def get_credential_id(auth_client, client_id, cred_name):
    """Get credential ID by name."""
    get_client_cred_result = auth_client.get_client_credentials(client_id)
    for cred in get_client_cred_result["credentials"]:
        if cred["name"] == cred_name:
            return cred["id"]
    return None


def valid_file(file_name):
    """Check if file exists and is not empty."""
    file_exists = False
    file_empty = True
    if os.path.exists(file_name):
        file_exists = True
        file_size = os.path.getsize(file_name)
        if file_size != 0:
            file_empty = False
    return file_exists, file_empty


def get_credential_from_file(cred_file_name, client_id):
    """Get credential secret from file if it matches client ID."""
    _, cred_empty = valid_file(cred_file_name)
    if not cred_empty:
        try:
            with open(cred_file_name, "r") as f:
                loaded_data = json.load(f)
                if loaded_data.get("client") == client_id:
                    return loaded_data.get("secret")
        except (json.JSONDecodeError, KeyError) as e:
            print(f"Warning: Could not read credential file: {e}")
    return None


def get_client_id_from_cred_file(cred_file_name):
    """Get client ID from credential file."""
    _, cred_empty = valid_file(cred_file_name)
    if not cred_empty:
        try:
            with open(cred_file_name, "r") as f:
                loaded_data = json.load(f)
                return loaded_data.get("client")
        except (json.JSONDecodeError, KeyError) as e:
            print(f"Warning: Could not read credential file: {e}")
    return None


def create_new_credential(auth_client, client_id, cred_name, cred_file):
    """Create new credential and save to file."""
    # Delete existing credentials
    get_client_cred_result = auth_client.get_client_credentials(client_id)
    for cred in get_client_cred_result["credentials"]:
        print(f"Deleting old credential: {cred['name']}")
        auth_client.delete_client_credential(client_id, cred["id"])

    # Create new credential
    cred_result = auth_client.create_client_credential(client_id, cred_name)
    
    # Prepare credential data
    obj = {
        "client": cred_result["credential"]["client"],
        "id": cred_result["credential"]["id"],
        "name": cred_result["credential"]["name"],
        "secret": cred_result["credential"]["secret"],
    }

    # Ensure directory exists
    folder_path = os.path.dirname(cred_file)
    if not os.path.exists(folder_path):
        try:
            os.makedirs(folder_path)
            print(f"Created directory: {folder_path}")
        except OSError as e:
            print(f"Failed to create directory '{folder_path}': {e}")
            return None

    print(f"Saving credentials to: {cred_file}")
    try:
        with open(cred_file, "w") as f:
            json.dump(obj, f, indent=2)
        # Set secure permissions
        os.chmod(cred_file, 0o600)
    except OSError as e:
        print(f"Failed to write credential file: {e}")
        return None

    return cred_result["credential"]["secret"]


def get_client_secret(auth_client, client_id, cred_name, cred_id, cred_file):
    """Get client secret, creating new if needed."""
    # Try to get existing secret from file
    client_secret = get_credential_from_file(cred_file, client_id)

    if client_secret:
        print("Using existing credentials from file")
        return client_secret

    # Clean up old credential if it exists
    if cred_id:
        try:
            auth_client.delete_client_credential(client_id, cred_id)
            print("Deleted old credential from Globus")
        except Exception as e:
            print(f"Warning: Could not delete old credential: {e}")

    # Remove old credential file
    if os.path.exists(cred_file):
        try:
            os.remove(cred_file)
            print("Removed old credential file")
        except OSError as e:
            print(f"Warning: Could not remove old credential file: {e}")

    # Create new credential
    client_secret = create_new_credential(auth_client, client_id, cred_name, cred_file)
    return client_secret


def create_client(auth_client, client_name, project_id, cred_name, cred_file):
    """
    Create or get confidential client and manage credentials.
    
    This is the main function that combines client creation and credential management.
    Returns tuple of (client_id, client_secret).
    """
    print(f"Setting up client: {client_name}")
    
    # Create or get client
    client_id = create_new_client(auth_client, client_name, project_id)

    # Get credential ID if it exists
    cred_id = get_credential_id(auth_client, client_id, cred_name)

    # Get or create client secret
    client_secret = get_client_secret(
        auth_client, client_id, cred_name, cred_id, cred_file
    )

    if not client_secret:
        raise Exception("Failed to create or retrieve client secret")

    print(f"Client setup complete. ID: {client_id}")
    return client_id, client_secret


def get_endpoint_id_from_file(deployment_key_file_path):
    """Get endpoint client ID from deployment key file."""
    _, empty = valid_file(deployment_key_file_path)
    if not empty:
        try:
            with open(deployment_key_file_path, "r") as f:
                loaded_data = json.load(f)
                return loaded_data.get("client_id")
        except (json.JSONDecodeError, KeyError) as e:
            print(f"Warning: Could not read deployment key file: {e}")
    return None


def command_exists(command):
    """Check if command exists in PATH."""
    try:
        subprocess.check_call(
            ["which", command], 
            stdout=subprocess.DEVNULL, 
            stderr=subprocess.DEVNULL
        )
        return True
    except subprocess.CalledProcessError:
        return False


def is_gcs_deployment_key_valid(auth_client, project_id, endpoint_name, gcs_id):
    """Check if GCS deployment key is still valid."""
    if not gcs_id:
        return False

    clients_in_project = get_clients_in_project(auth_client, project_id)
    
    for client in clients_in_project:
        if (
            client.get("client_type") == "globus_connect_server"
            and client.get("name") == endpoint_name
            and client.get("id") == gcs_id
        ):
            print("Deployment key is still valid")
            return True
    
    return False


def create_gcs_endpoint(
    auth_client,
    client_id,
    client_secret,
    project_id,
    deployment_key_file,
    endpoint_name,
    control_port,
    userinfo,
):
    """Create Globus Connect Server endpoint using GCS CLI."""
    email = userinfo["email"]
    username = userinfo["preferred_username"]
    organization = userinfo.get("identity_provider_display_name", "Unknown Organization")

    # Check if deployment key already exists and is valid
    gcs_id_from_deployment_key = get_endpoint_id_from_file(deployment_key_file)
    
    valid_key = is_gcs_deployment_key_valid(
        auth_client, project_id, endpoint_name, gcs_id_from_deployment_key
    )

    if valid_key:
        print("Using existing deployment key")
        return

    if gcs_id_from_deployment_key and not valid_key:
        print(
            "Warning: Deployment key exists but is invalid for this project. "
            "The endpoint may have been deleted or moved to another project."
        )

    # Check if GCS CLI is available
    if not command_exists("globus-connect-server"):
        print("Error: globus-connect-server CLI is required but not found")
        print("Please install Globus Connect Server CLI")
        sys.exit(1)

    print(f"Creating new GCS endpoint: {endpoint_name}")
    
    # Build GCS setup command
    env_vars = {
        "GCS_CLI_CLIENT_ID": client_id,
        "GCS_CLI_CLIENT_SECRET": client_secret,
    }
    
    cmd = [
        "globus-connect-server", "endpoint", "setup", endpoint_name,
        "--organization", organization,
        "--project-id", project_id,
        "--agree-to-letsencrypt-tos",
        "--project-admin", username,
        "--owner", f"{client_id}@clients.auth.globus.org",
        "--contact-email", email,
        "--deployment-key", deployment_key_file,
    ]

    print("Running GCS setup command...")
    print(f"Command: {' '.join(cmd)}")
    
    try:
        # Set environment variables and run command
        env = os.environ.copy()
        env.update(env_vars)
        
        process = subprocess.run(
            cmd,
            env=env,
            capture_output=False,
            text=True,
            check=True
        )
        
        print("GCS endpoint setup completed successfully")
        
        # Verify deployment key was created
        deployment_key_exists, deployment_key_empty = valid_file(deployment_key_file)
        if not deployment_key_exists or deployment_key_empty:
            print(f"Error: Deployment key not created at {deployment_key_file}")
            sys.exit(1)
            
        print(f"Deployment key saved to: {deployment_key_file}")
        
    except subprocess.CalledProcessError as e:
        print(f"Error running GCS setup: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"Unexpected error during GCS setup: {e}")
        sys.exit(1)
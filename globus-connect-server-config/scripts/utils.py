#!/usr/bin/env python3
"""
Utility functions for Globus Connect Server management.
General purpose helpers that can be used across different scripts.
"""

import json
import os
import sys
from typing import Optional, Dict, List, Tuple


def load_json_file(file_path: str) -> Optional[Dict]:
    """
    Load JSON data from a file.
    
    Args:
        file_path: Path to JSON file
        
    Returns:
        Dict with JSON data or None if error
    """
    try:
        if os.path.exists(file_path):
            with open(file_path, 'r') as f:
                return json.load(f)
    except Exception as e:
        print(f"Error loading JSON from {file_path}: {e}")
    return None


def save_json_file(data: Dict, file_path: str) -> bool:
    """
    Save data to a JSON file.
    
    Args:
        data: Dictionary to save
        file_path: Path to save file
        
    Returns:
        True if successful, False otherwise
    """
    try:
        os.makedirs(os.path.dirname(file_path), exist_ok=True)
        with open(file_path, 'w') as f:
            json.dump(data, f, indent=2)
        return True
    except Exception as e:
        print(f"Error saving JSON to {file_path}: {e}")
        return False


def get_client_credentials(cred_file: str = "/opt/globus/client_cred.json") -> Tuple[Optional[str], Optional[str]]:
    """
    Get client ID and secret from credentials file.
    
    Args:
        cred_file: Path to credentials JSON file
        
    Returns:
        Tuple of (client_id, client_secret) or (None, None) if not found
    """
    creds = load_json_file(cred_file)
    if creds:
        return creds.get("client"), creds.get("secret")
    return None, None


def get_endpoint_id(deployment_key_file: str = "/opt/globus/deployment-key.json") -> Optional[str]:
    """
    Get endpoint ID from deployment key file.
    
    Args:
        deployment_key_file: Path to deployment key JSON file
        
    Returns:
        Endpoint ID or None if not found
    """
    deployment_data = load_json_file(deployment_key_file)
    if deployment_data:
        return deployment_data.get("client_id")
    return None


def get_project_id(auth_client, project_name: str) -> Optional[str]:
    """
    Get project ID by name.
    
    Args:
        auth_client: Globus Auth client
        project_name: Name of the project
        
    Returns:
        Project ID or None if not found
    """
    try:
        projects = auth_client.get_projects()
        for project in projects:
            if project["display_name"] == project_name:
                return project["id"]
    except Exception as e:
        print(f"Error getting project ID: {e}")
    return None


def find_collection_by_name(collections: List[Dict], name: str) -> Optional[Dict]:
    """
    Find a collection by display name.
    
    Args:
        collections: List of collection dictionaries
        name: Display name to search for
        
    Returns:
        Collection dict or None if not found
    """
    for collection in collections:
        if collection.get("display_name") == name:
            return collection
    return None


def find_storage_gateway_by_name(gateways: List[Dict], name: str) -> Optional[Dict]:
    """
    Find a storage gateway by display name.
    
    Args:
        gateways: List of gateway dictionaries
        name: Display name to search for
        
    Returns:
        Gateway dict or None if not found
    """
    for gateway in gateways:
        if gateway.get("display_name") == name:
            return gateway
    return None


def parse_uuid_from_cli_output(output: str, name: str) -> Optional[str]:
    """
    Parse UUID from globus-connect-server CLI output.
    
    Args:
        output: CLI output string
        name: Name to search for in the output
        
    Returns:
        UUID string or None if not found
    """
    lines = output.strip().split('\n')
    for line in lines:
        if name in line:
            # UUID is typically the last field
            parts = line.split()
            if parts:
                return parts[-1]
    return None


def validate_environment_variables(required_vars: List[str]) -> bool:
    """
    Validate that required environment variables are set.
    
    Args:
        required_vars: List of required environment variable names
        
    Returns:
        True if all are set, False otherwise
    """
    missing = []
    for var in required_vars:
        if not os.getenv(var):
            missing.append(var)
    
    if missing:
        print(f"ERROR: Missing required environment variables: {', '.join(missing)}")
        return False
    return True


def format_collection_info(collection: Dict) -> str:
    """
    Format collection information for display.
    
    Args:
        collection: Collection dictionary
        
    Returns:
        Formatted string
    """
    info = f"Collection: {collection.get('display_name', 'Unknown')}\n"
    info += f"  ID: {collection.get('id', 'N/A')}\n"
    info += f"  Type: {collection.get('collection_type', 'N/A')}\n"
    
    if collection.get('collection_type') == 'guest':
        info += f"  Base Path: {collection.get('collection_base_path', 'N/A')}\n"
        info += f"  Mapped Collection: {collection.get('mapped_collection_id', 'N/A')}\n"
    
    return info


def confirm_action(prompt: str, default: bool = False) -> bool:
    """
    Ask user for confirmation.
    
    Args:
        prompt: Question to ask
        default: Default answer if user just presses Enter
        
    Returns:
        True if confirmed, False otherwise
    """
    default_str = "Y/n" if default else "y/N"
    response = input(f"{prompt} [{default_str}]: ").strip().lower()
    
    if not response:
        return default
    
    return response in ['y', 'yes']


def load_env_file(env_file: str = ".env") -> Dict[str, str]:
    """
    Load environment variables from a .env file.
    
    Args:
        env_file: Path to .env file
        
    Returns:
        Dictionary of environment variables
    """
    env_vars = {}
    if os.path.exists(env_file):
        with open(env_file, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    # Remove quotes if present
                    value = value.strip('"').strip("'")
                    env_vars[key.strip()] = value
    return env_vars
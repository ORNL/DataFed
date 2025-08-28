import subprocess
import json
import os
import sys


def get_cached_base_path(collection_id, cache_dir):
    """Get the cached base path for a guest collection."""
    cache_file = os.path.join(cache_dir, f"guest_collection_{collection_id}_base_path.txt")
    try:
        if os.path.exists(cache_file):
            with open(cache_file, 'r') as f:
                return f.read().strip()
    except Exception as e:
        print(f"Warning: Could not read base path cache: {e}")
    return None


def cache_base_path(collection_id, base_path, cache_dir):
    """Cache the base path for a guest collection."""
    cache_file = os.path.join(cache_dir, f"guest_collection_{collection_id}_base_path.txt")
    try:
        os.makedirs(cache_dir, exist_ok=True)
        with open(cache_file, 'w') as f:
            f.write(base_path)
        print(f"Cached base path '{base_path}' for collection {collection_id}")
        return True
    except Exception as e:
        print(f"Warning: Could not cache base path: {e}")
        return False


def remove_cached_base_path(collection_id, cache_dir):
    """Remove the cached base path for a guest collection."""
    cache_file = os.path.join(cache_dir, f"guest_collection_{collection_id}_base_path.txt")
    try:
        if os.path.exists(cache_file):
            os.remove(cache_file)
            print(f"Removed old cache file for collection {collection_id}")
            return True
    except Exception as e:
        print(f"Warning: Could not remove old cache file: {e}")
    return False


def getProjectId(auth_client, project_name):
    projects = auth_client.get_projects()
    for project in projects:
        if project["display_name"] == project_name:
            return project["id"]
    return None


def projectExists(auth_client, project_name):
    project_id = getProjectId(auth_client, project_name)

    project_exists = True
    if project_id is None:
        project_exists = False
    return project_exists


def createProject(auth_client, project_name, userinfo):

    identity_id = userinfo["sub"]
    email = userinfo["email"]

    project_exists = projectExists(auth_client, project_name)

    if project_exists is False:
        project_create_result = auth_client.create_project(
            project_name, contact_email=email, admin_ids=[identity_id]
        )
        return project_create_result["project"]["id"]

    projects = auth_client.get_projects()
    return getProjectId(projects, project_name)


def countProjects(auth_client, project_name):
    projects = auth_client.get_projects()
    count = 0
    for project in projects:
        if project["display_name"] == project_name:
            count += 1
    return count


def getClientId(auth_client, client_name, project_id):
    get_client_result = auth_client.get_clients()
    for client in get_client_result["clients"]:
        if client["name"] == client_name and client["project"] == project_id:
            return client["id"]
    return None


def getAllGCSClientIds(auth_client, project_id, endpoint_name):
    clients_in_project = getClientsInProject(auth_client, project_id)
    all_gcs_client_ids = []
    for client in clients_in_project:
        if (
            client["client_type"] == "globus_connect_server"
            and client["name"] == endpoint_name
        ):
            all_gcs_client_ids.append(client["id"])
    return all_gcs_client_ids


def getClientsInProject(auth_client, project_id):
    # Get clients in project
    get_client_result = auth_client.get_clients()
    clients_in_project = []
    for client in get_client_result["clients"]:
        if client["project"] == project_id:
            clients_in_project.append(client)
    return clients_in_project


def createNewClient(auth_client, client_name, project_id):
    client_id = getClientId(auth_client, client_name, project_id)

    client_exists = False
    if client_id:
        client_exists = True

    if client_exists is False:
        result = auth_client.create_client(
            client_name, project=project_id, public_client=False
        )
        client_id = result["client"]["id"]

    return client_id


def getCredentialID(auth_client, client_id, cred_name):
    get_client_cred_result = auth_client.get_client_credentials(client_id)
    for cred in get_client_cred_result["credentials"]:
        if cred["name"] == cred_name:
            return cred["id"]
    return None


def groupExists(client, group_name):
    my_groups = client.get_my_groups()
    print("My groups")
    print(my_groups)
    for group in my_groups:
        if group["name"] == group_name:
            return True
    return False


def getGroupId(client, group_name):
    my_groups = client.get_my_groups()
    for group in my_groups:
        if group["name"] == group_name:
            return group["id"]
    return None


def deleteGroup(client, group_name):
    my_groups = client.get_my_groups()
    for group in my_groups:
        if group["name"] == group_name:
            result = client.delete_group(group["id"])
            print(f"Removing group: {group_name} with id: {group['id']}")
            print(result)


def validFile(file_name):
    file_exists = False
    file_empty = True
    if os.path.exists(file_name):
        file_exists = True
        file_size = os.path.getsize(file_name)
        # Check if the file size is 0 (empty)
        if file_size != 0:
            file_empty = False
    return file_exists, file_empty


def getCredentialFromFile(cred_file_name, cred_id):
    # Check to see if the local secret is the same id and not just the same
    # name
    _, cred_empty = validFile(cred_file_name)
    if cred_empty is False:
        with open(cred_file_name, "r") as f:
            loaded_data = json.load(f)
            if loaded_data["client"] == cred_id:
                return loaded_data["secret"]
    return None


def getClientIdFromCredFile(cred_file_name):
    # Check to see if the local secret is the same id and not just the same
    # name
    _, cred_empty = validFile(cred_file_name)
    if cred_empty is False:
        with open(cred_file_name, "r") as f:
            loaded_data = json.load(f)
            return loaded_data["client"]
    return None


def getEndpointIdFromFile(deployment_key_file_path):
    # Check to see if the local secret is the same id and not just the same
    # name
    _, empty = validFile(deployment_key_file_path)
    if empty is False:
        with open(deployment_key_file_path, "r") as f:
            loaded_data = json.load(f)
            return loaded_data["client_id"]
    return None


def createNewCredential(auth_client, client_id, cred_name, cred_file):

    get_client_cred_result = auth_client.get_client_credentials(client_id)
    for cred in get_client_cred_result["credentials"]:
        # Should have stored secret locally
        auth_client.delete_client_credential(client_id, cred["id"])

    cred_result = auth_client.create_client_credential(client_id, cred_name)
    # Have to change this to a dict
    obj = {
        "client": cred_result["credential"]["client"],
        "id": cred_result["credential"]["id"],
        "name": cred_result["credential"]["name"],
        "secret": cred_result["credential"]["secret"],
    }

    # Check that the folder exists
    folder_path = os.path.dirname(cred_file)
    if not os.path.exists(folder_path):
        try:
            os.makedirs(folder_path)
            print(f"Folder '{folder_path}' created successfully.")
        except OSError as e:
            print(f"Failed to create folder '{folder_path}': {e}")

    print(f"Creating cred file {cred_file}")

    with open(cred_file, "w") as f:
        json.dump(obj, f)

    return cred_result["credential"]["secret"]


def getClientSecret(auth_client, client_id, cred_name, cred_id, cred_file):

    client_secret = getCredentialFromFile(cred_file, cred_id)

    create_new_credential = True
    remove_cached_credential = True
    remove_old_credential = False
    if client_secret:
        create_new_credential = False
        remove_cached_credential = False
        remove_old_credential = True

    if remove_old_credential:
        auth_client.delete_client_credential(client_id, cred_id)

    if remove_cached_credential:
        if os.path.exists(cred_file):
            os.remove(cred_file)

    if create_new_credential:
        # Remove credentials from cloud
        client_secret = createNewCredential(
            auth_client, client_id, cred_name, cred_file
        )

    return client_secret


def createClient(auth_client, client_name, project_id, cred_name, cred_file):
    client_id = createNewClient(auth_client, client_name, project_id)

    cred_id = getCredentialID(auth_client, client_id, cred_name)

    client_secret = getClientSecret(
        auth_client, client_id, cred_name, cred_id, cred_file
    )
    return client_id, client_secret


def getGCSClientIDFromDeploymentFile(deployment_key_file):
    deployment_key_exists, deployment_key_empty = validFile(deployment_key_file)

    # Remove the file if it is empty
    if deployment_key_empty:
        if deployment_key_exists:
            print("Removing deployment key it is empty")
            os.remove(deployment_key_file)
    else:
        # If it is not empty get the client id
        with open(deployment_key_file, "r") as f:
            loaded_data = json.load(f)
            return loaded_data["client_id"]
    return None


def command_exists(command):
    try:
        # Use 'which' command to check if the specified command exists
        subprocess.check_call(["which", command])
        return True
    except subprocess.CalledProcessError:
        # 'which' command returns non-zero exit status if the command is not found
        return False


def isGCSDeploymentKeyValid(auth_client, project_id, endpoint_name, gcs_id):

    clients_in_project = getClientsInProject(auth_client, project_id)
    # Check if the deployment key is valid for the project
    for client in clients_in_project:
        if (
            client["client_type"] == "globus_connect_server"
            and client["name"] == endpoint_name
        ):
            if gcs_id:
                # If gcs_id exists see if it is found remotely
                if client["id"] == gcs_id:
                    print("Deployment key endpoint is still valid found in cloud")
                    return True
            else:
                # Found a globus_connect_server but did not find local deployment
                # key
                print(
                    "Found globus_connect_server already registered but did"
                    " not find deployment key locally."
                )
    return False


def deleteAllNonGCSClients(auth_client, project_id):
    clients = getClientsInProject(auth_client, project_id)
    for client in clients:
        if (
            client["project"] == project_id
            and client["client_type"] != "globus_connect_server"
        ):
            auth_client.delete_client(client["id"])


def createGCSEndpoint(
    auth_client,
    client_id,
    client_secret,
    project_id,
    deployment_key_file,
    endpoint_name,
    control_port,
    userinfo,
):

    email = userinfo["email"]
    username = userinfo["preferred_username"]
    organization = userinfo["identity_provider_display_name"]

    gcs_id_from_deployment_key = getGCSClientIDFromDeploymentFile(deployment_key_file)

    valid_key = isGCSDeploymentKeyValid(
        auth_client, project_id, endpoint_name, gcs_id_from_deployment_key
    )

    if valid_key is False and gcs_id_from_deployment_key:
        print(
            "Looks like deployment key exists but does not contain credentials "
            f"in the cloud for the project: {project_id}, please either "
            "add the correct deployment key or remove the gcs instance"
            "registered in the project"
        )
        sys.exit(1)

    # Create gcs_instance
    if valid_key is False:

        if command_exists("globus-connect-server") is False:
            print(
                "Cannot create deployment key, we require globus-connect-server to be installed"
            )
            sys.exit(1)

        else:
            bash_command = f'GCS_CLI_CLIENT_ID="{client_id}" '
            bash_command += f' GCS_CLI_CLIENT_SECRET="{client_secret}" '
            bash_command += f' globus-connect-server endpoint setup "{endpoint_name}" '
            bash_command += f' --organization "{organization}"  '
            bash_command += f' --project-id "{project_id}"  '
            bash_command += " --agree-to-letsencrypt-tos "
            bash_command += f' --project-admin "{username}" '
            bash_command += f' --owner "{client_id}@clients.auth.globus.org" '
            bash_command += f' --contact-email "{email}" '
            bash_command += f' --deployment-key "{deployment_key_file}" '
            print("Bash command to run")
            print(bash_command)

            process = subprocess.Popen(
                bash_command,
                shell=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                universal_newlines=True,
            )
            # Print the output
            for line in process.stdout:
                print(line, end="")

            deployment_key_exists, deployment_key_empty = validFile(deployment_key_file)
            if deployment_key_exists is False:
                print(
                    f"Something is wrong deployment key does not exist {deployment_key_file} "
                )
                sys.exit(1)
            if deployment_key_empty:
                print(
                    f"Something is wrong deployment key is empty {deployment_key_file} "
                )
                sys.exit(1)

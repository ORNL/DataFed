
import globus_sdk
import subprocess
from globus_sdk import AuthClient, AccessTokenAuthorizer
import json
import os
import sys


# Hard coded Native Client ID
CLIENT_ID = 'f8d0afca-7ac4-4a3c-ac05-f94f5d9afce8'
# The Globus project the GCS endpoint will be created in
PROJECT_NAME="Dev Testing"

# This is for confidential client
CLIENT_NAME = "DataFed Repo Setup Client"
# Name of the client secret used by the confidential client
CRED_NAME="DataFed Repo Cred"
# Name of the file where we will store confidential client credentials
CRED_FILE_NAME="client_cred.json"
# Name to give to endpoint
ENDPOINT_NAME="endpt-DataFed-CADES-test"
# Path to deployment key
DEPLOYMENT_KEY_PATH="./deployment-key.json"
client = globus_sdk.NativeAppAuthClient(CLIENT_ID)

# manage_projects scope to create a project
# view_identities to user information for creating GCS server
client.oauth2_start_flow(requested_scopes="openid profile email urn:globus:auth:scope:auth.globus.org:manage_projects urn:globus:auth:scope:auth.globus.org:view_identities", refresh_tokens=True)

authorize_url = client.oauth2_get_authorize_url(query_params={"prompt": "login"})
print("Please go to this URL and login: \n", authorize_url)
auth_code = input("Please enter the authorization code: ")

token_response = client.oauth2_exchange_code_for_tokens(auth_code)
# Extract the token
refresh_token_auth = token_response.by_resource_server['auth.globus.org']['refresh_token']
rt_authorizer = globus_sdk.RefreshTokenAuthorizer(refresh_token_auth, client)
# auth_client_refresh_token
ac_rt = AuthClient(authorizer=rt_authorizer)

userinfo = ac_rt.oauth2_userinfo()
# Will get the primary email and id
identity_id = userinfo["sub"]
email = userinfo["email"]
username = userinfo["preferred_username"]
organization = userinfo["identity_provider_display_name"]

def getProjectId(projects, project_name):
    for project in projects:
        if project['display_name'] == project_name:
            return project['id']
    return None


def createProject(auth_client, project_name, userinfo):

    identity_id = userinfo["sub"]
    email = userinfo["email"]

    projects = auth_client.get_projects()
    project_id = getProjectId(projects, project_name)

    project_exists = True
    if project_id is None:
        project_exists = False

    if project_exists is False:
        project_create_result = auth_client.create_project(
                project_name,
                contact_email=email,
                admin_ids=[identity_id])
        return project_create_result['project']['id']

    return None

def countProjects(auth_client, project_name):
    projects = ac_rt.get_projects()
    count = 0
    for project in projects:
        if project['display_name'] == project_name:
            count += 1
    return count

def getClientId(auth_client, client_name, project_id):
    get_client_result = ac_rt.get_clients()
    for client in get_client_result['clients']:
        if client['name'] == client_name and client['project'] == project_id:
            return client['id']
    return None


def getClientsInProject(auth_client, project_id):
    # Get clients in project
    get_client_result = auth_client.get_clients()
    clients_in_project = []
    for client in get_client_result['clients']:
        if client['project'] == project_id:
            clients_in_project.append(client)
    return clients_in_project


def createNewClient(auth_client, client_name, project_id):
    client_id = getClientId(auth_client, client_name, project_id)

    client_exists = False
    if client_id:
        client_exists = True

    if client_exists is False:
        result = auth_client.create_client(client_name, project=project_id, public_client=False)
        client_id = result["client"]["id"]

    return client_id

def getCredentialID(auth_client, client_id, cred_name):
    get_client_cred_result = auth_client.get_client_credentials(client_id)
    for cred in get_client_cred_result['credentials']:
        if cred['name'] == cred_name: 
            return cred['id']
    return None

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
    with open(cred_file_name, 'r') as f:
        loaded_data = json.load(f)
        if loaded_data['client'] == cred_id:
            return loaded_data['secret']
    return None

def createNewCredential(auth_client, client_id, cred_name, cred_file):

    get_client_cred_result = auth_client.get_client_credentials(client_id)
    for cred in get_client_cred_result['credentials']:
        # Should have stored secret locally
        auth_client.delete_client_credential(client_id, cred['id'])

    cred_result = auth_client.create_client_credential(client_id, cred_name)
    # Have to change this to a dict 
    obj = {
            'client': cred_result['credential']['client'],
            'id': cred_result['credential']['id'],
            'name': cred_result['credential']['name'],
            'secret': cred_result['credential']['secret']
            }
    with open(cred_file, 'w') as f:
        json.dump(obj, f)

    return cred_result['credential']['secret']

def getClientSecret(auth_client, client_id, cred_name, cred_file):
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
                auth_client,
                client_id,
                cred_name,
                cred_file
                )

    return client_secret


def createClient(auth_client, client_name, project_id, cred_name, cred_file):
    client_id = createNewClient(auth_client, client_name, project_id)

    cred_id = getCredentialID(auth_client, client_id, cred_name)

    cred_exists_on_cloud = False
    if cred_id:
        cred_exists_on_cloud = True

    cred_exists_locally, cred_empty = validFile(cred_file)

    client_secret = getClientSecret(auth_client, client_id, cred_name, cred_file)
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
        with open(deployment_key_file, 'r') as f:
            loaded_data = json.load(f)
            return loaded_data['client_id']
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

    clients_in_project = getClientsInProject(auth_client, project_id):
    # Check if the deployment key is valid for the project
    for client in clients_in_project:
        if client['client_type'] == "globus_connect_server" and client['name'] == endpoint_name:
            if gcs_id:
                # If gcs_id exists see if it is found remotely
                if client['id'] == gcs_id:
                    print("Deployment key endpoint is still valid found in cloud")
                    return True
            else:
                # Found a globus_connect_server but did not find local deployment
                # key
                if deployment_key_empty:
                    print("Found globus_connect_server already registered but did"
                          " not find deployment key locally.")
    return False


def createGCSEndpoint(
        auth_client,
        client_id,
        client_secret,
        project_id,
        deployment_key_file,
        endpoint_name,
        userinfo):

    identity_id = userinfo["sub"]
    email = userinfo["email"]
    username = userinfo["preferred_username"]
    organization = userinfo["identity_provider_display_name"]

    gcs_id_from_deployment_key = getGCSClientIDFromDeploymentFile(deployment_key_file)

    valid_key = isGCSDeploymentKeyValid(auth_client, project_id, endpoint_name, gcs_id_from_deployment_key):

    if valid_key is False and gcs_id_from_deployment_key:
        print("Looks like deployment key exists but does not contain credentials "
                f"in the cloud for the project: {project_id}, please either "
                "add the correct deployment key or remove the gcs instance"
                "registered in the project")
        sys.exit(1)

# Create gcs_instance
    if valid_key is False:

        if command_exists("globus-connect-server") is False:
            print("Cannot create deployment key, we require globus-connect-server to be installed")
            sys.exit(1)

        else:
            bash_command=f"GCS_CLI_CLIENT_ID=\"{client_id}\" "
            bash_command+=f" GCS_CLI_CLIENT_SECRET=\"{client_secret}\" "
            bash_command+=f" globus-connect-server endpoint setup \"{endpoint_name}\" "
            bash_command+=f" --organization \"{organization}\"  "
            bash_command+=f" --project-id \"{project_id}\"  "
            bash_command+=" --agree-to-letsencrypt-tos "
            bash_command+=f" --project-admin \"{username}\" "
            bash_command+=f" --owner \"{username}\" "
            bash_command+=f" --contact-email \"{email}\" "
            bash_command+=f" --deployment-key \"{deployment_key_file}\" "
            print("Bash command to run")
            print(bash_command)
            
            process = subprocess.Popen(bash_command, shell=True,stdout=subprocess.PIPE, stderr=subprocess.STDOUT, universal_newlines=True)
            # Print the output
            for line in process.stdout:
                print(line, end='')

            deployment_key_exists, deployment_key_empty = valid_file(deployment_key_file)
            if deployment_key_exists is False:
                print(f"Something is wrong deployment key does not exist {deployment_key_file} ")
                sys.exit(1)
            if deployment_key_empty:
                print(f"Something is wrong deployment key is empty {deployment_key_file} ")
                sys.exit(1)

# Need to determine the project uuid
project_id = createProject(ac_rt, PROJECT_NAME, userinfo)

count = countProjects(ac_rt, PROJECT_NAME)

if count != 1:
    print("Something is wrong there should be at least one project with name"
          f" {PROJECT_NAME} instead there are {count} with that name")
    sys.exit(1)

client_id, client_secret = createClient(
        ac_rt,
        CLIENT_NAME,
        project_id,
        CRED_NAME,
        CRED_FILE_NAME)

# Add the globus client as an admin to the project
ac_rt.update_project(project_id,admin_ids=[identity_id, client_id])

# Get clients in project
clients_in_project = getClientsInProject(ac_rt, project_id)

# Check if the deployment key exists if it does read it and verify that the
# client exists for the globus connect server if it does not then we will
# call the setup command
createGCSEndpoint(
        ac_rt,
        client_id,
        client_secret,
        project_id,
        DEPLOYMENT_KEY_PATH,
        ENDPOINT_NAME,
        userinfo)


# Compose Dev environment

The Compose Dev environment is split into three different Compose files. The
"core metadata services" which comprise the web server, core server and database
and the "repo services" which comprise Globus Connect Server running with the
authz library and the DataFed repo service. Finally, there is all services which
will let you run DataFed with a repository on the same machine.

1. Only Metadata Compose Services
2. Only DataFed Repository Services
3. Both Metadata and Repository services

NOTE Standing up the repo services has been separated because in many cases
you might have your repository on a different machine, or may have multiple
repositories connected to a single metadata server. 
NOTE You will need a machine with firewall exceptions to run the compose files.

## 1. Metadata Compose Services

The following steps are used to stand up the metadata Compose file from scratch.
Some of steps you only have to do once.

1. Generating the env variables.
2. Opening the .env file and entering your configuration
3. Building the images
4. Running the Compose file
5. Bringing down the Compose file. 


If running the metadata services alone without the repository you will only 
need a firewall exception for port 443.

### 1. Generating .env configuration varaibles for Metadata Core Services

Create the .env file fill in the missing components that are required.

```bash
./generate_env.sh
```
### 2. Fill in the needed .env variables for the Metadata Core Services

The .env file will be created in the DataFed/compose/metadata folder and will be hidden.
The .env file variables can be changed at this point to your configuration.

NOTE the .env file will be read verbatim by Compose including any spaces or
"#" comments so do not includ anything but the exact text that needs to be
included in the variables.

For the redirect url. if you are running the metadata core services on your laptop you
can use:

https://localhost/ui/authn

When registering a Globus Application for DataFed the domain used in
the redirect must be consistent with the .env file for the "DATAFED_DOMAIN"
variable.

E.g. 

redirect: https://localhost/ui/authn
DATAFED_DOMAIN: localhost

If a public IP is assigned

redirect: https://192.83.46.54/ui/authn
DATAFED_DOMAIN: 192.83.46.54

If a domain is assigned such as "awesome_datafed.com"

redirect: https://awesome_datafed.com/ui/authn
DATAFED_DOMAIN: awesome_datafed.com

### 3. Building Metadata Core Services 

The following command will build all the images to run the core metadata 
services.

```bash
cd DataFed/compose/metadata
./build_metadata_images_for_compose.sh
```

### 4. Running the core Compose file

Stand up the core services.

```bash
cd DataFed/compose/metadata
source ./unset_env.sh
docker compose -f ./compose.yml up
```

NOTE The unset_env.sh script is to make sure you are not accidentially
overwriting what is in the .env with your local shell env. You can check the
configuration before hand by running.

```bash
cd DataFed/compose/metadata
docker compose -f compose.yml config
```

WARNING - Docker Compose will prioritize env variables in the following priority
1. From you shell env
2. From the .env file
3. Internally from within the image
Be sure that you are not accidentally overwriting .env variables.

At this point you should be able to navigate in your browser to
<https://localhost>

NOTE we are using a self signed certificate so you will have to force your
browser to allow you to see the page.

### 5. Bringing down the core Compose file

To completely remove the Compose instance and all state the following should
be run.

```bash
cd DataFed/compose/metadata
docker compose -f ./compose.yml down --volumes
```

NOTE the volumes will remove all cached state. If the '--volumes' flag is
not added then on a subsequent "Compose up" the database will not be a clean
install but contain state from previous runs.

## 2. Repo Compose Services

The following steps are used to stand up the repo Compose file. NOTE, that
because of how Globus is configured, there is an additional configuration 
and teardown step.

You need to have installed, globus_sdk for python, as well as the
globus-connect-server54 package. See instructions for installing that here.
https://docs.globus.org/globus-connect-server/v5/

1. Generating the env variables.
2. Opening the .env file and entering your configuration
3. Running the generate_globus_files.sh script
4. Building the images
5. Running the Compose file
6. Bringing down the Compose file.
7. Running the cleanup_globus_files.sh if you want to remove the deployment key
   and start completely from scratch.

### 1. Generating .env configuration varaibles for the Repo Services

Create the .env file fill in the missing components that are required.

```bash
cd DataFed/compose/repo
./generate_env.sh
```

### 2. Enter the .env varaibles for the Repo Services

The .env file will be created in the DataFed/Compose folder and will be hidden.
The .env file variables can be changed at this point to your configuration.

NOTE the .env file will be read verbatim by Compose including any spaces or
"#" comments so do not include anything but the exact text that needs to be
included in the variables.

### 3. Globus configuration

This step is only required once, after which the necessary files should exist in
DataFed/Compose/repo/globus. These files will contain the Globus
configuration needed for additional cycles of "docker compose up" and "docker
compose down".  The following three things need to be done before the
generate_globus_files.sh should be run.

1. You will need to have globus-connect-server54 installed to do this step.
2. You will also need the Globus python developer kit globus_sdk.
3. In addition, your user account will need admin rights on the Globus subscription group.

#### Step 1 
On Ubuntu this can be done with.

```bash
sudo apt-get install globus-connect-server54
```

#### Step 2 

```bash
pip install globus_sdk
```

Finally, we can generate the globus files by running the script.

```bash
cd DataFed/compose/repo
./generate_globus_files.sh
```

You will be required to paste a url into a browser and provide a code back in
the terminal.

### 4. Building Repo Services 

The following command will build all the images to run the core metadata 
services.

```bash
cd DataFed/compose/repo
./build_repo_images_for_compose.sh
```

### 5. Running the Repo Compose file

WARNING: Before running compose file make sure that port 80 is open you can do
this using the command

```bash
sudo netstat -tlupn | grep ':80'
```

It is very likely that when we installed globus-connect-server54 with apt it 
started apache2 and started it running. You should disable it on the host
before launching the compose instance.

Stand up the repo services.

```bash
cd DataFed/compose/repo
source ./unset_env.sh
docker compose -f ./compose.yml up
```

Be aware, the 'source' is to apply changes to the environment of your current
terminal session.

NOTE The unset_env.sh script is to make sure you are not accidentially
overwriting what is in the .env with your local shell env. You can check the
configuration before hand by running. 

```bash
cd DataFed/compose/repo
docker compose -f compose.yml config
```

WARNING - Docker Compose will prioritize env variables in the following priority
1. From you shell env
2. From the .env file
3. Internally from winthin the image
Be sure that you are not accidentally overwriting .env variables.

NOTE If you get an error from the repo server along the lines of

```
ERROR /datafed/source/repository/server/main.cpp:main:154 { "thread_name":
"repo_server", "message": "Exception: Could not open file:
/opt/datafed/keys/datafed-core-key.pub" }
```

it is possible that the DATAFED_DOMAIN name field is incorrect your .env file.

### 6. Bringing down the Compose file 

## Cleaning up

```bash
cd DataFed/compose/repo
docker compose -f ./compose.yml down
```

## 3. Running All Services

For running all services, you will follow the same steps as for the getting the
repository service up and running. The main difference from that set of steps, 
is that there is additional configuration in the .env file that will need to
be added.

## Running isolated containers

If you just want to run a single container at a time with the same configuration
this can also be doen using commands like the following.

### DataFed Web 

```bash
cd DataFed/compose/repo
source ./unset_env.sh
docker run --env-file .env \
  -e UID=$(id -u) \
  -p 443:443 \
  -p 7513:7513 \
  -t datafed-web:latest
```

### DataFed GCS

```bash
cd DataFed/compose/repo
docker run --env-file .env \
  --network=host \
  -v /home/cloud/compose_collection:/mnt/datafed \
  -v ./globus:/opt/datafed/globus \
  -v ./logs:/datafed/logs \
  -v ./keys:/opt/datafed/keys \
  -t datafed-gcs:latest
```

To interact more directly with the container the '-i' flag can be added and the
entrypoint file can be overwritten by including '--entrypoint /bin/bash'

## Common Errors

### Errors during Compose up

Make sure all the ports that are needed are open on the local host. These
include, ports

443 for the datafed-web and datafed-gcs container
7512 for the datafed-core container
50000-51000 for the datafed-gcs container
9000 for the datafed-repo container
80 for the datafed-gcs container
8512 for arangodb web server interface

Make sure port 80 is not already bound on the host. Also note that the repo
server keys should exist in the keys folder before running the gcs instance.

##### Repo server unable to connect to core server

```
datafed-repo-1  | 2024-05-15T11:41:23.406937Z ERROR /datafed/source/repository/server/RepoServer.cpp:checkServerVersion:178 {  "thread_name": "repo_server", "correlation_id":  "3fceb838-70f9-454d-94c4-4e2660dcc029", "message": "Timeout waiting for response from core server: tcp://localhost:7512" }
  datafed-repo-1  | 2024-05-15T11:41:23.406992Z INFO /datafed/source/repository/server/RepoServer.cpp:checkServerVersion:161 { "thread_name": "repo_server", "message": "Attempt 4 to initialize communication  with core server at tcp://localhost:7512" }
```

Make sure that the domain is correct, it may be the case that if you are using
localhost it is unable to resolve core service, traffic gets routed by apache
to the registered domain name.

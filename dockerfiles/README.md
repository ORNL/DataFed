# Dockerfiles for DataFed 

These are Dockerfiles for building different types of containers for the DataFed project
These docker commands will be run from the top-level directory and structured as:

### Build image
```
docker build -f <Dockerfile> -t <Tag> .
```

### Run container from image
```
docker run <Tag>
```

### Run container as an interactive session 
```
docker run -it <Tag>
```
# Different Containers

## Kickstart Containers
These are to setup the system that is ready to compile DataFed.
So, a way to build the SDE for different OS.

| OS       | Dockerfile                               | Tag                               |
|----------|------------------------------------------|-----------------------------------|
| Centos 7 | dockerfiles/Dockerfile.kickstart-centos7 | datafed/kickstart:centos7         |

## Application Containers
These are to build DataFed using one of the respective kickstarts with paired OS.

| OS       | Dockerfile                               | Tag                               |
|----------|------------------------------------------|-----------------------------------|
| Centos 7 | dockerfiles/Dockerfile.datafed-centos7   | datafed/datafed:centos7           |


## Example for entire build for Centos7

To build the kickstart, run:
```
docker build -f dockerfiles/Dockerfile.kickstart-centos7 -t datafed/kickstart:centos7 .
```

To then build the application, run:
```
docker build -f dockerfiles/Dockerfile.datafed-centos7 -t datafed/datafed:centos7 .
```

And then to spin up the container w/ the compiled application, run:
```
docker run -it -p 9000:9000 -v $(pwd)/creds:/etc/datafed datafed/datafed:centos7
```

## Data repository setup

Pre-requisite stes for the data repository are:

1.) Select a port that the core DataFed will communicate to the data repository
server over. The default is port `9000` and used in the below instructions.
Also, since this is an ingress communcation channel, if running in a cloud
environment, add this security rule for ingress to the port in the security
group.

2.) Install a Globus Connect Server endpoint.


To setup a data repository, the steps are:
1.) Start up a container:
```
docker run -it -p 9000:9000 -v $(pwd)/creds:/etc/datafed -v $(pwd)/collection:/collection datafed/datafed:centos7
```

2.) Navigate to the "build" directory and then the repository server directory
```
cd ./build
cd ./repository/server/
```

4.) Generate repository keys:
```
./sdms-repo --gen-keys
```

These will default to saving in the credentials directory `/etc/datafed/`,
which is the volume we mounted to the docker container above.
You can change the credentials directory as below but to persist the keys
generated after the container is stopped, ensure this is a volume directory
saved on the host machine:
```
./sdms-repo --gen-keys --cred-dir <credentials directory>
```

5.) Get the DataFed core public key:
```
wget -O /etc/datafed/datafed-core-key.pub https://datafed.ornl.gov/datafed-core-key.pub
``` 

6.) For the Globus endpoint directory that will be used for the data repository,
create the sub-directories with the same permissions as the endpoint directory:
 - `./user`
 - `./project`

This will be the `collection` volume directory in step (1)

7.) To register the data repository, pass the following information to DataFed developers:
 - Hostname of the data repository server
 - Port from pre-requisite step (1), default is 9000
 - Public key generated from step (4), NOT the private key
 - Globus endpoint UUID for the GCS in pre-requisite step (2)
 - Directory that was used for the GCS (in GCSv5, this will be the ["collection"](https://docs.globus.org/globus-connect-server/v5/data-access-guide/#collections))


8.) Setup the GridFTP authz callouts
  - DataFed contains a custom GridFTP authorization module as a shared library that needs to be "hooked into" GridFTP server.
  - There is a description of this in the [DataFed repository source docs](https://github.com/ORNL/DataFed/tree/master/repository/gridftp/authz)
  - Mainly, after building this shared library, create / copy the [gsi-authz.conf](https://github.com/ORNL/DataFed/tree/master/repository/gridftp/authz) file to `/etc/grid-security/gsi-authz.conf`. GridFTP will "auto-magically" pick this up.
  - Restart the GridFTP server for changes to take place (i.e. `sudo systemctl restart globus-gridftp-server`)
  - Check the module is called in the logs (i.e. `sudo journalctl -u globus-gridftp-server -f`). The output should be something like the following after either a Globus transfer or navigating the Globus File Manager for the endpoint:
```
May 06 10:52:40 ... systemd[1]: Stopping Globus Connect GridFTP Service...
May 06 10:52:40 ... systemd[1]: Stopped Globus Connect GridFTP Service.
May 06 10:52:40 ... systemd[1]: Starting Globus Connect GridFTP Service...
May 06 10:52:40 ... gsi_authz[23161]: DataFed Authz module started, version 1.2.0:4
May 06 10:52:40 ... systemd[1]: Started Globus Connect GridFTP Service.
May 06 10:52:40 ... gsi_authz[23162]: DataFed Authz module started, version 1.2.0:4
May 06 10:52:48 ... gsi_authz[23171]: DataFed Authz module started, version 1.2.0:4
May 06 10:52:49 ... gsi_authz[23171]: gsi_authz_handle_init
May 06 10:52:49 ... gsi_authz[23171]: gsi_authz_handle_destroy
May 06 10:52:50 ... gsi_authz[23178]: DataFed Authz module started, version 1.2.0:4
May 06 10:52:50 ... gsi_authz[23178]: gsi_authz_handle_init
May 06 10:52:50 ... gsi_authz[23178]: gsi_authz_authorize_async
May 06 10:52:51 ... gsi_authz[23178]: gsi_authz_handle_destroy
May 06 10:52:51 ... gsi_authz[23184]: DataFed Authz module started, version 1.2.0:4
May 06 10:52:51 ... gsi_authz[23184]: gsi_authz_handle_init
May 06 10:52:52 ... gsi_authz[23184]: gsi_authz_authorize_async
May 06 10:52:52 ... gsi_authz[23184]: gsi_authz_authorize_async
```

9.) Start the data repository server:
```
./sdms-repo --server tcp://<address of core datafed server:port>
```

Example for DEV server:
```
./sdms-repo --server tcp://sdms.ornl.gov:7512
```

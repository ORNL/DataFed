# Dockerfiles for DataFed 

These are Dockerfiles for building different types of containers for the DataFed project
These docker commands will be run from the top-level directory and structured as:

The Foxx image copies `arangosh` and its JavaScript/ICU runtime data from the
versioned vendor image, avoiding the obsolete public ArangoDB Debian repository.
For local Foxx builds, pass the same version used by the dependency image:

```bash
source external/DataFedDependencies/scripts/dependency_versions.sh
docker build -f docker/Dockerfile.foxx \
  --build-arg DEPENDENCIES=<dependencies-image> \
  --build-arg DATAFED_ARANGODB_VERSION="$DATAFED_ARANGODB_VERSION" \
  -t datafed-foxx:local .
```

CI passes this version automatically. `ARANGODB_CLIENT_IMAGE` can optionally
select a mirrored image or digest; the build checks its client release tag
against the dependency version and runs JavaScript locally without a database.

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

Run following to:
  - Build Kickstart image from Centos7 image
  - Build DataFed image from Kickstart image
  - Drop into interactive session with built DataFed container

```
docker build -f dockerfiles/Dockerfile.kickstart-centos7 -t datafed/kickstart:centos7 . \
&& docker build -f dockerfiles/Dockerfile.datafed-centos7 -t datafed/datafed:centos7 . \
&& docker run -it datafed/datafed:centos7
```

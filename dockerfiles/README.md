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

Run following to:
  - Build Kickstart image from Centos7 image
  - Build DataFed image from Kickstart image
  - Drop into interactive session with built DataFed container

```
docker build -f dockerfiles/Dockerfile.kickstart-centos7 -t datafed/kickstart:centos7 . \
&& docker build -f dockerfiles/Dockerfile.datafed-centos7 -t datafed/datafed:centos7 . \
&& docker run -it datafed/datafed:centos7
```

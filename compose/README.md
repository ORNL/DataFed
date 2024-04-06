# Compose Dev environment

## Generating configuration varaibles

Create the .env file fill in the missing components that are required.

```bash
./generate_env.sh
```

Both the repo compose file and the core compose file will use the .env file
that is generated from this step.

## Building Core Services 

The files in this folder are incomplete but are the start for setting up a full
docker compose instance of datafed.

```bash
./build_images_for_compose.sh
```

Stand up the core services.

```bash
docker compose -f ./compose_core.yml up
```

At this point you should be able to navigate in your browser to
<https://localhost>

NOTE we are using a self signed certificate so you will have to force your
browser to allow you to see the page.

Standing up the repo services has been separated because of Globus. You will
need a machine with firewall exceptions to use it.

## Building Repo & Authz-Globus Services 

```bash
./build_repo_images_for_compose.sh
```

Standing up the repo services. NOTE gcs-authz container will use host network
due to the large numbers of ports that are needed by Globus.

```bash
docker compose -f ./compose_repo.yml up
```

## Running individual containers

If you just want to run a single container at a time with the same configuration
this can also be doen using commands like the following.

```bash
docker run -e UID=$(id -u) --env-file .env -it datafed-web:latest /bin/bash
```

## Cleaning up

```bash
docker compose -f ./compose_core.yml down
```

## Running gcs Docker container

Make sure port 80 is not already bound. Also note that the repo server keys
should exist in the keys folder before running the gcs instance.

```bash
docker run --env-file .env \
  --network=host \
  --entrypoint /bin/bash \ 
  -v /home/cloud/compose_collection:/mnt/datafed \
  -v ./globus:/opt/datafed/globus \
  -v ./logs:/datafed/logs \
  -v ./keys:/opt/datafed/keys \
  -it datafed-gcs:latest
```

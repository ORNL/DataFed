# Compose Dev environment

The files in this folder are incomplete but are the start for setting up a full
docker compose instance of datafed.

```bash
./build_images_for_compose.sh
```

Create the .env file fill in the missing components that are required.

```bash
./generate_env.sh
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

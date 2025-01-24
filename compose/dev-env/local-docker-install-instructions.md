# Description
The intent of this document is to explain how to install Docker and use the [DataFed Dev Env](https://github.com/ORNL/DataFed/tree/t-ramz-dev-container/compose/dev-env) to it's full extent.

# Installing Docker
This section assumes a few things:

1. WSL is the host environment
2. The WSL Distro chosen is Ubuntu
3. The WSL user has appropriately set up networking on their device so DNS is working
4. The WSL host executable is recent, not ancient. Made this century. Please.
5. The WSL Distro is running on WSL version 2, it is assumed you are using `systemd`

    NOTE: you can check for systemd by simply running the command: `systemctl`

## Add keyrings
Run the following to get the keyrings added, an error will stop the process and prevent the "SUCCESS" message

`sudo apt-get update && sudo apt-get install ca-certificates curl && sudo install -m 0755 -d /etc/apt/keyring && sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc && sudo chmod a+r /etc/apt/keyrings/docker.asc && echo SUCCESS`

## Add repository to apt sources
Run the following, this can be verified by looking at `/etc/apt/sources.list.d/docker.list`

```
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
```

Update package lists

`sudo apt-get update`

## Install Docker
Run the following command, a successful install will result in a "SUCCESS" message:

`sudo apt-get install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin && echo SUCCESS`

Verify installation with `docker --version`

Make sure the daemon is running by using `sudo systemctl restart docker`

## Add user to docker group
The user may need to be created:

`sudo groupadd docker`

To add your current user, use the following command:

`sudo usermod -aG docker $USER`

# Set up dev environment

## Clone the branch
If you do not already have DataFed source code pulled onto your system, clone the specific branch with:

`git clone -b t-ramz-dev-container https://github.com/ORNL/DataFed.git`

If you do, run the following to update your local repo and checkout the branch:

`git fetch --all && git checkout t-ramz-dev-container && git pull && echo SUCCESS`

## Use the image/container
Navigate to the appropriate directory from the repository root: `cd compose/dev-env`

Give yourself execute permissions on the scripts: `sudo chmod u+x *.sh`

Build the appropraite Docker Images: `./build_images_for_dev.sh`

Note: builds are non-deterministic so there may be some debugging necessary

Note: if you're having issues with name resolution when building, you can edit `build_images_for_dev.sh`
The result should be the following:


```
#!/bin/bash

SCRIPT=$(realpath "$0")
SOURCE=$(dirname "$SCRIPT")
PROJECT_ROOT=$(realpath "${SOURCE}/../../")

docker build \
  -f "${PROJECT_ROOT}/docker/Dockerfile.dependencies" \
  --network=host \
  "${PROJECT_ROOT}" \
  -t datafed-dependencies:latest

docker build \
 -f Dockerfile \
 --network=host \
 --build-arg DEPENDENCIES="datafed-dependencies:latest" \
 "${PROJECT_ROOT}" \
 -t dev-container:latest
```

Run the container: `./launch_container_for_dev.sh`

### Post-install
To launch, you need to run `nvim .` in the shell that you're dropped into.

From here you can wait until everything is loaded, it will take some time depending on your machine.

Next, in order to make sure everything is up to date, we will follow this sequence of keystrokes, CASE MATTERS: `<spacebar> -> p -> M`

Additionally, when editing a new file type, the plugins may lazy load and you will have to repeat the above sequence.

Finally, it may be a requirement to exit nvim to allow configurations to reload. In those cases, quit via command mode and then launch again with `nvim .`


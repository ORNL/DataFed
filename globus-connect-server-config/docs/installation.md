# Installation Guide

## Quick Install

### Prerequisites
- Docker (>= 20.10) and Docker Compose
- Python 3 with pip
- Git
- Public IP address and DNS hostname

**Note**: You do NOT need to install Globus Connect Server - it's included in the Docker container.

### Installation Steps

```bash
# 1. Clone the repository
cd globus-connect-server-config

# 2. Run the setup script
./bin/setup.sh

# 3. Follow the prompts
```

---

## Advanced Options

<details>
<summary>Building Images</summary>

```bash
./bin/build.sh
```

The build script automatically detects your environment:
- **Within DataFed**: Uses existing submodule (run `git submodule update --init --recursive` first)
- **Standalone**: Downloads components automatically

</details>

<details>
<summary>Manual Installation</summary>

If the setup script doesn't work for your system:

### 1. Install Dependencies

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install docker.io docker-compose python3 python3-pip git
sudo usermod -aG docker $USER
newgrp docker
```

**RHEL/CentOS:**
```bash
sudo yum install docker docker-compose python3 python3-pip git
sudo usermod -aG docker $USER
newgrp docker
```

### 2. Install Python Package
```bash
pip3 install --user globus-sdk
```

### 3. Create Directories
```bash
mkdir -p globus keys logs
chmod 700 globus keys
```

### 4. Configure Environment
```bash
cp .env.template .env
vim .env
```

</details>

## Next Steps

Continue with the [Getting Started Guide](getting-started.md) to configure and run your Globus Connect Server.
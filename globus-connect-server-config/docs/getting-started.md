# Getting Started Guide

This guide walks you through setting up Globus Connect Server for the first time.

## Prerequisites

- Docker and Docker Compose v2
- Git (for DataFed integration)
- Python 3.6+
- sudo access (for host networking)

## Step 1: Initial Setup

Run the setup script to verify your environment:

```bash
cd globus-connect-server-config
./bin/setup.sh
```

## Step 2: Configure Environment

Edit the `.env` file created by the setup script:

```bash
vim .env
```

Key settings to review:
- `GCS_HOSTNAME` - Your public DNS name
- `GCS_IP_ADDRESS` - Your external IP
- `HOST_COLLECTION_PATH` - Where to store data

## Step 3: Initialize Globus Credentials

Generate OAuth2 credentials and create your GCS endpoint:

```bash
./bin/init-credentials.sh
```

This interactive script will:
1. Open a browser for Globus authentication
2. Create a project and OAuth2 client
3. Configure your GCS endpoint
4. Update your `.env` file automatically

**Note**: The script handles all credential management and special character escaping automatically.

## Step 4: Build Docker Images

Build the custom GCS image:

```bash
./bin/build.sh
```

The build script automatically detects your environment:
- **Within DataFed repository**: Uses the existing submodule (ensure submodules are initialized)
- **Standalone deployment**: Downloads the necessary components automatically

The build process takes 5-10 minutes and will:
1. Download/build the official GCS base image
2. Add our custom configuration layer with your credentials
3. Tag the final image as `globus-connect-server:latest`

## Step 5: Start Services

Launch the Globus Connect Server:

```bash
docker compose up -d
```
Monitor progress:

```bash
docker compose logs -f
```

Look for these success indicators:
- `=== Globus Connect Server is ready ===`
- `Endpoint URL: https://YOUR_HOSTNAME`
- Apache and GridFTP processes running

## Step 6: Set Up Storage Gateway and Collection

The container will prompt you to run this after startup:

```bash
docker compose exec globus-connect-server /opt/scripts/setup-globus.sh
```

This automated script will:
- Create a POSIX storage gateway at your configured path
- Set up identity mapping (all Globus users → local `globus` user)
- Create a mapped collection with your configured name
- Configure default access permissions

Expected output:
```
Creating POSIX Storage Gateway...
Gateway created: STORAGE_GATEWAY_ID
Creating Mapped Collection...
Collection created: COLLECTION_ID
```

## Step 7: Verify Your Endpoint

### Check Services

```bash
# Quick health check
docker compose exec globus-connect-server \
    globus-connect-server self-diagnostic
```

### Access Your Endpoint

1. Visit: `https://YOUR_HOSTNAME`
2. Sign in with your Globus account
3. You should see your mapped collection listed

## What's Next?

- **Share data**: Create guest collections - [Management Guide](management.md#creating-guest-collections)
- **Add users**: Configure access - [Configuration Reference](configuration.md#user-access)
- **Production deployment**: Kubernetes/Docker - [Deployment Guides](deployment/)
- **Having issues?**: [Troubleshooting Guide](troubleshooting.md)

## Getting Help

If you encounter issues:

1. Run diagnostics: `./bin/check-deps.sh`
2. Check logs: `docker compose logs -f`
3. Review [Troubleshooting Guide](troubleshooting.md)
4. Consult [Globus Documentation](https://docs.globus.org/globus-connect-server/)
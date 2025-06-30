# Cleanup and Recovery Guide

## Quick Cleanup

### Using the Cleanup Script

```bash
# Complete removal (recommended)
./bin/cleanup.sh --all

# Remove only cloud resources
./bin/cleanup.sh --cloud

# Remove only local files
./bin/cleanup.sh --local
```

The script automatically creates backups before removing local files.

## What Gets Removed

### Cloud Resources (`--cloud`)
- Globus endpoint and deployment key
- OAuth2 clients and credentials
- Globus project (if empty)

### Local Resources (`--local`)
- Docker containers and images
- `./globus/` credentials
- `./keys/` certificates
- `./logs/` files
- `.env` configuration

## Recovery Options

### Restore from Backup

Backups are created in `./backups/` with timestamps:

```bash
# Restore credentials
cp -r backups/globus-20240130-143022 ./globus

# Restore configuration
cp backups/env-20240130-143022 ./.env

# Restart services
docker compose up -d
```

### Complete Reset

```bash
# 1. Clean everything
./bin/cleanup.sh --all

# 2. Start fresh
./bin/setup.sh
./bin/init-credentials.sh
./bin/build.sh
docker compose up -d
```

## Manual Cleanup

If the script fails:

### Cloud Resources
1. Visit [developers.globus.org](https://developers.globus.org)
2. Delete clients and projects manually

### Local Resources
```bash
docker compose down
docker rmi globus-connect-server:latest
rm -rf ./globus ./keys ./logs .env
```

## See Also
- [Troubleshooting Guide](troubleshooting.md)
- [Installation Guide](installation.md)
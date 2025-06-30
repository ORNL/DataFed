# Management Guide

## Quick Reference Card

```bash
# Most common operations
docker compose exec globus-connect-server bash  # Enter container

# Inside container:
python3 /opt/scripts/create-guest-collection.py "Name"  # Create guest collection
python3 /opt/scripts/manage-collections.py list          # List collections
globus-connect-server self-diagnostic                    # Health check
```

## Command Reference

This guide uses various Globus Connect Server CLI commands. Here are links to the official documentation:

### Storage Gateway Commands
- [`storage-gateway list`](https://docs.globus.org/globus-connect-server/v5/reference/storage-gateway/list/) - List all storage gateways
- [`storage-gateway create`](https://docs.globus.org/globus-connect-server/v5/reference/storage-gateway/create/) - Create a new storage gateway
- [`storage-gateway update`](https://docs.globus.org/globus-connect-server/v5/reference/storage-gateway/update/) - Modify gateway settings

### Collection Commands
- [`collection list`](https://docs.globus.org/globus-connect-server/v5/reference/collection/list/) - List all collections
- [`collection create`](https://docs.globus.org/globus-connect-server/v5/reference/collection/create/) - Create a mapped collection
- [`collection update`](https://docs.globus.org/globus-connect-server/v5/reference/collection/update/) - Modify collection settings

### Endpoint Commands
- [`endpoint show`](https://docs.globus.org/globus-connect-server/v5/reference/endpoint/show/) - Display endpoint configuration
- [`endpoint set-subscription-id`](https://docs.globus.org/globus-connect-server/v5/reference/endpoint/set-subscription-id/) - Associate subscription

### Diagnostic Commands
- [`self-diagnostic`](https://docs.globus.org/globus-connect-server/v5/reference/self-diagnostic/) - Run system health checks
- [`node setup`](https://docs.globus.org/globus-connect-server/v5/reference/node/setup/) - Configure GCS node

For complete CLI reference, see the [GCS v5 Command Reference](https://docs.globus.org/globus-connect-server/v5/reference/).

## Collection Management

### Collection Types

See [Collections documentation](https://docs.globus.org/globus-connect-server/v5/collections/).

### Creating Guest Collections

#### Basic Usage
```bash
# Create a public guest collection
docker compose exec globus-connect-server \
    python3 /opt/scripts/create-guest-collection.py "Collection Name"
```

#### Common Examples
```bash
# Project-specific collection (restricted to subdirectory)
docker compose exec globus-connect-server \
    python3 /opt/scripts/create-guest-collection.py "Project Alpha" \
    --base-path "/projects/alpha"

# Private read-only collection
docker compose exec globus-connect-server \
    python3 /opt/scripts/create-guest-collection.py "Archive Data" \
    --private \
    --read-only
```

**Script options:**
| Option | Description | Default |
|--------|-------------|---------|
| `--mapped-collection` | Parent collection name/ID | From .env |
| `--base-path` | Restrict to subdirectory | Root path |
| `--private` | Hide from public search | Public |
| `--no-all-users` | No default access | All users can access |
| `--read-only` | Read-only permissions | Read/write |

### Managing Collections

```bash
# List all collections
docker compose exec globus-connect-server \
    python3 /opt/scripts/manage-collections.py list

# Filter by type
... manage-collections.py list --type guest -v

# Get details
... manage-collections.py info "Collection Name"

# Delete collection
... manage-collections.py delete "Old Collection" --yes
```

## User Access Management

### Setting Permissions

See [Collection Permissions documentation](https://docs.globus.org/globus-connect-server/v5/collections/#managing_permissions).

### Identity Mapping

See [Identity Mapping documentation](https://docs.globus.org/globus-connect-server/v5/identity-mapping-guide/).

Default: All users map to `globus` user.

```bash
# Edit mapfile
docker compose exec globus-connect-server \
    vim /etc/grid-security/grid-mapfile

# Restart GridFTP
docker compose exec globus-connect-server \
    systemctl restart globus-gridftp-server
```

## Storage Gateway Management

See [`storage-gateway`](https://docs.globus.org/globus-connect-server/v5/reference/storage-gateway/) commands.

```bash
# List gateways
docker compose exec globus-connect-server \
    python3 /opt/scripts/manage-collections.py gateways -v

# Modify gateway
docker compose exec globus-connect-server bash
globus-connect-server storage-gateway update GATEWAY_ID \
    --restrict-paths /allowed/path
```

## Monitoring

### Service Status

```bash
# Container status
docker compose ps

# GCS diagnostics (see [`self-diagnostic`](https://docs.globus.org/globus-connect-server/v5/reference/self-diagnostic/))
docker compose exec globus-connect-server \
    globus-connect-server self-diagnostic

# View logs
docker compose logs -f --tail=100

# Service logs
docker compose exec globus-connect-server \
    tail -f /var/log/globus-connect-server/*.log
```

### Resource Usage

```bash
# Container stats
docker stats globus-connect-server

# Disk usage
docker compose exec globus-connect-server \
    df -h /mnt/globus-collections
```

## Backup and Recovery

### What to Backup

- `./globus/client_cred.json` - OAuth credentials
- `./globus/deployment-key.json` - Endpoint key  
- `./keys/` - SSL certificates
- `.env` - Configuration

### Automated Backup

Create `backup.sh`:
```bash
#!/bin/bash
set -e

BACKUP_DIR="/backup/gcs-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"

echo "Backing up GCS to $BACKUP_DIR..."

# Stop container for consistency
docker compose stop

# Backup critical files
cp -r ./globus ./keys .env "$BACKUP_DIR/"

# Save endpoint config
docker compose exec globus-connect-server \
    globus-connect-server endpoint show > "$BACKUP_DIR/endpoint-info.txt" 2>/dev/null || true

# Restart container
docker compose start

echo "Backup complete: $BACKUP_DIR"
```

### Recovery

```bash
docker compose down
cp -r /backup/globus ./
cp -r /backup/keys ./
cp /backup/.env ./
docker compose up -d
```

## Updates

### Update GCS Version

```bash
# Edit version
vim config/versions.env

# Rebuild and restart
./bin/build.sh
docker compose down
docker compose up -d
```

### Update Scripts

```bash
git pull origin main
docker compose restart
```

## Performance Tuning

### GridFTP Configuration

See [GridFTP Performance Tuning](https://docs.globus.org/globus-connect-server/v5/gridftp-performance-guide/).

### Container Resources

In `docker compose.yml`:
```yaml
deploy:
  resources:
    limits:
      cpus: '4'
      memory: 8G
```

## Security

### Regular Tasks

See [Security Best Practices](https://docs.globus.org/globus-connect-server/v5/security-guide/).

### Firewall Rules

```bash
sudo ufw allow 443/tcp
sudo ufw allow 2811/tcp
sudo ufw allow 50000:51000/tcp
```

## Common Tasks Cheatsheet

### Daily Operations
```bash
# Check status
docker compose ps
docker compose logs --tail=50

# Enter container for management
docker compose exec globus-connect-server bash
```

### Collection Management (inside container)
```bash
# Create guest collection
python3 /opt/scripts/create-guest-collection.py "Name"

# List all collections
python3 /opt/scripts/manage-collections.py list

# Get collection details
python3 /opt/scripts/manage-collections.py info "Name"

# Delete collection
python3 /opt/scripts/manage-collections.py delete "Name" --yes
```

### Diagnostics (inside container)
```bash
globus-connect-server self-diagnostic   # Full health check
globus-connect-server endpoint show     # Endpoint details
globus-connect-server collection list   # All collections
```

💡 **Pro tip**: Add this alias to your shell:
```bash
alias gcs='docker compose exec globus-connect-server'
# Then use: gcs bash, gcs python3 /opt/scripts/manage-collections.py list
```
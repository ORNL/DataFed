# Docker Deployment Guide

## Quick Start

The default `docker-compose.yml` is production-ready. Just run:

```bash
docker compose up -d
```

## Key Concepts

### Network Mode
Uses `host` networking for GridFTP performance. This is required for data transfers.

### Persistent Data
- `./globus/` - Credentials (backup this!)
- `./keys/` - SSL certificates
- `./logs/` - Service logs
- Your data path - Mapped to container

### Resource Requirements
- CPU: 2+ cores
- RAM: 4GB minimum
- Storage: Fast SSD recommended

## Common Operations

### Monitoring
```bash
docker compose ps              # Status
docker compose logs -f         # Live logs
docker stats                   # Resource usage
```

### Updates
```bash
# Rebuild and restart
./bin/build.sh
docker compose up -d
```

### Backup
```bash
# Stop service
docker compose stop

# Backup credentials
tar -czf gcs-backup-$(date +%Y%m%d).tar.gz globus/ keys/ .env

# Restart
docker compose start
```

## Advanced Configuration

<details>
<summary>Production Optimizations</summary>

### Resource Limits
Add to `docker-compose.yml`:
```yaml
deploy:
  resources:
    limits:
      memory: 8G
```

### Health Checks
```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "https://localhost/"]
  interval: 30s
```

### Log Rotation
```yaml
logging:
  options:
    max-size: "10m"
    max-file: "3"
```

</details>

<details>
<summary>Security Hardening</summary>

### Read-only Root
```yaml
read_only: true
tmpfs:
  - /tmp
  - /run
```

### Drop Capabilities
```yaml
cap_drop:
  - ALL
cap_add:
  - NET_BIND_SERVICE
```

See [Docker Security Best Practices](https://docs.docker.com/engine/security/) for more.

</details>

## Troubleshooting

**Container exits immediately?**
- Check logs: `docker compose logs`
- Verify credentials exist: `ls -la globus/`

**Permission denied?**
- Check UID matches: `id -u` on host vs `GCS_UID` in `.env`

**Can't connect?**
- Verify ports: `sudo lsof -i :443`
- Check firewall rules

## See Also

- [Docker Compose Reference](https://docs.docker.com/compose/)
- [Container Best Practices](https://docs.docker.com/develop/dev-best-practices/)
- [Troubleshooting Guide](../troubleshooting.md)
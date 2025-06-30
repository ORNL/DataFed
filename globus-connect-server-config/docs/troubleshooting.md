# Troubleshooting Guide

## Quick Diagnostics

```bash
# Check everything
./bin/check-deps.sh

# Container status
docker compose ps
docker compose logs --tail=50

# GCS health check
docker compose exec globus-connect-server \
    globus-connect-server self-diagnostic
```

## Common Issues

### Container Won't Start

<details>
<summary>Expand for solutions</summary>

**Check logs:**
```bash
docker compose logs globus-connect-server
```

**Common causes:**
- Missing credentials → Run `./bin/init-credentials.sh`
- Port conflicts → Check ports 443, 50000-51000
- Wrong permissions → `chown -R $USER:$USER ./globus ./keys`

</details>

### Authentication Failures

<details>
<summary>Expand for solutions</summary>

**Invalid credentials:**
```bash
# Regenerate credentials
rm -f ./globus/client_cred.json
./bin/init-credentials.sh
docker compose restart
```

**Check connectivity:**
```bash
docker compose exec globus-connect-server \
    curl -I https://app.globus.org
```

</details>

### Transfer Issues

<details>
<summary>Expand for solutions</summary>

**GridFTP not running:**
```bash
docker compose exec globus-connect-server \
    ps aux | grep gridftp
```

**Firewall blocking transfers:**
- Ensure ports 50000-51000 are open
- Check `iptables` or cloud security groups

**Permission denied:**
```bash
# Fix collection permissions
docker compose exec globus-connect-server \
    chown -R globus:globus /mnt/globus-collections
```

</details>

### Storage Gateway Missing

<details>
<summary>Expand for solutions</summary>

This is normal on first startup. Run the setup script:
```bash
docker compose exec globus-connect-server \
    /opt/scripts/setup-globus.sh
```

This creates the gateway and mapped collection automatically.

</details>

### Container Shows "globus-connect-server: command not found"

<details>
<summary>Expand for solutions</summary>

This typically means the base image wasn't built correctly:

1. **Rebuild the base image:**
```bash
./bin/build.sh
```

2. **Verify the image has GCS installed:**
```bash
docker run --rm globus-connect-server:latest which globus-connect-server
```

3. **Check the build logs for errors**

</details>

## Advanced Debugging

<details>
<summary>Detailed diagnostics</summary>

### Collect Debug Info

```bash
# Create debug directory
DEBUG_DIR="./debug-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$DEBUG_DIR"

# Gather information
docker compose logs > "$DEBUG_DIR/docker-logs.txt"
docker compose exec globus-connect-server \
    globus-connect-server self-diagnostic > "$DEBUG_DIR/diagnostic.txt"
docker inspect globus-connect-server > "$DEBUG_DIR/container.json"

echo "Debug info saved to $DEBUG_DIR"
```

### Check Services

```bash
# Inside container
docker compose exec globus-connect-server bash

# Check all services
systemctl status globus-*
ps aux | grep -E "apache|gridftp|gcs"
```

### Review Logs

```bash
# GCS logs
docker compose exec globus-connect-server \
    tail -f /var/log/globus-connect-server/*.log

# GridFTP logs
docker compose exec globus-connect-server \
    tail -f /var/log/gridftp.log
```

</details>

## Quick Fixes

| Problem | Solution |
|---------|----------|
| Container exits immediately | Check logs, verify credentials exist |
| Can't access web interface | Verify DNS resolves, check port 443 |
| Transfers fail | Check firewall, verify GridFTP running |
| Permission denied | Fix ownership with chown commands |
| Gateway not found | Run setup-globus.sh script |

## Getting Help

1. **Check logs first:** `docker compose logs -f`
2. **Run diagnostics:** `./bin/check-deps.sh`
3. **Search error message:** Often reveals the solution

### Support Resources

- [Globus Support](https://support.globus.org) - Official GCS support
- [Docker Documentation](https://docs.docker.com) - Container issues
- GitHub Issues - Configuration-specific problems

### When Reporting Issues

Include:
- Error messages and logs
- Output of `docker compose ps`
- Your `.env` configuration (remove secrets)
- Steps to reproduce

## See Also

- [Cleanup Procedures](cleanup.md) - Reset and recovery options
- [Management Guide](management.md) - Day-to-day operations
- [Configuration Reference](configuration.md) - Settings and options
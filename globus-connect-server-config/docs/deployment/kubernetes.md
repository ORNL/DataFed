# Kubernetes Deployment Guide

## Quick Start

### Prerequisites
- Kubernetes 1.19+ cluster with kubectl configured
- Persistent storage provisioner
- Load balancer or Ingress controller

### Deploy GCS

1. **Get the deployment file:**
   ```bash
   wget examples/kubernetes/complete-deployment.yaml
   ```

2. **Edit configuration:**
   ```bash
   # Replace these values in the YAML:
   YOUR_HOSTNAME        # Your public DNS name
   YOUR_PUBLIC_IP       # Your external IP
   YOUR_CLIENT_ID       # From init-credentials.sh
   YOUR_CLIENT_SECRET   # From init-credentials.sh
   YOUR_SUBSCRIPTION_ID # If you have one
   ```

3. **Deploy:**
   ```bash
   kubectl apply -f complete-deployment.yaml
   ```

4. **Initialize credentials:**
   ```bash
   # First, generate credentials locally
   ./bin/init-credentials.sh
   
   # Copy to pod
   kubectl cp ./globus/client_cred.json \
     globus-gcs/globus-connect-server-0:/opt/globus/
   kubectl cp ./globus/deployment-key.json \
     globus-gcs/globus-connect-server-0:/opt/globus/
   ```

5. **Verify:**
   ```bash
   kubectl -n globus-gcs get all
   kubectl -n globus-gcs logs statefulset/globus-connect-server
   ```

## Architecture

### Components
- **StatefulSet**: Ensures persistent identity
- **Service**: LoadBalancer for external access
- **ConfigMap**: Non-sensitive configuration
- **Secret**: Credentials and keys
- **PVCs**: Persistent storage for data and credentials

### Network Requirements
- Port 443: HTTPS interface
- Port 2811: GridFTP control
- Ports 50000-51000: GridFTP data (NodePort or host network)

## Production Considerations

<details>
<summary>High Availability</summary>

GCS doesn't support active-active deployment. Use:
- Single StatefulSet replica
- Fast storage backend
- Regular backups
- Monitoring and alerts

</details>

<details>
<summary>Storage Options</summary>

### NFS for Shared Data
```yaml
volumes:
- name: collection-data
  nfs:
    server: nfs.example.com
    path: /export/globus
```

### Local Storage for Performance
```yaml
nodeSelector:
  globus-node: "true"
volumes:
- name: collection-data
  hostPath:
    path: /data/globus
```

</details>

<details>
<summary>Ingress Configuration</summary>

For NGINX Ingress:
```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: gcs-ingress
  annotations:
    nginx.ingress.kubernetes.io/backend-protocol: "HTTPS"
spec:
  tls:
  - hosts:
    - gcs.example.com
  rules:
  - host: gcs.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: gcs-service
            port:
              number: 443
```

</details>

## Operations

### Backup
```bash
# Backup credentials
kubectl exec -n globus-gcs globus-connect-server-0 -- \
  tar -czf - -C /opt globus | tar -xzf - -C ./backup/

# Backup data (if using PVC)
kubectl create job backup-$(date +%s) \
  --from=cronjob/backup-job -n globus-gcs
```

### Updates
```bash
# Update image
kubectl set image statefulset/globus-connect-server \
  gcs=globus-connect-server:new-version -n globus-gcs

# Monitor rollout
kubectl rollout status statefulset/globus-connect-server -n globus-gcs
```

### Monitoring
```bash
# Resource usage
kubectl top pod -n globus-gcs

# Events
kubectl events -n globus-gcs --for statefulset/globus-connect-server
```

## Troubleshooting

**Pod not starting?**
- Check logs: `kubectl logs -n globus-gcs globus-connect-server-0`
- Verify credentials mounted correctly
- Check PVC is bound

**Can't access endpoint?**
- Check Service has external IP: `kubectl get svc -n globus-gcs`
- Verify DNS points to Service IP
- Check firewall rules

**GridFTP issues?**
- May need host networking for data channels
- Consider NodePort service for ports 50000-51000

## Example Files

Complete examples available in `examples/kubernetes/`:
- `complete-deployment.yaml` - All-in-one deployment
- `rancher-specific.yaml` - Rancher annotations
- `production-config.yaml` - Production optimizations

## See Also

- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [Docker Deployment Guide](docker.md)
- [Troubleshooting Guide](../troubleshooting.md)
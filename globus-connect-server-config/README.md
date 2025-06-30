# Globus Connect Server Configuration for ROVI

This repository contains a standalone configuration for deploying Globus Connect Server (GCS) in a containerized environment, specifically designed for the ROVI project at ORNL using ITSD Rancher.

## Overview

This configuration provides:
- Dockerized Globus Connect Server v5.4
- Automated setup scripts for storage gateways and collections
- Support for guest collections (with subscription)
- Identity mapping to a local user
- SSL/TLS support via Let's Encrypt

## Prerequisites

1. **Globus Account**: You need a Globus account with ability to create projects
2. **Globus Subscription** (optional): Required for guest collections
3. **Public IP Address**: The GCS endpoint needs a publicly accessible IP
4. **DNS Hostname**: A DNS name that resolves to your public IP
5. **Docker & Docker Compose**: For running the containerized setup
6. **Storage**: Persistent storage for collections

## Quick Start

### 1. Clone and Configure

```bash
# Clone this configuration
git clone <repository-url>
cd globus-connect-server-config

# Copy environment template
cp .env.template .env

# Edit .env with your configuration
vim .env
```

### 2. Initialize Globus Credentials

Run the initialization script to create Globus project and credentials:

```bash
docker-compose run --rm globus-connect-server python3 /opt/scripts/init-globus.py
```

This will:
- Prompt you to authenticate with Globus
- Create a project in your Globus account
- Generate client credentials
- Save credentials to `./globus/client_cred.json`

### 3. Start Globus Connect Server

```bash
docker-compose up -d
```

The container will:
- Set up the GCS endpoint
- Configure storage gateways
- Create a mapped collection
- Start all necessary services

### 4. Verify Setup

```bash
# Check logs
docker-compose logs -f

# Verify services are running
docker-compose exec globus-connect-server ps aux | grep -E "apache2|gridftp"
```

## Environment Variables

Key variables in `.env`:

| Variable | Description | Example |
|----------|-------------|---------|
| `GCS_HOSTNAME` | Public DNS hostname | `gcs.example.com` |
| `GCS_IP_ADDRESS` | Public IP address | `1.2.3.4` |
| `GCS_ROOT_NAME` | Display name prefix | `ROVI GCS` |
| `GCS_COLLECTION_ROOT_PATH` | Container path for collections | `/mnt/globus-collections` |
| `HOST_COLLECTION_PATH` | Host path to mount | `/data/globus` |
| `GLOBUS_CLIENT_ID` | OAuth2 client ID | `abc-123...` |
| `GLOBUS_CLIENT_SECRET` | OAuth2 client secret | `xyz-789...` |
| `GLOBUS_SUBSCRIPTION_ID` | Subscription ID (optional) | `sub-123...` |

## Directory Structure

```
globus-connect-server-config/
├── docker-compose.yml      # Container orchestration
├── Dockerfile             # GCS container image
├── .env                   # Environment configuration
├── scripts/               # Setup and management scripts
│   ├── init-globus.py    # Initialize Globus credentials
│   ├── setup-globus.sh   # Configure gateways/collections
│   └── entrypoint.sh     # Container entrypoint
├── globus/               # Globus credentials (git-ignored)
│   ├── client_cred.json  # Client credentials
│   └── deployment-key.json # Endpoint deployment key
├── keys/                 # SSL certificates
└── logs/                 # Service logs
```

## Rancher Deployment

### 1. Create Namespace

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: globus-gcs
```

### 2. Create ConfigMap for Environment

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: gcs-config
  namespace: globus-gcs
data:
  GCS_HOSTNAME: "gcs-rovi.ornl.gov"
  GCS_IP_ADDRESS: "YOUR_PUBLIC_IP"
  # Add other non-secret configs
```

### 3. Create Secrets

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: gcs-secrets
  namespace: globus-gcs
type: Opaque
stringData:
  GLOBUS_CLIENT_ID: "your-client-id"
  GLOBUS_CLIENT_SECRET: "your-client-secret"
  GLOBUS_SUBSCRIPTION_ID: "your-subscription-id"
```

### 4. Create Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: globus-connect-server
  namespace: globus-gcs
spec:
  replicas: 1
  selector:
    matchLabels:
      app: globus-gcs
  template:
    metadata:
      labels:
        app: globus-gcs
    spec:
      containers:
      - name: gcs
        image: globus-connect-server:latest
        envFrom:
        - configMapRef:
            name: gcs-config
        - secretRef:
            name: gcs-secrets
        ports:
        - containerPort: 443
          name: https
        - containerPort: 50000-51000
          name: gridftp
        volumeMounts:
        - name: globus-creds
          mountPath: /opt/globus
        - name: collection-data
          mountPath: /mnt/globus-collections
        - name: ssl-certs
          mountPath: /opt/keys
        securityContext:
          capabilities:
            add:
            - NET_ADMIN
            - SYS_ADMIN
      volumes:
      - name: globus-creds
        persistentVolumeClaim:
          claimName: globus-creds-pvc
      - name: collection-data
        persistentVolumeClaim:
          claimName: collection-data-pvc
      - name: ssl-certs
        secret:
          secretName: ssl-certificates
```

### 5. Create Services

```yaml
apiVersion: v1
kind: Service
metadata:
  name: gcs-service
  namespace: globus-gcs
spec:
  type: LoadBalancer
  selector:
    app: globus-gcs
  ports:
  - name: https
    port: 443
    targetPort: 443
  - name: gridftp-control
    port: 2811
    targetPort: 2811
  # GridFTP data ports would need NodePort or host networking
```

## Storage Considerations

1. **Persistent Volumes**: Use PVCs for:
   - `/opt/globus` - Credentials and deployment key
   - `/mnt/globus-collections` - Collection data
   - `/opt/keys` - SSL certificates

2. **Permissions**: Ensure the UID in container matches host filesystem permissions

3. **Backup**: Regular backups of credentials and collection metadata

## Troubleshooting

### Check Service Status

```bash
# Inside container
docker-compose exec globus-connect-server bash

# Check GCS status
globus-connect-server self-diagnostic

# View logs
tail -f /var/log/globus-connect-server/*.log
```

### Common Issues

1. **Port Access**: Ensure ports 443 and 50000-51000 are accessible
2. **DNS Resolution**: Verify hostname resolves to public IP
3. **Credentials**: Check `/opt/globus/client_cred.json` exists
4. **Permissions**: Verify UID matches between container and host

### Reset Setup

To completely reset and start over:

```bash
# Stop and remove containers
docker-compose down

# Remove credentials and state
rm -rf globus/*.json
rm -rf logs/*

# Start fresh
docker-compose run --rm globus-connect-server python3 /opt/scripts/init-globus.py
docker-compose up -d
```

## Security Notes

1. **Credentials**: Never commit `client_cred.json` or `deployment-key.json`
2. **Network**: Use firewall rules to restrict GridFTP data ports
3. **SSL**: Let's Encrypt certificates are automatically managed
4. **Access**: Use Globus ACLs to control collection access

## Support

For issues specific to this configuration:
- Check the troubleshooting section
- Review container logs
- Verify environment variables

For Globus Connect Server issues:
- [Globus Documentation](https://docs.globus.org/globus-connect-server/)
- [Globus Support](https://support.globus.org/)

## License

This configuration is provided as-is for the ROVI project at ORNL.
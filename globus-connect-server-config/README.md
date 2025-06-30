# Globus Connect Server Configuration

This directory contains a standalone configuration for deploying Globus Connect Server (GCS) in a containerized environment.

**Key Architecture**: Globus Connect Server v5.4 is pre-installed inside the Docker container. You do NOT need to install GCS on your host machine - only Docker and Python are required.

## Prerequisites

- [ ] Docker (>= 20.10) and Docker Compose (>= 1.29) installed
- [ ] Python 3 (>= 3.6) with pip3
- [ ] Git installed and configured
- [ ] A Globus account with project creation privileges
- [ ] A public IP address for your server
- [ ] A DNS hostname that resolves to your public IP
- [ ] Ports 443 and 50000-51000 accessible from the internet

**Note**: You do **NOT** need to install Globus Connect Server on your host machine. GCS v5.4 is pre-installed inside the Docker container. This containerized approach simplifies deployment and ensures consistency.

For detailed requirements, see [Installation Guide](./docs/installation.md).

## Quick Start

1. **Setup and Check Dependencies**
   ```bash
   ./bin/setup.sh
   ```

2. **Initialize Globus Credentials**
   ```bash
   ./bin/init-credentials.sh
   ```

3. **Build Docker Images**
   ```bash
   ./bin/build.sh
   ```
   The build script automatically detects whether you're in the DataFed repository or using it standalone.

4. **Start Services**
   ```bash
   docker compose up -d
   ```

For detailed instructions, see [Getting Started Guide](docs/getting-started.md).

## Cleanup and Removal

To clean up your GCS deployment:

```bash
# Remove cloud resources only (endpoint, project, clients)
./bin/cleanup.sh --cloud

# Remove local files only (containers, volumes, credentials)
./bin/cleanup.sh --local

# Remove everything
./bin/cleanup.sh --all

# Skip confirmation prompts
./bin/cleanup.sh --all --force
```

See [Troubleshooting Guide](docs/troubleshooting.md#cleanup-procedures) for details.

## Documentation

- 📚 [Getting Started](docs/getting-started.md) - First-time setup walkthrough
- 🔧 [Installation Guide](docs/installation.md) - Detailed setup and build instructions
- 📋 [Management Guide](docs/management.md) - Managing collections and users
- ⚙️ [Configuration Reference](docs/configuration.md) - All configuration options
- 🐳 [Docker Deployment](docs/deployment/docker.md) - Docker-specific information
- ☸️ [Kubernetes Deployment](docs/deployment/kubernetes.md) - Rancher/K8s deployment
- 🔍 [Troubleshooting](docs/troubleshooting.md) - Common issues and solutions

## Directory Structure

```
globus-connect-server-config/
├── README.md                   # This documentation
├── docker-compose.yml          # Container orchestration
├── .env.template              # Environment template
│
├── bin/                       # User-facing scripts
│   ├── setup.sh               # Initial setup and dependency check
│   ├── init-credentials.sh    # Initialize Globus credentials
│   ├── check-deps.sh         # Verify system dependencies
│   ├── build.sh              # Build images (with DataFed repo)
│   ├── build-standalone.sh   # Build images (standalone)
│   └── cleanup.sh            # Clean up GCS resources
│
├── docker/                    # Docker-related files
│   ├── Dockerfile            # Custom GCS configuration layer
│   └── requirements.txt      # Python dependencies
│
├── config/                    # Configuration files
│   └── versions.env          # Version configuration
│
├── scripts/                   # Internal scripts
│   ├── entrypoint.sh         # Container entrypoint
│   ├── setup-globus.sh       # Configure gateways/collections
│   └── *.py                  # Python management scripts
│
├── docs/                      # Documentation
│   └── ...                   # Detailed guides
│
├── globus/                   # Globus credentials (git-ignored)
├── keys/                     # SSL certificates (git-ignored)
└── logs/                     # Service logs (git-ignored)
```

## Support

For issues specific to this configuration:
- Check the [Troubleshooting Guide](docs/troubleshooting.md)
- Review container logs: `docker compose logs -f`
- Run diagnostics: `./bin/check-deps.sh`

For Globus Connect Server issues:
- [Globus Documentation](https://docs.globus.org/globus-connect-server/)
- [Globus Support](https://support.globus.org/)

## License

This configuration is provided as-is for research organizations and data repositories.
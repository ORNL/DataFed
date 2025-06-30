FROM ubuntu:20.04

# Install required packages
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    lsb-release \
    python3 \
    python3-pip \
    jq \
    vim \
    curl \
    host \
    && rm -rf /var/lib/apt/lists/*

# Add Globus repository
RUN wget -q https://downloads.globus.org/globus-connect-server/stable/installers/repo/deb/globus-repo_latest_all.deb \
    && dpkg -i globus-repo_latest_all.deb \
    && apt-get update \
    && rm globus-repo_latest_all.deb

# Install Globus Connect Server
RUN apt-get install -y globus-connect-server54 \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies for initialization script
RUN pip3 install globus-sdk

# Create necessary directories
RUN mkdir -p /opt/globus /opt/keys /var/log/globus /mnt/globus-collections

# Copy scripts
COPY scripts/init-globus.py /opt/scripts/init-globus.py
COPY scripts/setup-globus.sh /opt/scripts/setup-globus.sh
COPY scripts/entrypoint.sh /opt/scripts/entrypoint.sh

# Make scripts executable
RUN chmod +x /opt/scripts/*.sh /opt/scripts/*.py

# Set working directory
WORKDIR /opt

# Expose required ports
# 443: HTTPS/Control
# 50000-51000: GridFTP data channels
EXPOSE 443 50000-51000

# Set entrypoint
ENTRYPOINT ["/opt/scripts/entrypoint.sh"]
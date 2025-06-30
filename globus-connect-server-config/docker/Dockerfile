# Globus Connect Server container with custom configuration
ARG GCS_BASE_IMAGE=gcs-ubuntu-base:latest
FROM ${GCS_BASE_IMAGE}

# Install dependencies
RUN apt-get update && apt-get install -y \
    python3-pip \
    jq \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python packages
COPY docker/requirements.txt /tmp/
RUN pip3 install --no-cache-dir -r /tmp/requirements.txt && rm /tmp/requirements.txt

# Create directories
RUN mkdir -p /opt/scripts /opt/globus-config /mnt/globus-collections

# Copy scripts
COPY scripts/*.sh scripts/*.py /opt/scripts/
RUN chmod +x /opt/scripts/*

# Remove deprecated --client-id parameter from base entrypoint
RUN sed -i '/--client-id/d' /entrypoint.sh

# Expose ports
# 443: HTTPS/Control
# 50000-51000: GridFTP data channels
EXPOSE 443 50000-51000

WORKDIR /opt
ENTRYPOINT ["/opt/scripts/entrypoint.sh"]
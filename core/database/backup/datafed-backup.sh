#!/bin/bash

echo "DataFed - running DB backup"

# Shutdown DataFed services
systemctl stop globus-gridftp-server.service
systemctl stop datafed-ws.service
systemctl stop datafed-repo.service
systemctl stop datafed-core.service
systemctl stop arangodb3.service

backup_file=DataFed_DB_Backup_$(date +"%Y_%m_%d").tar.gz

# Tar contents of arangodb directory without full path
tar -C /var/lib/arangodb3 -cvzf "${backup_file}" .

# Move backup file to storage location
mv "${backup_file}" /data/backups

# Restart DataFed services
systemctl start arangodb3.service
systemctl start datafed-core.service
systemctl start globus-gridftp-server.service
systemctl start datafed-repo.service
systemctl start datafed-ws.service

echo "DataFed - backup completed"

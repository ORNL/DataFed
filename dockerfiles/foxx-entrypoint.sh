#!/bin/sh
exec nohup /source/scripts/install_foxx.sh -w -p "$ARANGO_ROOT_PASSWORD" &
exec /entrypoint.sh "$@"

#!/usr/bin/env bash
# stop_mock_schema.sh — Stop and remove the Prism mock Schema API container.
#
# Called by CTest as a fixture cleanup step. Always exits 0 — a missing
# container is not an error (the test may have already cleaned up, or
# startup may have failed).
#
# Optional env:
#   CONTAINER_NAME — Docker container name (default: datafed-mock-schema)

set -u

NAME="${CONTAINER_NAME:-datafed-mock-schema}"

if docker rm -f "${NAME}" &>/dev/null; then
  echo "Stopped and removed container: ${NAME}"
else
  echo "Container ${NAME} was not running (already removed or never started)"
fi

exit 0

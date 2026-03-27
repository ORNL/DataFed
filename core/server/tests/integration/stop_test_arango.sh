#!/usr/bin/env bash
# stop_test_arango.sh — Stop and remove the ArangoDB test container, but only
# if the fixture started it.
#
# If start_test_arango.sh reused a pre-existing instance, the state file won't
# exist and this script is a no-op.
#
# Optional env:
#   ARANGO_CONTAINER — Container name (default: datafed-test-arango)
set -u

NAME="${ARANGO_CONTAINER:-datafed-test-arango}"
STATE_FILE="/tmp/${NAME}.started-by-fixture"

if [ -f "${STATE_FILE}" ]; then
  if docker rm -f "${NAME}" &>/dev/null; then
    echo "Stopped and removed container: ${NAME}"
  else
    echo "Container ${NAME} was not running (already removed?)"
  fi
  rm -f "${STATE_FILE}"
else
  echo "ArangoDB was pre-existing — leaving it alone"
fi

exit 0

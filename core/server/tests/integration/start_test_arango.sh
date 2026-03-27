#!/usr/bin/env bash
# start_test_arango.sh — Start (or reuse) ArangoDB and provision Foxx services.
#
# If ArangoDB is already reachable at the target address, the existing instance
# is reused and no container is started.  Either way, Foxx services are
# (re)installed via scripts/install_foxx.sh.
#
# Required env:
#   DATAFED_PROJECT_ROOT — Path to the DataFed repository root
#   ARANGO_IMAGE         — Docker image (only required when starting a container)
#
# Optional env:
#   ARANGO_PORT          — Host port to bind (default: 8529)
#   ARANGO_ROOT_PASS     — Root password (default: "test")
#   ARANGO_CONTAINER     — Container name (default: datafed-test-arango)
#   ARANGO_PULL          — "true" to pull image before starting (default: true)
set -eu

PROJECT_ROOT="${DATAFED_PROJECT_ROOT:?DATAFED_PROJECT_ROOT must be set}"
PORT="${ARANGO_PORT:-8529}"
ROOT_PASS="${ARANGO_ROOT_PASS:-test}"
NAME="${ARANGO_CONTAINER:-datafed-test-arango}"
PULL="${ARANGO_PULL:-true}"
MAX_WAIT=60

# State file: if we create it, the cleanup step knows to tear down the
# container.  If ArangoDB was already running, the file is never created
# and cleanup leaves the instance alone.
STATE_FILE="/tmp/${NAME}.started-by-fixture"
rm -f "${STATE_FILE}"

# ── Check for an already-running instance ────────────────────────────────────

if curl -sf -o /dev/null \
    -u "root:${ROOT_PASS}" \
    "http://localhost:${PORT}/_api/version" 2>/dev/null; then
  echo "ArangoDB already reachable on port ${PORT} — reusing existing instance"
else
  # ── No instance found — start a container ────────────────────────────────
  IMAGE="${ARANGO_IMAGE:?ARANGO_IMAGE must be set (no running ArangoDB found)}"

  if ! command -v docker &>/dev/null; then
    echo "ERROR: docker not found and no ArangoDB running on port ${PORT}" >&2
    exit 1
  fi

  docker rm -f "${NAME}" &>/dev/null || true

  if [ "${PULL}" = "true" ]; then
    echo "Pulling ${IMAGE}..."
    docker pull "${IMAGE}"
  fi

  echo "Starting ArangoDB test instance on port ${PORT}..."
  docker run -d \
    --name "${NAME}" \
    -p "${PORT}:8529" \
    -e ARANGO_ROOT_PASSWORD="${ROOT_PASS}" \
    "${IMAGE}"

  # ── Wait for readiness ───────────────────────────────────────────────────
  echo "Waiting for ArangoDB readiness (max ${MAX_WAIT}s)..."
  for i in $(seq 1 "${MAX_WAIT}"); do
    if curl -sf -o /dev/null \
      -u "root:${ROOT_PASS}" \
      "http://localhost:${PORT}/_api/version" 2>/dev/null; then
      echo "ArangoDB ready on port ${PORT} (took ${i}s)"
      break
    fi
    if [ "$i" -eq "${MAX_WAIT}" ]; then
      echo "ERROR: ArangoDB did not become ready in ${MAX_WAIT}s" >&2
      echo "--- container logs ---"
      docker logs "${NAME}" 2>&1 | tail -50 || true
      echo "--- end logs ---"
      docker rm -f "${NAME}" &>/dev/null || true
      exit 1
    fi
    sleep 1
  done

  # Mark that we started the container so cleanup knows to remove it.
  touch "${STATE_FILE}"
fi

# ── Provision Foxx services ──────────────────────────────────────────────────
#
# install_foxx.sh is idempotent — it checks whether the DB/services exist and
# creates or replaces as needed.  We pass credentials via env + CLI flags so
# the script finds the instance we just validated above.
echo "Provisioning database and Foxx services..."
export DATAFED_DATABASE_PASSWORD="${ROOT_PASS}"
export DATAFED_DATABASE_HOST="localhost"

bash "${DATAFED_PROJECT_ROOT}/scripts/install_foxx.sh" \
  -p "${ROOT_PASS}" \
  -u "root" \
  -i "localhost"

echo "Foxx provisioning complete."

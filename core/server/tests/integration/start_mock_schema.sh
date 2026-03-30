#!/usr/bin/env bash
# start_mock_schema.sh — Start the Prism mock Schema API container.
#
# Called by CTest as a fixture setup step. Environment variables are
# injected by CMake via set_tests_properties(... ENVIRONMENT ...).
#
# Optional env:
#   MOCK_SCHEMA_IMAGE   — Docker image (default: savannah.ornl.gov/datafed/mock-schema:latest)
#   MOCK_SCHEMA_PORT    — Host port to bind (default: 4011)
#   CONTAINER_NAME      — Docker container name (default: datafed-mock-schema)
#   MOCK_SCHEMA_PULL    — "true" to pull image before starting (default: true)

set -eu

IMAGE="${MOCK_SCHEMA_IMAGE:-savannah.ornl.gov/datafed/mock-schema:latest}"
PORT="${MOCK_SCHEMA_PORT:-4011}"
NAME="${CONTAINER_NAME:-datafed-mock-schema}"
PULL="${MOCK_SCHEMA_PULL:-true}"
MAX_WAIT=30

# ── Validate ─────────────────────────────────────────────────────────────────

if ! command -v docker &>/dev/null; then
  echo "ERROR: docker not found in PATH" >&2
  exit 1
fi

# ── Cleanup any stale container ──────────────────────────────────────────────

docker rm -f "${NAME}" &>/dev/null || true

# ── Pull (optional, skipped for local builds) ────────────────────────────────

if [ "${PULL}" = "true" ]; then
  echo "Pulling ${IMAGE}..."
  docker pull "${IMAGE}"
fi

# ── Start container ──────────────────────────────────────────────────────────

echo "Starting mock schema server on port ${PORT}..."

docker run -d \
  --name "${NAME}" \
  -p "${PORT}:4011" \
  -e PRISM_DYNAMIC=false \
  -e PRISM_ERRORS=true \
  -e PRISM_PORT=4011 \
  "${IMAGE}"

# ── Wait for readiness ───────────────────────────────────────────────────────
# Hit the list endpoint — any 2xx means Prism is serving the spec.

echo "Waiting for readiness (max ${MAX_WAIT}s)..."

for i in $(seq 1 ${MAX_WAIT}); do
  if curl -sf -o /dev/null "http://localhost:${PORT}/schemas?page=1&limit=1" 2>/dev/null; then
    echo "Mock schema server ready on port ${PORT} (took ${i}s)"
    exit 0
  fi
  sleep 1
done

echo "ERROR: mock schema server did not become ready in ${MAX_WAIT}s" >&2
echo "--- container logs ---"
docker logs "${NAME}" 2>&1 || true
echo "--- end logs ---"
docker rm -f "${NAME}" &>/dev/null || true
exit 1

#!/usr/bin/env bash
# test-local.sh - run the Speedify self-hosted server stack locally in WSL,
# mirroring the Azure pipeline (Packer image + Terraform VM) without Azure.
#
# Cloud pipeline -> local test mapping:
#   corp.env (SPEEDIFY_SERVER_NAME)  -> SERVER_NAME in .env (read from ../corp.env)
#   install-speedify-server.sh       -> this script bakes $TEST_DIR (compose + .env + volume dirs)
#   cloud-init in speedify.tf        -> stamps the WSL IP (`hostname -I`) into .env as PUBLIC_IP
#   activate-speedify-server.sh      -> activation URL is read from the container logs
#
# The docker-compose.yml written below is an EXACT copy of the repo
# docker-compose.yml (the cloud source of truth), plus cap_add NET_ADMIN and
# the /dev/net/tun device mapping for local WSL testing - with ONE deliberate
# deviation: the published session port range is a small slice instead of the
# full 32768-65535 range. Docker Desktop's WSL integration proxy crashes when
# a container publishes 65k+ ports (the cloud VM kernel handles it fine).
#
# Usage (from WSL):
#   sudo ./test-local.sh
#
# Re-running is safe: it re-stamps PUBLIC_IP (the WSL IP changes on every WSL
# restart) and `docker compose up -d` recreates the container when the
# resolved config changes.

set -euo pipefail

TEST_DIR="${SPEEDIFY_LOCAL_TEST_DIR:-/opt/speedify-local-test}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Small published session-port slice for WSL (see header note). Override with
# SPEEDIFY_LOCAL_PORT_RANGE if you need more session ports locally.
LOCAL_PORT_RANGE="${SPEEDIFY_LOCAL_PORT_RANGE:-32768-32867}"

# ---------------------------------------------------------------------------
# 0. Must run as root (same rule as install-speedify-server.sh: /opt + docker)
# ---------------------------------------------------------------------------
if [ "$(id -u)" -ne 0 ]; then
  echo "must run as root (e.g. sudo $0)" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# 1. Check Docker + docker compose v2 (check only - no installs, unlike the
#    Packer install script, because this is a local test harness)
# ---------------------------------------------------------------------------
if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is not installed. Install one of these first:" >&2
  echo "  - Docker Desktop with WSL2 integration enabled, or" >&2
  echo "  - inside WSL: sudo apt-get install docker.io docker-compose-v2" >&2
  exit 1
fi

# Wait for the docker daemon (mirrors the cloud-init wait loop in speedify.tf
# and the readiness loop in install-speedify-server.sh).
for _ in $(seq 1 30); do
  docker info >/dev/null 2>&1 && break
  sleep 2
done
if ! docker info >/dev/null 2>&1; then
  echo "docker daemon is not reachable. Start Docker Desktop (or 'sudo service docker start' in WSL)." >&2
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "docker compose v2 plugin not found (need 'docker compose', not docker-compose v1)." >&2
  echo "  inside WSL: sudo apt-get install docker-compose-v2" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# 2. Create the local test directory + config volume dirs (mirrors the
#    install -d of /opt/speedify-server/.local/ssm in the Packer build)
# ---------------------------------------------------------------------------
echo "Creating test directory $TEST_DIR ..."
install -d -m 0750 \
  "$TEST_DIR/.local/ssm/analytics" \
  "$TEST_DIR/.local/ssm/var/log/speedify/servers" \
  "$TEST_DIR/.local/ssm/var/run/speedify/servers" \
  "$TEST_DIR/.local/ssm/var/lib/ssm"

# ---------------------------------------------------------------------------
# 3. Generate docker-compose.yml - EXACT copy of the repo compose file used
#    by the Packer build, plus cap_add NET_ADMIN + /dev/net/tun for WSL.
#    ${PUBLIC_IP} / ${SERVER_NAME} stay as compose interpolation variables
#    resolved from .env at runtime (same IP-agnostic pattern as the cloud).
# ---------------------------------------------------------------------------
if [ -e /dev/net/tun ]; then
  CAPS_BLOCK="    cap_add:
      - NET_ADMIN
    devices:
      - /dev/net/tun:/dev/net/tun"
else
  echo "WARNING: /dev/net/tun not found - skipping the device mapping (cap_add NET_ADMIN still applied)." >&2
  CAPS_BLOCK="    cap_add:
      - NET_ADMIN"
fi

cat > "$TEST_DIR/docker-compose.yml" <<COMPOSE_EOF
# Local WSL test mirror of the cloud docker-compose.yml (repo source of truth).
# Deviations vs the cloud file: cap_add NET_ADMIN + /dev/net/tun device, and a
# reduced published session port range (Docker Desktop WSL proxy limitation).
services:
  speed-server:
    platform: linux/amd64
    image: speedify/ss-manager:latest
$CAPS_BLOCK
    volumes:
      - \${DOCKER_SOCK_PATH:-/var/run/docker.sock}:/run/docker.sock
      - ./.local/ssm/analytics:/var/log/speedify/analytics
      - ./.local/ssm/var/log/speedify/servers:/var/log/speedify/servers
      - ./.local/ssm/var/run/speedify/servers:/var/run/speedify/servers
      - /proc:/host-proc:ro
      - ./.local/ssm/var/lib/ssm:/var/lib/ssm
    ports:
      - "8443:443"
      - "$LOCAL_PORT_RANGE:$LOCAL_PORT_RANGE/tcp"
      - "$LOCAL_PORT_RANGE:$LOCAL_PORT_RANGE/udp"
    environment:
      ALLOCATION_TYPE: ondemand
      ENABLE_SESSION_TOKENS: "true"
      DIRECTORY_URI: "https://directory.speedifynetworks.com"
      SELF_HOSTED_MODE: "true"
      PUBLIC_IP: "\${PUBLIC_IP}"
      PUBLIC_API_PORT: "8443"
      PUBLISHED_PORT_RANGE: "$LOCAL_PORT_RANGE"
      API_HTTP_PORT: "80"
      API_HTTPS_PORT: "443"
      DOCKER_REPO_PREFIX: "speedify"
      SERVER_NAME: "\${SERVER_NAME}"
    restart: always
COMPOSE_EOF

# ---------------------------------------------------------------------------
# 4. Write .env - mimics cloud-init in speedify.tf, which stamps the VM's
#    public IP into .env. Locally we stamp the WSL IP from `hostname -I`.
#    SERVER_NAME comes from corp.env (single source of truth), like the
#    Packer build passes it to install-speedify-server.sh.
# ---------------------------------------------------------------------------
WSL_IP="$(hostname -I | awk '{print $1}')"
if [ -z "$WSL_IP" ]; then
  echo "Could not determine the WSL IP via 'hostname -I'." >&2
  exit 1
fi

SERVER_NAME=""
CORP_ENV="$SCRIPT_DIR/../corp.env"
if [ -f "$CORP_ENV" ]; then
  SERVER_NAME="$(grep -E '^SPEEDIFY_SERVER_NAME=' "$CORP_ENV" | head -n 1 | cut -d= -f2- | tr -d '\r' || true)"
fi
SERVER_NAME="${SERVER_NAME:-Speedify Self-Hosted Server}"

cat > "$TEST_DIR/.env" <<ENV_EOF
# Stamped by test-local.sh (local equivalent of the speedify.tf cloud-init IP stamp)
PUBLIC_IP=$WSL_IP
SERVER_NAME=$SERVER_NAME
ENV_EOF

echo "  PUBLIC_IP  : $WSL_IP"
echo "  SERVER_NAME: $SERVER_NAME"

# ---------------------------------------------------------------------------
# 5. Pull + start the stack (same sequence as install-speedify-server.sh's
#    pre-pull and the cloud-init `docker compose up -d`)
# ---------------------------------------------------------------------------
cd "$TEST_DIR"
echo "Pulling speedify/ss-manager:latest ..."
docker compose pull
echo "Starting the stack ..."
docker compose up -d
docker compose ps

# ---------------------------------------------------------------------------
# 6. Activation info - mirrors activate-speedify-server.sh: the ss-manager
#    container prints the activation URL into its logs on first start.
# ---------------------------------------------------------------------------
CONTAINER_ID="$(docker compose ps -q speed-server | head -n 1)"
if [ -z "$CONTAINER_ID" ]; then
  echo "speed-server container did not start - check: docker compose -f $TEST_DIR/docker-compose.yml logs" >&2
  exit 1
fi
CONTAINER_NAME="$(docker inspect --format '{{.Name}}' "$CONTAINER_ID")"
CONTAINER_NAME="${CONTAINER_NAME#/}"

echo "Waiting for the activation URL in the logs (up to 2 minutes)..."
ACTIVATION_URL=""
for _ in $(seq 1 24); do
  ACTIVATION_URL="$(docker compose logs 2>/dev/null | grep -o 'https://my\.speedify\.com/activate[^ ]*' | tail -n 1 || true)"
  [ -n "$ACTIVATION_URL" ] && break
  sleep 5
done

# Detect an activation helper inside the container (path varies by image
# version), so the echoed docker exec command below is always exact.
ACTIVATE_IN_CONTAINER="$(docker exec "$CONTAINER_NAME" sh -c \
  'find /usr/local /opt /etc /srv -maxdepth 5 -type f -iname "*activate*" 2>/dev/null | head -n 1' || true)"

echo ""
echo "====================================================================="
echo " Local Speedify server is up."
echo "   compose dir : $TEST_DIR"
echo "   PUBLIC_IP   : $WSL_IP  (stamped into .env - cloud-init equivalent)"
echo "   manager API : https://$WSL_IP:8443"
echo "   container   : $CONTAINER_NAME"
if [ -n "$ACTIVATION_URL" ]; then
  echo ""
  echo "   ACTIVATION URL (open in a browser, attach the Self-Hosted license):"
  echo "     $ACTIVATION_URL"
fi
echo ""
echo " Trigger activation inside the container:"
if [ -n "$ACTIVATE_IN_CONTAINER" ]; then
  echo "   docker exec -it $CONTAINER_NAME $ACTIVATE_IN_CONTAINER"
else
  echo "   (no activation script found in the image - the container prints the"
  echo "   activation URL itself; watch it with:)"
  echo "     docker compose -f $TEST_DIR/docker-compose.yml logs -f"
fi
echo ""
echo " Follow the logs:"
echo "   docker compose -f $TEST_DIR/docker-compose.yml logs -f"
echo ""
echo " Stop the stack:"
echo "   docker compose -f $TEST_DIR/docker-compose.yml down"
echo "====================================================================="
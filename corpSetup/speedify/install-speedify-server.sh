#!/usr/bin/env bash
# Single source of truth for installing a Speedify self-hosted server.
#
# Idempotent (safe to re-run). Does everything:
#   1. Installs Docker + docker compose v2 (skipped if already present)
#   2. Bakes /opt/speedify-server: copies docker-compose.yml (uploaded to
#      /tmp by the Packer file provisioner) + writes a default .env
#      (PUBLIC_IP=auto, SERVER_NAME from the environment - passed in by
#      Packer from corp.env). The compose file keeps ${PUBLIC_IP}/
#      ${SERVER_NAME} as interpolation variables resolved from .env at
#      runtime, so the result is IP-agnostic - cloud-init stamps the
#      real public IP per VM.
#   3. Pulls the speedify/ss-manager image so no registry pull is needed at boot
#
# Used by the Packer image build (speedify-image.pkr.hcl). docker-compose.yml
# stays the repo source of truth - edit it there, not here.
set -euo pipefail

COMPOSE_SRC="${COMPOSE_SRC:-/tmp/docker-compose.yml}"

if [ "$(id -u)" -ne 0 ]; then
  echo "must run as root (e.g. sudo $0)" >&2
  exit 1
fi

# --- 1. Docker + docker compose v2 (only if missing) ---
if ! command -v docker >/dev/null 2>&1; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update
  apt-get install -y docker.io docker-compose-v2
fi

# Make sure the docker daemon is enabled and actually accepting connections
# (covers fresh installs and pre-baked images where it may not be up yet).
systemctl enable --now docker
for i in $(seq 1 30); do
  if docker info >/dev/null 2>&1; then
    break
  fi
  sleep 2
done
if ! docker info >/dev/null 2>&1; then
  echo "docker daemon did not become ready" >&2
  exit 1
fi

# --- 2. Bake /opt/speedify-server (compose + default .env) ---
install -d -m 0750 /opt/speedify-server/.local/ssm

if [ ! -f "$COMPOSE_SRC" ]; then
  echo "docker-compose.yml not found at $COMPOSE_SRC" >&2
  echo "(Packer uploads it to /tmp first; set COMPOSE_SRC to override)" >&2
  exit 1
fi
install -m 0644 "$COMPOSE_SRC" /opt/speedify-server/docker-compose.yml

cat > /opt/speedify-server/.env <<ENV_EOF
PUBLIC_IP=auto
SERVER_NAME=${SERVER_NAME:-Speedify Self-Hosted Server}
ENV_EOF

# --- 3. Pre-pull the ss-manager image (no registry pull at boot) ---
cd /opt/speedify-server
docker compose pull
echo 'Speedify server stack installed.'
#!/usr/bin/env bash
set -euo pipefail

install -d -m 0750 /opt/speedify-server/.local/ssm

# Docker and docker compose v2 are pre-baked by the Packer image
# (speedify-image.pkr.hcl); only install if missing so the same script also
# works when building from a plain marketplace image.
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
    exit 0
  fi
  sleep 2
done
echo "docker daemon did not become ready" >&2
exit 1
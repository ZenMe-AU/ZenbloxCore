#!/usr/bin/env bash
set -euo pipefail

install -d -m 0750 /opt/speedify-server/.local/ssm

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y docker.io docker-compose-v2
systemctl enable --now docker

cat > /opt/speedify-server/docker-compose.yml <<'EOF'
services:
  speed-server:
    platform: linux/amd64
    image: speedify/ss-manager:latest
    volumes:
      - /var/run/docker.sock:/run/docker.sock
      - ./.local/ssm/analytics:/var/log/speedify/analytics
      - ./.local/ssm/var/log/speedify/servers:/var/log/speedify/servers
      - ./.local/ssm/var/run/speedify/servers:/var/run/speedify/servers
      - /proc:/host-proc:ro
      - ./.local/ssm/var/lib/ssm:/var/lib/ssm
    ports:
      - "8443:443"
    environment:
      ALLOCATION_TYPE: ondemand
      ENABLE_SESSION_TOKENS: "true"
      DIRECTORY_URI: "https://directory.speedifynetworks.com"
      SELF_HOSTED_MODE: "true"
      PUBLIC_API_PORT: "8443"
      API_HTTP_PORT: "80"
      API_HTTPS_PORT: "443"
      DOCKER_REPO_PREFIX: "speedify"
    restart: always
EOF

cd /opt/speedify-server
docker compose pull
docker compose up -d
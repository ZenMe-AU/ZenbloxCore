#!/usr/bin/env bash
# Interactive Speedify activation step for the Packer image build.
#
# Starts the Speedify server stack, prints the activation URL + code from the
# logs, then WAITS while the operator completes the login/license flow in a
# browser. Once activation is confirmed, the stack is stopped and the
# activated state (baked into /opt/speedify-server/.local) is captured into
# the image - so every VM booted from it is already activated.
#
# Skippable: set SKIP_ACTIVATION=true to exit immediately (unactivated image).
#
# Runs AFTER install-speedify-server.sh (which bakes /opt/speedify-server).
set -euo pipefail

if [ "${SKIP_ACTIVATION:-false}" = "true" ]; then
  echo "SKIP_ACTIVATION=true - skipping Speedify activation (image stays unactivated)."
  exit 0
fi

cd /opt/speedify-server

# --- Start the stack so it generates an activation code ---
docker compose up -d

# --- Wait for the activation URL to appear in the logs ---
echo ""
echo "====================================================================="
echo " SPEEDIFY ACTIVATION REQUIRED"
echo " Waiting for the activation URL to appear in the server logs..."
echo "====================================================================="
ACTIVATION_URL=""
for i in $(seq 1 60); do
  ACTIVATION_URL=$(docker compose logs 2>/dev/null | grep -o 'https://my\.speedify\.com/activate[^ ]*' | tail -n 1 || true)
  if [ -n "$ACTIVATION_URL" ]; then
    break
  fi
  sleep 5
done

if [ -z "$ACTIVATION_URL" ]; then
  echo "No activation URL appeared in the logs within 5 minutes." >&2
  echo "Check the logs manually: docker compose -f /opt/speedify-server/docker-compose.yml logs" >&2
  exit 1
fi

echo ""
echo "====================================================================="
echo " OPEN THIS URL IN A BROWSER AND COMPLETE THE LOGIN + LICENSE:"
echo ""
echo "   $ACTIVATION_URL"
echo ""
echo " Sign in to your Speedify account and attach the Self-Hosted Server"
echo " license. The build WAITS until you confirm below."
echo "====================================================================="
echo ""

# --- Wait for the operator to finish the browser flow ---
read -r -p "Press ENTER here AFTER completing activation in the browser... " _ </dev/tty || true

# --- Give the server a moment to detect the license, then verify ---
echo "Waiting for the server to confirm activation (up to 3 minutes)..."
ACTIVATED=""
for i in $(seq 1 18); do
  if docker compose logs 2>/dev/null | grep -qiE 'activation (successful|complete)|server (is )?(now )?activated|successfully activated'; then
    ACTIVATED="yes"
    break
  fi
  sleep 10
done

if [ -z "$ACTIVATED" ]; then
  echo "Could not confirm activation from the logs." >&2
  read -r -p "Activate anyway and bake the current state? [y/N] " ans </dev/tty || ans=""
  case "$ans" in
    y|Y|yes) ;;
    *) echo "Aborting - image will NOT be published with this activation state." >&2; exit 1 ;;
  esac
fi

# --- Stop the stack; activated state persists in /opt/speedify-server/.local ---
docker compose down

echo "Speedify activation state captured into the image."
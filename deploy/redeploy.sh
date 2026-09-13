#!/bin/bash
# Ship what is on GitHub main to the running server.
#
#   deploy/redeploy.sh                      uses the defaults below
#   SHOULDER_SERVER=1.2.3.4 deploy/redeploy.sh
#
# The database lives in a Docker volume, so families survive a redeploy. The
# Rahmans are re-seeded when the new container starts.
set -euo pipefail

SERVER="${SHOULDER_SERVER:-100.56.157.153}"
KEY="${SHOULDER_KEY:-$HOME/.ssh/shoulder-deploy.pem}"

ssh -i "$KEY" -o StrictHostKeyChecking=accept-new "ubuntu@${SERVER}" '
  set -euo pipefail
  cd /opt/shoulder
  git pull --ff-only
  cd deploy
  sudo docker compose up -d --build
  sudo docker image prune -f >/dev/null
  sudo docker compose ps
'

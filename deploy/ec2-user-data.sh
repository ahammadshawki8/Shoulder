#!/bin/bash
# First boot of an Ubuntu 24.04 EC2 instance: Docker, the repo, and the app.
# SHOULDER_HOST is written into this script by deploy/aws.sh before launch.
set -euxo pipefail

SHOULDER_HOST="__SHOULDER_HOST__"
REPO="https://github.com/ahammadshawki8/Shoulder.git"

# Building the app needs more memory than a small instance has spare.
if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl git
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  > /etc/apt/sources.list.d/docker.list
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker
usermod -aG docker ubuntu

if [ ! -d /opt/shoulder ]; then
  git clone "$REPO" /opt/shoulder
fi
chown -R ubuntu:ubuntu /opt/shoulder
echo "SHOULDER_HOST=${SHOULDER_HOST}" > /opt/shoulder/deploy/.env

cd /opt/shoulder/deploy
docker compose up -d --build

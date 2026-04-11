#!/bin/bash
set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}"
echo "╔══════════════════════════════════════════════════╗"
echo "║           ProxHub — Deployment Script            ║"
echo "║      Proxmox VM Management Portal                ║"
echo "╚══════════════════════════════════════════════════╝"
echo -e "${NC}"

if [ "$(id -u)" -ne 0 ]; then
  echo -e "${RED}This script must be run as root (or with sudo).${NC}"
  exit 1
fi

INSTALL_DIR="/opt/proxhub"

echo -e "${YELLOW}[1/6] Updating system packages...${NC}"
apt-get update -qq
apt-get upgrade -y -qq

echo -e "${YELLOW}[2/6] Installing Docker...${NC}"
if command -v docker &> /dev/null; then
  echo "Docker is already installed: $(docker --version)"
else
  apt-get install -y -qq ca-certificates curl gnupg lsb-release
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
    $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
    tee /etc/apt/sources.list.d/docker.list > /dev/null
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable docker
  systemctl start docker
  echo -e "${GREEN}Docker installed: $(docker --version)${NC}"
fi

echo -e "${YELLOW}[3/6] Installing Git...${NC}"
if command -v git &> /dev/null; then
  echo "Git is already installed: $(git --version)"
else
  apt-get install -y -qq git
  echo -e "${GREEN}Git installed.${NC}"
fi

echo -e "${YELLOW}[4/6] Setting up ProxHub directory...${NC}"
mkdir -p "$INSTALL_DIR"
echo "Install directory: $INSTALL_DIR"

if [ -d "$INSTALL_DIR/.git" ]; then
  echo "Existing installation found. Pulling latest changes..."
  cd "$INSTALL_DIR"
  git pull
else
  echo ""
  echo -e "${YELLOW}You need to get the ProxHub source code into ${INSTALL_DIR}${NC}"
  echo "Options:"
  echo "  1. Clone from your git repo:  git clone <your-repo-url> $INSTALL_DIR"
  echo "  2. Copy files manually:       scp -r ./* root@your-server:$INSTALL_DIR/"
  echo ""

  if [ ! -f "$INSTALL_DIR/docker-compose.yml" ]; then
    echo -e "${RED}No source code found in $INSTALL_DIR${NC}"
    echo "Please copy or clone the ProxHub source code to $INSTALL_DIR and re-run this script."
    exit 1
  fi
fi

cd "$INSTALL_DIR"

echo -e "${YELLOW}[5/6] Configuring environment...${NC}"
if [ ! -f "$INSTALL_DIR/.env" ]; then
  if [ -f "$INSTALL_DIR/.env.example" ]; then
    cp "$INSTALL_DIR/.env.example" "$INSTALL_DIR/.env"

    SESSION_SECRET=$(openssl rand -hex 32)
    sed -i "s/CHANGE_ME_generate_a_random_secret/$SESSION_SECRET/" "$INSTALL_DIR/.env"

    PG_PASSWORD=$(openssl rand -hex 16)
    sed -i "s/CHANGE_ME_strong_password_here/$PG_PASSWORD/" "$INSTALL_DIR/.env"

    SERVER_IP=$(hostname -I | awk '{print $1}')
    sed -i "s|http://your-server-ip:3000|http://$SERVER_IP:3000|" "$INSTALL_DIR/.env"

    echo -e "${GREEN}.env file created with auto-generated secrets.${NC}"
    echo -e "${YELLOW}Review and edit $INSTALL_DIR/.env before starting:${NC}"
    echo "  nano $INSTALL_DIR/.env"
    echo ""
  else
    echo -e "${RED}.env.example not found. Cannot create .env file.${NC}"
    exit 1
  fi
else
  echo ".env file already exists. Skipping."
fi

echo -e "${YELLOW}[6/6] Building and starting ProxHub...${NC}"
cd "$INSTALL_DIR"
docker compose build --no-cache
docker compose up -d

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║            ProxHub is now running!               ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════╝${NC}"
echo ""
SERVER_IP=$(hostname -I | awk '{print $1}')
echo -e "  URL:      ${GREEN}http://$SERVER_IP:3000${NC}"
echo -e "  Username: ${GREEN}admin${NC}"
echo -e "  Password: ${GREEN}admin${NC}"
echo ""
echo -e "${YELLOW}IMPORTANT: Change the admin password after first login!${NC}"
echo ""
echo "Useful commands:"
echo "  docker compose -f $INSTALL_DIR/docker-compose.yml logs -f    # View logs"
echo "  docker compose -f $INSTALL_DIR/docker-compose.yml restart    # Restart"
echo "  docker compose -f $INSTALL_DIR/docker-compose.yml down       # Stop"
echo "  docker compose -f $INSTALL_DIR/docker-compose.yml up -d      # Start"
echo ""

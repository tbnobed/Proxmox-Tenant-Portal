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

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="$SCRIPT_DIR"

if [ ! -f "$INSTALL_DIR/docker-compose.yml" ]; then
  echo -e "${RED}docker-compose.yml not found in $INSTALL_DIR${NC}"
  echo "Please run this script from the ProxHub source directory."
  exit 1
fi

echo -e "Install directory: ${GREEN}$INSTALL_DIR${NC}"
echo ""

echo -e "${YELLOW}[1/5] Updating system packages...${NC}"
apt-get update -qq
apt-get upgrade -y -qq

echo -e "${YELLOW}[2/5] Installing Docker...${NC}"
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

echo -e "${YELLOW}[3/5] Verifying Docker Compose...${NC}"
if docker compose version &> /dev/null; then
  echo "Docker Compose: $(docker compose version --short)"
else
  echo -e "${RED}Docker Compose plugin not found. Installing...${NC}"
  apt-get install -y -qq docker-compose-plugin
fi

echo -e "${YELLOW}[4/5] Configuring environment...${NC}"
cd "$INSTALL_DIR"

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
    echo ""
    echo -e "  ${YELLOW}Optional: Review and edit before continuing:${NC}"
    echo "  nano $INSTALL_DIR/.env"
    echo ""
  else
    echo -e "${RED}.env.example not found. Cannot create .env file.${NC}"
    exit 1
  fi
else
  echo ".env file already exists. Skipping."
fi

echo -e "${YELLOW}[5/5] Building and starting ProxHub...${NC}"
echo "This may take a few minutes on first build..."
echo ""
docker compose build --no-cache
docker compose up -d

echo ""
sleep 3

if docker compose ps --format '{{.Service}} {{.State}}' | grep -q "running"; then
  echo -e "${GREEN}╔══════════════════════════════════════════════════╗${NC}"
  echo -e "${GREEN}║            ProxHub is now running!               ║${NC}"
  echo -e "${GREEN}╚══════════════════════════════════════════════════╝${NC}"
else
  echo -e "${RED}╔══════════════════════════════════════════════════╗${NC}"
  echo -e "${RED}║     Something went wrong. Check logs below:      ║${NC}"
  echo -e "${RED}╚══════════════════════════════════════════════════╝${NC}"
  echo ""
  docker compose logs --tail=50
  exit 1
fi

echo ""
SERVER_IP=$(hostname -I | awk '{print $1}')
APP_PORT=$(grep -E '^APP_PORT=' "$INSTALL_DIR/.env" 2>/dev/null | cut -d= -f2 || echo "3000")
APP_PORT=${APP_PORT:-3000}

echo -e "  URL:      ${GREEN}http://$SERVER_IP:$APP_PORT${NC}"
echo -e "  Username: ${GREEN}admin${NC}"
echo -e "  Password: ${GREEN}admin${NC}"
echo ""
echo -e "${YELLOW}IMPORTANT: Change the admin password after first login!${NC}"
echo ""
echo "Useful commands (run from $INSTALL_DIR):"
echo "  docker compose logs -f          # View live logs"
echo "  docker compose logs app -f      # View app logs only"
echo "  docker compose restart          # Restart all services"
echo "  docker compose down             # Stop everything"
echo "  docker compose up -d            # Start everything"
echo "  docker compose up -d --build    # Rebuild and start"
echo ""

#!/usr/bin/env bash
# ==============================================================================
# UZHAVAN AI - AUTOMATED AWS EC2 SETUP & DEPLOYMENT SCRIPT
# ==============================================================================
# Target OS: Ubuntu 22.04 / 24.04 LTS on AWS EC2 (ap-south-1 Mumbai recommended)
# Run as: chmod +x deploy/setup-ec2.sh && ./deploy/setup-ec2.sh
# ==============================================================================

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}=====================================================${NC}"
echo -e "${GREEN}       UZHAVAN AI - AWS EC2 PRODUCTION DEPLOYMENT     ${NC}"
echo -e "${GREEN}=====================================================${NC}"

# 1. Update system packages
echo -e "\n${YELLOW}[1/7] Updating Ubuntu system packages...${NC}"
sudo apt-get update -y
sudo apt-get install -y ca-certificates curl gnupg lsb-release git ufw

# 2. Configure Swap Memory for AWS Free Tier (Crucial for 1GB RAM t2.micro/t3.micro)
echo -e "\n${YELLOW}[2/7] Checking & configuring Swap Memory (AWS Free Tier optimization)...${NC}"
TOTAL_SWAP=$(free -m | awk '/^Swap:/ {print $2}')
if [ -z "$TOTAL_SWAP" ] || [ "$TOTAL_SWAP" -lt 1500 ]; then
    echo -e "${YELLOW}Notice: Available swap is under 1.5GB. Creating 3GB swapfile to prevent OOM kills...${NC}"
    sudo swapoff -a 2>/dev/null || true
    if [ -f /swapfile ]; then
        sudo rm -f /swapfile
    fi
    sudo fallocate -l 3G /swapfile || sudo dd if=/dev/zero of=/swapfile bs=1M count=3072
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
    sudo swapon /swapfile
    if ! grep -q '/swapfile' /etc/fstab; then
        echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
    fi
    sudo sysctl vm.swappiness=10
    if ! grep -q 'vm.swappiness=10' /etc/sysctl.conf; then
        echo 'vm.swappiness=10' | sudo tee -a /etc/sysctl.conf
    fi
    echo -e "${GREEN}✅ 3GB Swap configured successfully (~4GB combined memory).${NC}"
else
    echo -e "${GREEN}✅ Sufficient swap space detected (${TOTAL_SWAP} MB).${NC}"
fi

# 3. Install Docker & Docker Compose
echo -e "\n${YELLOW}[3/7] Installing official Docker Engine & Docker Compose...${NC}"
if ! command -v docker &> /dev/null; then
    sudo install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    sudo chmod a+r /etc/apt/keyrings/docker.gpg

    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
      $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

    sudo apt-get update -y
    sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    sudo usermod -aG docker "$USER"
    sudo systemctl enable docker
    sudo systemctl start docker
    echo -e "${GREEN}✅ Docker installed successfully.${NC}"
else
    echo -e "${GREEN}✅ Docker is already installed.${NC}"
fi

# 4. Configure Firewall (UFW)
echo -e "\n${YELLOW}[4/7] Configuring firewall rules (SSH, HTTP, HTTPS)...${NC}"
sudo ufw allow 22/tcp comment 'SSH'
sudo ufw allow 80/tcp comment 'HTTP'
sudo ufw allow 443/tcp comment 'HTTPS'
sudo ufw --force enable

# 5. Check Environment File (.env)
echo -e "\n${YELLOW}[5/7] Checking production environment file (.env)...${NC}"
if [ ! -f ".env" ]; then
    if [ -f ".env.production.example" ]; then
        cp .env.production.example .env
        echo -e "${YELLOW}⚠️  Created .env from .env.production.example.${NC}"
        echo -e "${YELLOW}   Please edit .env with your Google Gemini / NVIDIA API keys!${NC}"
    else
        touch .env
    fi
else
    echo -e "${GREEN}✅ .env file found.${NC}"
fi

# 6. Build & Launch Docker Containers
echo -e "\n${YELLOW}[6/7] Building and starting Uzhavan AI containers...${NC}"
sudo docker compose down --remove-orphans || true
sudo docker compose up -d --build

# 7. Verify Health
echo -e "\n${YELLOW}[7/7] Verifying service health...${NC}"
sleep 10
sudo docker compose ps

PUBLIC_IP=$(curl -s http://checkip.amazonaws.com || curl -s https://ifconfig.me || echo "your-ec2-ip")

echo -e "\n${GREEN}=====================================================${NC}"
echo -e "${GREEN}🎉 UZHAVAN AI IS NOW RUNNING ON AWS!${NC}"
echo -e "${GREEN}=====================================================${NC}"
echo -e "Web App URL:   ${YELLOW}http://${PUBLIC_IP}${NC}"
echo -e "Backend Health: ${YELLOW}http://${PUBLIC_IP}/health${NC}"
echo -e "API Docs:      ${YELLOW}http://${PUBLIC_IP}:8000/docs${NC}"
echo -e ""
echo -e "To configure free HTTPS / SSL with your domain name, run:"
echo -e "  ${YELLOW}sudo apt-get install -y certbot python3-certbot-nginx${NC}"
echo -e "  ${YELLOW}sudo certbot --nginx -d yourdomain.com${NC}"
echo -e "${GREEN}=====================================================${NC}"

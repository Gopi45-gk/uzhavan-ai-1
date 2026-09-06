#!/bin/bash
# ==============================================================================
# Uzhavan AI - Automated Let's Encrypt SSL Setup for DuckDNS
# ==============================================================================
set -e

DOMAIN="uzhavan-ai.duckdns.org"
EMAIL="gopikaru0090@gmail.com"

echo "=========================================================="
echo "🌾 Uzhavan AI (உழவன் AI) - SSL / HTTPS Certificate Setup"
echo "=========================================================="
echo "Domain : $DOMAIN"
echo "Email  : $EMAIL"
echo ""

# Check if running as root / with sudo
if [ "$EUID" -ne 0 ]; then
  echo "⚠️  Please run this script with sudo:"
  echo "   sudo ./setup-ssl.sh"
  exit 1
fi

# Step 1: Temporarily stop the frontend container to free port 80 for Certbot
echo "[1/4] 🛑 Freeing port 80 (temporarily stopping frontend container)..."
docker compose stop frontend || true

# Step 2: Install Certbot if not already present
echo "[2/4] 📦 Checking Certbot installation..."
if ! command -v certbot &> /dev/null; then
    apt-get update -qq
    apt-get install -y -qq certbot
fi

# Step 3: Request Let's Encrypt SSL certificate
echo "[3/4] 🔐 Requesting SSL Certificate from Let's Encrypt for $DOMAIN..."
certbot certonly --standalone \
    -d "$DOMAIN" \
    --non-interactive \
    --agree-tos \
    -m "$EMAIL" \
    --preferred-challenges http

# Step 4: Restart frontend with HTTPS enabled
echo "[4/4] 🚀 Rebuilding & launching frontend with HTTPS on port 443..."
docker compose up -d --build frontend

echo ""
echo "=========================================================="
echo "✅ SUCCESS! Your site is now secured with HTTPS!"
echo ""
echo "🌐 Open on your phone & desktop:"
echo "   https://$DOMAIN"
echo ""
echo "📱 Mobile microphone, camera, and GPS are now fully enabled!"
echo "=========================================================="

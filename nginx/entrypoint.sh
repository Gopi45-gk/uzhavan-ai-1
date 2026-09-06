#!/bin/sh
set -e

CERT_PATH="/etc/letsencrypt/live/uzhavan-ai.duckdns.org/fullchain.pem"

if [ -f "$CERT_PATH" ]; then
    echo "[Entrypoint] SSL certificate found at $CERT_PATH. Enabling HTTPS on port 443..."
    cp /etc/nginx/templates/nginx-ssl.conf /etc/nginx/conf.d/default.conf
else
    echo "[Entrypoint] No SSL certificate found. Serving standard HTTP on port 80..."
    cp /etc/nginx/templates/nginx.conf /etc/nginx/conf.d/default.conf
fi

exec nginx -g "daemon off;"

# Stage 1: Build Frontend Assets
FROM node:20-alpine AS build

WORKDIR /app

# Optimize Node memory footprint for AWS Free Tier (1GB RAM)
ENV NODE_OPTIONS="--max-old-space-size=512"

# Install build dependencies
COPY package*.json ./
RUN npm ci

# Copy application source code
COPY . .

# Build production bundle
RUN npm run build

# Stage 2: Serve with Production Nginx
FROM nginx:alpine

# Remove default nginx html
RUN rm -rf /usr/share/nginx/html/*

# Copy built assets from build stage
COPY --from=build /app/dist /usr/share/nginx/html

# Copy custom Nginx configurations into templates
RUN mkdir -p /etc/nginx/templates
COPY nginx/nginx.conf /etc/nginx/templates/nginx.conf
COPY nginx/nginx-ssl.conf /etc/nginx/templates/nginx-ssl.conf
COPY nginx/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 80 443

CMD ["/entrypoint.sh"]

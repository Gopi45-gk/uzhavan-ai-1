# AWS Free Tier Deployment Guide for Uzhavan AI (உழவன் AI)

This comprehensive guide walks you through deploying **Uzhavan AI** completely **FREE ($0.00 / month)** on **Amazon Web Services (AWS)** using the AWS 12-Month Free Tier.

---

## 🎁 AWS Free Tier Entitlements Breakdown

AWS provides the following resources for free for your first 12 months:

| Service | Free Tier Allowance | Uzhavan AI Usage | Cost |
| :--- | :--- | :--- | :--- |
| **EC2 Compute** | **750 hours/month** of `t2.micro` (or `t3.micro` in eligible regions) | 1 instance running 24/7/365 (720–744 hrs/mo) | **$0.00** |
| **EBS Storage** | **30 GiB** General Purpose SSD (`gp3` or `gp2`) | 1 volume of exactly 30 GiB | **$0.00** |
| **Data Transfer** | **100 GiB/month** outbound internet transfer | Farmer web traffic & TTS audio streaming | **$0.00** |
| **Public IPv4** | **750 hours/month** in-use public IPv4 address | Attached to running EC2 instance | **$0.00** |
| **SSL / HTTPS** | Free via Let's Encrypt / Certbot | Automated SSL certificate renewal | **$0.00** |
| **Total Monthly Cost** | | | **$0.00 / mo** |

> [!IMPORTANT]
> **Memory Architecture on 1 GB RAM (`t2.micro`)**:
> `t2.micro` has 1 vCPU and 1 GiB physical RAM. Typically, running Python FastAPI, Kokoro ONNX neural speech synthesis, and building Vite inside Docker would crash with an **Out Of Memory (OOM)** error.
> **Our Solution:** Our automated setup script ([`deploy/setup-ec2.sh`](file:///home/gopikrishna/Documents/uzhavan%20ai/deploy/setup-ec2.sh)) automatically allocates **3 GiB of Swap Space** on your 30 GiB SSD and tunes kernel swappiness to 10. This gives your instance **~4 GiB of effective memory**, allowing Docker builds and neural AI audio models to run smoothly without spending a single cent!

---

## Architecture Summary

```
                  ┌────────────────────────────────────────────────────────┐
                  │              AWS EC2 Instance (t2.micro)               │
                  │              1 GB RAM + 3 GB Swap SSD                  │
                  │                                                        │
Browser (Farmer)  │    ┌──────────────────┐        ┌──────────────────┐    │
─────────────────┼───►│   Nginx Alpine   │───────►│  FastAPI Backend │    │
    HTTP / HTTPS  │:80 │  (React 18 SPA)  │:8000   │  (Kokoro ONNX)   │    │
                  │    └──────────────────┘/api/*  └──────────────────┘    │
                  └────────────────────────────────────────────────────────┘
```

- **Frontend**: React 18 + Vite SPA compiled into static assets and served by **Nginx Alpine**.
- **Backend**: **FastAPI** Python service with Kokoro ONNX neural speech synthesis running with 1 worker optimized for 1 GB RAM.
- **Reverse Proxy**: Nginx routes browser calls directly to frontend static files and proxies `/api/*` to the FastAPI backend with zero CORS friction.

---

## Step-by-Step Free Tier EC2 Deployment

### 1. Launch Free Tier EC2 Instance

1. Log into your **[AWS Management Console](https://console.aws.amazon.com/)**.
2. Make sure you select an AWS region close to your users (e.g., **Asia Pacific (Mumbai) `ap-south-1`** for India).
3. Navigate to **EC2** ➔ **Instances** ➔ **Launch Instances**.
4. Configure the instance with the following settings:
   - **Name**: `uzhavan-ai-free-tier`
   - **Application and OS Images (Amazon Machine Image)**:
     - Select **Ubuntu**.
     - Choose **Ubuntu Server 24.04 LTS (HVM), SSD Volume Type** (Make sure it has the **"Free tier eligible"** green badge).
     - Architecture: `64-bit (x86)`.
   - **Instance Type**:
     - Select **`t2.micro`** (1 vCPU, 1 GiB Memory, **"Free tier eligible"**).
     - *(Note: If `t2.micro` is not available in your region, select `t3.micro` which is also free tier eligible)*.
   - **Key pair (login)**:
     - Click **Create new key pair**.
     - Name: `uzhavan-key`.
     - Key pair type: `RSA`.
     - Private key file format: `.pem` (for OpenSSH/Linux/Mac/WSL) or `.ppk` (for PuTTY).
     - Click **Create key pair** and save the downloaded file safely.
   - **Network settings**:
     - Click **Edit**.
     - Auto-assign public IP: **Enable**.
     - Firewall (Security Groups): Choose **Create security group**.
     - Security group name: `uzhavan-ai-sg`.
     - Add 3 Inbound rules:
       1. **Type**: `SSH` | **Port**: `22` | **Source**: `My IP` (Recommended for security) or `Anywhere (0.0.0.0/0)`.
       2. **Type**: `HTTP` | **Port**: `80` | **Source**: `Anywhere (0.0.0.0/0)`.
       3. **Type**: `HTTPS` | **Port**: `443` | **Source**: `Anywhere (0.0.0.0/0)`.
   - **Configure Storage**:
     - Change the size to **`30` GiB** (AWS Free Tier provides up to 30 GiB of EBS storage for free).
     - Volume Type: `General Purpose SSD (gp3)`.
5. Review the summary panel on the right (it will explicitly state "Free tier: First 12 months include 750 hours of t2.micro or t3.micro").
6. Click **Launch Instance**.

---

### 2. Connect to Your Free Tier Instance via SSH

1. Wait 1–2 minutes until the instance state changes to **Running**.
2. Click on your instance in the EC2 console and copy its **Public IPv4 address** (e.g., `13.233.45.67`).
3. Open your terminal (Linux/macOS/Git Bash/WSL) and navigate to where you saved your `.pem` key:

```bash
# Secure the key permissions
chmod 400 uzhavan-key.pem

# SSH into your EC2 instance (replace with your actual IP)
ssh -i uzhavan-key.pem ubuntu@YOUR_EC2_PUBLIC_IP
```

---

### 3. Clone Repository & Run Automated Setup

Once connected to your EC2 instance terminal, run these commands:

```bash
# Clone the repository
git clone https://github.com/Gopi45-gk/uzhavan-ai-1.git uzhavan-ai
cd uzhavan-ai

# Make setup script executable and run
chmod +x deploy/setup-ec2.sh
./deploy/setup-ec2.sh
```

#### What `setup-ec2.sh` automatically performs:
1. Updates system packages.
2. **Provisions 3 GiB of Swap Space** on your 30 GiB SSD (Prevents memory exhaustion on `t2.micro`).
3. Installs official Docker Engine and Docker Compose V2.
4. Configures Ubuntu UFW firewall (Ports 22, 80, 443).
5. Copies `.env.production.example` to `.env`.
6. Builds the lightweight frontend (Node 20 Alpine) and backend (FastAPI 1-worker) containers.
7. Starts the containers with `restart: unless-stopped`.

---

### 4. Configure Your Free API Keys

Edit your `.env` configuration file:

```bash
nano .env
```

Set your API keys (Gemini and Groq have generous 100% free tiers):

```env
# Google Gemini API Key (100% Free Tier available at aistudio.google.com)
VITE_GEMINI_API_KEY=AIzaSy...

# Groq API Key (100% Free Tier with ultra-fast Llama 3.3 at console.groq.com)
VITE_GROQ_API_KEY=gsk_...

# NVIDIA NIM API Key (Free credits at build.nvidia.com)
VITE_NVIDIA_API_KEY=nvapi-...
```

Save and exit:
- Press `Ctrl + O`, then hit `Enter`.
- Press `Ctrl + X` to exit.

Restart your containers to apply the keys:

```bash
sudo docker compose up -d
```

---

### 5. Access Your Web App!

Open your browser and visit:
```text
http://YOUR_EC2_PUBLIC_IP
```

- **Frontend Application**: `http://YOUR_EC2_PUBLIC_IP`
- **Backend Health Check**: `http://YOUR_EC2_PUBLIC_IP/health`
- **Interactive Swagger API Docs**: `http://YOUR_EC2_PUBLIC_IP:8000/docs`

---

### 6. Set Up Free Custom Domain & Free SSL (HTTPS)

Browsers require HTTPS for Web Speech API and Microphone audio capture. You can get free HTTPS with Let's Encrypt:

1. **Get a Domain or Free Dynamic DNS**:
   - You can use any custom domain (Namecheap, Cloudflare, GoDaddy) or a free DDNS provider like [DuckDNS](https://www.duckdns.org/) (e.g. `uzhavan.duckdns.org`).
2. **Point DNS to EC2**:
   - Add an **A Record** pointing your domain to your EC2 **Public IPv4 address**.
3. **Run Certbot on the EC2 server**:
   ```bash
   sudo apt-get update
   sudo apt-get install -y certbot python3-certbot-nginx
   sudo certbot --nginx -d yourdomain.com
   ```
4. Certbot will automatically issue an SSL certificate and configure Nginx for HTTPS. Certificates auto-renew for free!

---

## 🛡️ 5 Golden Rules to Guarantee a $0.00 AWS Bill

To ensure you are never billed unexpectedly, follow these best practices:

1. **Keep exactly 1 EC2 instance running**:
   - Free Tier gives 750 hours/month of `t2.micro` or `t3.micro`. One instance running continuously 24/7 uses 744 hours in a 31-day month, staying strictly within the 750-hour free quota.
2. **Do not exceed 30 GiB of EBS storage**:
   - AWS charges for EBS storage above 30 GiB. Keep your instance volume at 30 GiB or less.
3. **Avoid holding unattached Elastic IPs**:
   - AWS charges $0.005/hour for Elastic IPs that are allocated but NOT attached to a running instance. Stick with the default Public IPv4 assigned to your EC2 instance.
4. **Clean up old Docker images occasionally**:
   - After updating code, clean unused Docker layers to save SSD space:
     ```bash
     sudo docker image prune -f
     ```
5. **Set an AWS Zero-Spend Budget Alert ($0.01 threshold)**:
   - In AWS Console, search for **AWS Budgets** ➔ **Create budget** ➔ **Zero spend budget**.
   - Enter your email. AWS will instantly email you if your account ever incurs even $0.01!

---

## Maintenance & Everyday Commands

### View Service Logs
```bash
# View all logs live
sudo docker compose logs -f

# View backend logs only
sudo docker compose logs -f backend
```

### Pull Updates & Redeploy
```bash
cd ~/uzhavan-ai
git pull origin main
sudo docker compose up -d --build
```

### Check Memory & Swap Status
```bash
free -h
```
You will see ~1.0 GiB of RAM and 3.0 GiB of Swap, ensuring Uzhavan AI operates reliably 24/7 on AWS Free Tier.

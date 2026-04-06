# Deployment Runbook (EC2)

This project is built to run locally by default. This document records a known-good EC2 deployment path for operational hosting.

## Deployment target snapshot

- Domain: `a2.emss-mess.org`
- Host: Amazon EC2 (Amazon Linux 2023, x86_64)
- Recommended instance baseline: `t3a.medium`
- Repository: `https://github.com/dmackenzie1/Artemis2-Dashboard.git`
- Repository path on host: `~/Artemis2-Dashboard`

## Local-first policy

- Local development and validation remain the primary/default workflow.
- EC2 deployment is an operations run target and should follow this runbook.

## Host bootstrap script (AL2023)

Run as `root` (or via `sudo bash setup.sh`) on a fresh Amazon Linux 2023 host.

```bash
#!/usr/bin/env bash
set -euo pipefail

APP_USER="${APP_USER:-ec2-user}"
NODE_MAJOR="${NODE_MAJOR:-20}"
CREATE_SWAP_MB="${CREATE_SWAP_MB:-2048}"

echo "==> Updating system packages..."
dnf update -y

echo "==> Installing base packages..."
dnf install -y \
  docker \
  git \
  curl \
  wget \
  jq \
  unzip \
  tar \
  ca-certificates \
  shadow-utils \
  util-linux

echo "==> Installing Docker Compose plugin (if available via dnf)..."
dnf install -y docker-compose-plugin || true

if ! docker compose version >/dev/null 2>&1; then
  echo "==> docker compose plugin not found via dnf; installing standalone docker-compose fallback..."
  COMPOSE_VERSION="2.27.1"
  curl -fsSL "https://github.com/docker/compose/releases/download/v${COMPOSE_VERSION}/docker-compose-linux-x86_64" \
    -o /usr/local/bin/docker-compose
  chmod +x /usr/local/bin/docker-compose
fi

echo "==> Enabling and starting Docker..."
systemctl enable docker
systemctl start docker

echo "==> Adding ${APP_USER} to docker group..."
if id -u "${APP_USER}" >/dev/null 2>&1; then
  usermod -aG docker "${APP_USER}"
else
  echo "WARN: user ${APP_USER} not found; skipping docker group assignment."
fi

echo "==> Installing Node.js ${NODE_MAJOR} + npm..."
if dnf list "nodejs${NODE_MAJOR}" >/dev/null 2>&1; then
  dnf install -y "nodejs${NODE_MAJOR}"
else
  dnf install -y nodejs npm
fi

if ! command -v npm >/dev/null 2>&1; then
  dnf install -y npm
fi

echo "==> Optional: Creating swap (${CREATE_SWAP_MB} MB) if requested and no swap exists..."
if [ "${CREATE_SWAP_MB}" -gt 0 ]; then
  if swapon --show | grep -q '^'; then
    echo "Swap already exists; skipping."
  else
    fallocate -l "${CREATE_SWAP_MB}M" /swapfile || dd if=/dev/zero of=/swapfile bs=1M count="${CREATE_SWAP_MB}"
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    grep -q '^/swapfile ' /etc/fstab || echo '/swapfile swap swap defaults 0 0' >> /etc/fstab
  fi
fi

echo "==> Installing CloudWatch Agent (optional but recommended)..."
dnf install -y amazon-cloudwatch-agent || true

echo "==> Versions:"
docker --version || true
if docker compose version >/dev/null 2>&1; then
  docker compose version
elif command -v docker-compose >/dev/null 2>&1; then
  docker-compose --version
fi
git --version || true
node --version || true
npm --version || true

echo
echo "Setup complete."
echo "IMPORTANT: Log out and back in (or run 'newgrp docker') for ${APP_USER} docker-group changes to apply."
```

## Application deployment steps

### 1) Clone and prepare runtime directories

```bash
git clone https://github.com/dmackenzie1/Artemis2-Dashboard.git
cd Artemis2-Dashboard
mkdir -p source_files .local/query-set .local/query-receive
```

### 2) Create `.env` in repo root

```dotenv
PORT=4000
CORS_ORIGIN=http://a2.emss-mess.org

DATA_DIR=/app/source_files
PROMPTS_DIR=/app/prompts
CACHE_FILE=/app/data/cache.json
SOURCE_FILES_DIR=/app/source_files
PROMPT_SUBMISSIONS_DIR=/app/data/prompt-submissions
LLM_DEBUG_PROMPTS_DIR=/app/.local

ANTHROPIC_BASE_URL=
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=opusplan
LLM_MAX_TOKENS=12000

TRANSCRIPTS_DB_ENABLED=true
DB_HOST=db
DB_PORT=5432
DB_USER=artemis
DB_PASS=change_this_password
DB_NAME=artemis_transcripts

PIPELINE_INTERVAL_HOURS=6
PIPELINE_AUTO_RUN=true
```

### 3) Start services

Prefer plugin syntax when available, otherwise fallback to standalone `docker-compose`.

```bash
docker compose up -d --build || docker-compose up -d --build
docker compose ps || docker-compose ps
docker compose logs -f server || docker-compose logs -f server
```

### 4) Basic health check

```bash
curl -sS http://localhost:8080/api/health
```

## DNS and networking checklist

- Point `a2.emss-mess.org` `A` record to the host IP / Elastic IP.
- Security Group inbound rules:
  - `22/tcp` (SSH)
  - `80/tcp` (HTTP)
  - `443/tcp` (HTTPS, if TLS enabled)
  - `8080/tcp` only if you keep current compose mapping as-is.
- Add TLS termination (Caddy or Nginx+Certbot) before production use.

## Operational notes

- Keep API keys/secrets in `.env` on host; do not commit them to git.
- Back up Postgres data volume (`db_data`) regularly.
- Monitor host CPU credits, memory, disk, and container health.

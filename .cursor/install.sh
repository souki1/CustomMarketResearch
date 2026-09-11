#!/usr/bin/env bash
# Idempotent Cloud Agent install script.
# Installs system services (PostgreSQL 16 + MongoDB 8.0) and project dependencies
# (backend Python venv + frontend node_modules). Safe to run repeatedly.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export DEBIAN_FRONTEND=noninteractive

echo "==> Installing system packages (PostgreSQL, build tools)"
if ! command -v psql >/dev/null 2>&1; then
  sudo apt-get update -qq
  sudo apt-get install -y -qq \
    postgresql postgresql-contrib \
    python3-venv python3-dev build-essential libpq-dev \
    gnupg curl ca-certificates
fi

echo "==> Installing MongoDB 8.0"
if ! command -v mongod >/dev/null 2>&1; then
  curl -fsSL https://www.mongodb.org/static/pgp/server-8.0.asc \
    | sudo gpg -o /usr/share/keyrings/mongodb-server-8.0.gpg --dearmor --yes
  echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-8.0.gpg ] https://repo.mongodb.org/apt/ubuntu noble/mongodb-org/8.0 multiverse" \
    | sudo tee /etc/apt/sources.list.d/mongodb-org-8.0.list >/dev/null
  sudo apt-get update -qq
  sudo apt-get install -y -qq mongodb-org
fi

echo "==> Backend: Python virtualenv + dependencies"
cd "$REPO_ROOT/backend"
if [ ! -d .venv ]; then
  python3 -m venv .venv
fi
# shellcheck disable=SC1091
. .venv/bin/activate
pip install --quiet --upgrade pip
pip install --quiet -r requirements.txt
deactivate

echo "==> Backend: local dev env file"
if [ ! -f "$REPO_ROOT/backend/.env.development" ]; then
  cat > "$REPO_ROOT/backend/.env.development" <<'EOF'
# Local Cloud Agent dev configuration (gitignored). No production secrets here.
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/inteligentresearch
SECRET_KEY=dev-secret-change-me
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=10080
FRONTEND_URL=http://localhost:5173
DEV_RETURN_OTP=true
MONGO_URL=mongodb://localhost:27017
MONGO_DB_NAME=inteligentresearch
GROQ_MODEL=openai/gpt-oss-120b
# Optional external keys (only needed for research web-search, Firecrawl
# scraping, and in-app AI features). Leave blank for local dev.
GROQ_API_KEY=
SERPER_API_KEY=
FIRECRAWL_API_KEY=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
EOF
fi

echo "==> Frontend: node_modules"
cd "$REPO_ROOT/frontend"
npm ci

echo "==> Install complete"

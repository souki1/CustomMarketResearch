#!/usr/bin/env bash
# Per-boot service reconciliation for the Cloud Agent environment.
# Starts PostgreSQL and MongoDB and ensures the application database exists.
# Idempotent: safe to run on every boot; tolerates already-running services.
set -euo pipefail

echo "==> Starting PostgreSQL"
sudo service postgresql start 2>/dev/null || sudo pg_ctlcluster 16 main start 2>/dev/null || true

echo "==> Waiting for PostgreSQL to accept connections"
for _ in $(seq 1 30); do
  if sudo -u postgres pg_isready -q; then break; fi
  sleep 1
done

echo "==> Ensuring postgres role password and application database"
sudo -u postgres psql -tAc "ALTER USER postgres WITH PASSWORD 'postgres';" >/dev/null 2>&1 || true
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='inteligentresearch'" | grep -q 1; then
  sudo -u postgres createdb inteligentresearch
fi

echo "==> Starting MongoDB"
sudo mkdir -p /var/lib/mongodb /var/log/mongodb
sudo chown -R mongodb:mongodb /var/lib/mongodb /var/log/mongodb
if ! pgrep -x mongod >/dev/null 2>&1; then
  sudo -u mongodb mongod \
    --dbpath /var/lib/mongodb \
    --logpath /var/log/mongodb/mongod.log \
    --bind_ip 127.0.0.1 \
    --fork
fi

echo "==> Waiting for MongoDB to accept connections"
for _ in $(seq 1 30); do
  if mongosh --quiet --eval 'db.runCommand({ ping: 1 }).ok' >/dev/null 2>&1; then break; fi
  sleep 1
done

echo "==> Services ready"

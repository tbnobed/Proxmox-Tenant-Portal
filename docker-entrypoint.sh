#!/bin/sh
set -e

echo "ProxHub — Starting up..."

echo "Pushing database schema..."
cd /app/lib/db
npx --yes drizzle-kit push --force --config ./drizzle.config.ts 2>&1
cd /app

echo "Starting ProxHub server..."
exec node --enable-source-maps artifacts/api-server/dist/index.mjs

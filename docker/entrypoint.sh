#!/bin/sh
set -e

echo "Waiting for Postgres..."
until node -e "
  const { Client } = require('pg');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  client.connect()
    .then(() => client.end())
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
" >/dev/null 2>&1; do
  sleep 1
done

echo "Running database migrations..."
npm run migrate

echo "Starting Hashtag Tracker (API + queue worker + node-cron scheduler)..."
exec node dist/index.js

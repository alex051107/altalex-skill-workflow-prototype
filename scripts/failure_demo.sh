#!/bin/sh
# Start a second copy on port 8766 with an invalid key, to show a real model failure (HTTP 401) during a demo.
# It uses its own temporary database and never touches the main one.
cd "$(dirname "$0")/.." || exit 1
TMP_DB="$(mktemp -d)/failure.sqlite3"
APP_PORT=8766 DATABASE_PATH="$TMP_DB" MODEL_PROVIDER=openai OPENAI_BASE_URL=https://api.deepseek.com/v1 \
  MODEL_NAME=deepseek-flash OPENAI_API_KEY=sk-invalid-demo-key python3 -I server.py

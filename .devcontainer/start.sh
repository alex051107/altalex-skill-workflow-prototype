#!/usr/bin/env bash
# Starts the prototype inside a GitHub Codespace.
# First start copies a seed database with the three example workflows and finished AI runs.
# With an OPENAI_API_KEY Codespaces secret it calls DeepSeek; without one it runs in demo mode.
set -e
cd "$(dirname "$0")/.."
mkdir -p data
[ -f data/clausecraft.sqlite3 ] || cp .devcontainer/seed.db data/clausecraft.sqlite3
if [ -n "${OPENAI_API_KEY:-}" ]; then
  export MODEL_PROVIDER=openai OPENAI_BASE_URL="${OPENAI_BASE_URL:-https://api.deepseek.com/v1}" MODEL_NAME="${MODEL_NAME:-deepseek-flash}"
else
  export MODEL_PROVIDER=mock
fi
pkill -f "python3 server.py" 2>/dev/null || true
nohup python3 server.py > /tmp/altalex-server.log 2>&1 &
for i in $(seq 1 30); do curl -s -o /dev/null http://127.0.0.1:8765/ && break; sleep 1; done
echo "AltaLex prototype is running on port 8765 (mode: $MODEL_PROVIDER)."

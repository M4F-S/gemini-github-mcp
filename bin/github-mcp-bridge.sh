#!/bin/zsh
set -e

# Resolve script directory and root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Load .env if present
if [ -f "$ROOT_DIR/.env" ]; then
  # shellcheck disable=SC1091
  source "$ROOT_DIR/.env"
elif [ -f "$HOME/.gemini/github_mcp.env" ]; then
  source "$HOME/.gemini/github_mcp.env"
fi

# Ensure GitHub Personal Access Token is available
if [ -z "$GITHUB_PERSONAL_ACCESS_TOKEN" ]; then
  echo "Error: GITHUB_PERSONAL_ACCESS_TOKEN is not set." >&2
  echo "Please set it in $ROOT_DIR/.env or export it in your environment." >&2
  exit 1
fi

export GITHUB_PERSONAL_ACCESS_TOKEN

# Resolve NVM / Node / NPX environment
if [ -d "$HOME/.nvm" ]; then
  export NVM_DIR="$HOME/.nvm"
  # shellcheck disable=SC1091
  [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
fi

# Fallback paths for GUI environments launched without shell PATH
export PATH="$HOME/.nvm/versions/node/v22.18.0/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

NPX_BIN="${NPX_PATH:-$(which npx 2>/dev/null || echo "$HOME/.nvm/versions/node/v22.18.0/bin/npx")}"
NODE_BIN="${NODE_PATH:-$(which node 2>/dev/null || echo "$HOME/.nvm/versions/node/v22.18.0/bin/node")}"

if [ ! -x "$NPX_BIN" ]; then
  echo "Error: npx binary not found or not executable at: $NPX_BIN" >&2
  exit 1
fi

PORT="${MCP_PORT:-8124}"
HOST="${MCP_HOST:-127.0.0.1}"
TRANSPORT="${MCP_TRANSPORT:-streamableHttp}"
MCP_ROUTE="${MCP_PATH:-/mcp}"

SERVER_SCRIPT="$ROOT_DIR/src/server.mjs"

echo "=========================================================="
echo " Starting Gemini GitHub MCP Streamable HTTP Bridge (v1.1.0)"
echo " Host:      $HOST:$PORT"
echo " Transport: $TRANSPORT ($MCP_ROUTE)"
echo " Server:    $SERVER_SCRIPT"
echo " Node:      $NODE_BIN"
echo " Protocol:  2024-11-05 / 2025-11-25"
echo "=========================================================="

exec "$NPX_BIN" -y supergateway \
  --port "$PORT" \
  --host "$HOST" \
  --cors \
  --outputTransport "$TRANSPORT" \
  --streamableHttpPath "$MCP_ROUTE" \
  --protocolVersion "2024-11-05" \
  --stdio "$NODE_BIN $SERVER_SCRIPT"

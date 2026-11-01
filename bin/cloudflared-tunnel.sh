#!/bin/zsh
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

if [ -f "$ROOT_DIR/.env" ]; then
  # shellcheck disable=SC1091
  source "$ROOT_DIR/.env"
elif [ -f "$HOME/.gemini/github_mcp.env" ]; then
  source "$HOME/.gemini/github_mcp.env"
fi

CLOUDFLARED_BIN="$(which cloudflared 2>/dev/null || echo "/opt/homebrew/bin/cloudflared")"

if [ ! -x "$CLOUDFLARED_BIN" ]; then
  echo "Error: cloudflared binary not found at $CLOUDFLARED_BIN" >&2
  echo "Install it via: brew install cloudflared" >&2
  exit 1
fi

PORT="${MCP_PORT:-8124}"
TARGET_URL="http://127.0.0.1:$PORT"

echo "=========================================================="
echo " Starting Cloudflare Tunnel for GitHub MCP Bridge"
echo " Target: $TARGET_URL"
echo " Binary: $CLOUDFLARED_BIN"
echo "=========================================================="

if [ -n "$CLOUDFLARE_TUNNEL_TOKEN" ]; then
  echo "Using Cloudflare Zero Trust Named Tunnel Token..."
  exec "$CLOUDFLARED_BIN" tunnel run --token "$CLOUDFLARE_TUNNEL_TOKEN"
else
  echo "Starting Cloudflare Quick Tunnel (public trycloudflare.com endpoint)..."
  exec "$CLOUDFLARED_BIN" tunnel --url "$TARGET_URL"
fi

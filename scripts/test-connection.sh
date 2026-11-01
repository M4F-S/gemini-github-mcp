#!/bin/zsh
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

if [ -f "$ROOT_DIR/.env" ]; then
  # shellcheck disable=SC1091
  source "$ROOT_DIR/.env"
fi

ENDPOINT="${1:-http://127.0.0.1:8124/mcp}"

echo "=========================================================="
echo " Testing GitHub MCP Bridge Endpoint"
echo " Target URL: $ENDPOINT"
echo "=========================================================="

echo "\n1. Sending JSON-RPC initialize..."
INIT_RES=$(curl -s -X POST "$ENDPOINT" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test-suite","version":"1.0"}}}')

echo "$INIT_RES" | head -n 10

if echo "$INIT_RES" | grep -q "github-mcp-server"; then
  echo "✔ Initialize Handshake Passed (github-mcp-server responded)"
else
  echo "✖ Initialize Failed" >&2
  exit 1
fi

echo "\n2. Testing tools/call for search_repositories..."
CALL_RES=$(curl -s -X POST "$ENDPOINT" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"search_repositories","arguments":{"query":"user:M4F-S is:private"}}}')

if echo "$CALL_RES" | grep -q "total_count"; then
  COUNT=$(echo "$CALL_RES" | grep -o 'total_count[^,}]*' | head -n 1)
  echo "✔ search_repositories Tool Call Succeeded ($COUNT)"
else
  echo "✖ Tool Call Failed" >&2
  echo "$CALL_RES"
  exit 1
fi

echo "\n=========================================================="
echo " All MCP Endpoint Tests Passed Successfully!"
echo "=========================================================="

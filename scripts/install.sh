#!/bin/zsh
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "=========================================================="
echo " Gemini for Mac - GitHub MCP Bridge Installer"
echo "=========================================================="

# Check for Homebrew
if ! command -v brew >/dev/null 2>&1; then
  echo "Homebrew is recommended to install cloudflared."
fi

# Check cloudflared
if ! command -v cloudflared >/dev/null 2>&1; then
  echo "Installing cloudflared via brew..."
  brew install cloudflared
else
  echo "✔ cloudflared is installed ($(cloudflared --version | head -n 1))"
fi

# Check Node / npm
if ! command -v node >/dev/null 2>&1; then
  echo "Error: Node.js is required. Please install Node.js >= 20." >&2
  exit 1
else
  echo "✔ Node.js is installed ($(node -v))"
fi

# Setup .env if missing
if [ ! -f "$ROOT_DIR/.env" ]; then
  echo "Creating .env from template..."
  cp "$ROOT_DIR/config/.env.example" "$ROOT_DIR/.env"
  echo "Please edit $ROOT_DIR/.env with your GitHub Personal Access Token."
fi

# Make binaries executable
chmod +x "$ROOT_DIR"/bin/*.sh
chmod +x "$ROOT_DIR"/scripts/*.sh

echo "\n✔ Setup complete!"
echo "To start the bridge and tunnel:"
echo "  $ROOT_DIR/bin/service.sh start"
echo "To check status and retrieve your public tunnel URL:"
echo "  $ROOT_DIR/bin/service.sh status"

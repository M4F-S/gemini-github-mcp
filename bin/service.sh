#!/bin/zsh
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

PID_DIR="$ROOT_DIR/tmp"
LOG_DIR="$ROOT_DIR/logs"
mkdir -p "$PID_DIR" "$LOG_DIR"

BRIDGE_PID_FILE="$PID_DIR/bridge.pid"
TUNNEL_PID_FILE="$PID_DIR/tunnel.pid"

BRIDGE_LOG="$LOG_DIR/bridge.log"
TUNNEL_LOG="$LOG_DIR/tunnel.log"

start() {
  echo "Checking existing processes..."
  if [ -f "$BRIDGE_PID_FILE" ] && kill -0 "$(cat "$BRIDGE_PID_FILE")" 2>/dev/null; then
    echo "Bridge is already running (PID: $(cat "$BRIDGE_PID_FILE"))."
  else
    echo "Starting GitHub MCP Bridge..."
    nohup "$ROOT_DIR/bin/github-mcp-bridge.sh" > "$BRIDGE_LOG" 2>&1 &
    echo $! > "$BRIDGE_PID_FILE"
    echo "Bridge started (PID: $!)."
  fi

  sleep 1

  if [ -f "$TUNNEL_PID_FILE" ] && kill -0 "$(cat "$TUNNEL_PID_FILE")" 2>/dev/null; then
    echo "Tunnel is already running (PID: $(cat "$TUNNEL_PID_FILE"))."
  else
    echo "Starting Cloudflare Tunnel..."
    nohup "$ROOT_DIR/bin/cloudflared-tunnel.sh" > "$TUNNEL_LOG" 2>&1 &
    echo $! > "$TUNNEL_PID_FILE"
    echo "Tunnel started (PID: $!)."
  fi

  echo "Waiting for tunnel initialization..."
  sleep 4
  echo "Tunnel log snippet:"
  grep -E "trycloudflare\.com|INF Registered tunnel" "$TUNNEL_LOG" | tail -n 5 || true
}

stop() {
  echo "Stopping services..."
  if [ -f "$BRIDGE_PID_FILE" ]; then
    PID="$(cat "$BRIDGE_PID_FILE")"
    if kill -0 "$PID" 2>/dev/null; then
      kill "$PID" 2>/dev/null || true
      echo "Stopped Bridge (PID: $PID)."
    fi
    rm -f "$BRIDGE_PID_FILE"
  fi

  if [ -f "$TUNNEL_PID_FILE" ]; then
    PID="$(cat "$TUNNEL_PID_FILE")"
    if kill -0 "$PID" 2>/dev/null; then
      kill "$PID" 2>/dev/null || true
      echo "Stopped Tunnel (PID: $PID)."
    fi
    rm -f "$TUNNEL_PID_FILE"
  fi
}

status() {
  echo "=========================================================="
  echo " GitHub MCP Bridge & Tunnel Status"
  echo "=========================================================="
  if [ -f "$BRIDGE_PID_FILE" ] && kill -0 "$(cat "$BRIDGE_PID_FILE")" 2>/dev/null; then
    echo "Bridge: RUNNING (PID: $(cat "$BRIDGE_PID_FILE"))"
  else
    echo "Bridge: STOPPED"
  fi

  if [ -f "$TUNNEL_PID_FILE" ] && kill -0 "$(cat "$TUNNEL_PID_FILE")" 2>/dev/null; then
    echo "Tunnel: RUNNING (PID: $(cat "$TUNNEL_PID_FILE"))"
    echo "Active Tunnel URL:"
    grep -o "https://[a-zA-Z0-9.-]*\.trycloudflare\.com" "$TUNNEL_LOG" | tail -n 1 || echo "(custom domain / check tunnel.log)"
  else
    echo "Tunnel: STOPPED"
  fi
}

case "$1" in
  start)
    start
    ;;
  stop)
    stop
    ;;
  restart)
    stop
    sleep 1
    start
    ;;
  status)
    status
    ;;
  logs)
    tail -f "$BRIDGE_LOG" "$TUNNEL_LOG"
    ;;
  *)
    echo "Usage: $0 {start|stop|restart|status|logs}"
    exit 1
    ;;
esac

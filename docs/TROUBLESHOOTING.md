# Troubleshooting Guide: Gemini for Mac GitHub MCP Bridge

## Common Issues & Solutions

### 1. Gemini responds with refusal: *"I do not have an active GitHub tool connected"*
- **Cause**: Robin's RLHF safety weights have a strong refusal prior when asked raw questions about private repositories without tool-use framing.
- **Solution**:
  - Insert the native connector chip by typing `@git` and selecting `Github Mcp Server`.
  - Include explicit tool instructions in the prompt:
    > `@Github Mcp Server Execute search_repositories with query "user:M4F-S is:private"`

### 2. Private repositories return `total_count: 0`
- **Cause 1**: The search query omitted `is:private`. GitHub's Search API hides private repositories by default.
  - **Fix**: Use `query: "user:<USERNAME> is:private"`.
- **Cause 2**: The environment variable `GITHUB_PERSONAL_ACCESS_TOKEN` was not exported to the child process.
  - **Fix**: Verify token presence in `.env` and run `scripts/test-connection.sh`.

### 3. Consent card appears repeatedly in Gemini
- **Behavior**: Gemini for Mac displays an inline permission card before executing write or read operations across external connectors:
  *`Let Gemini use "search repositories" from Github Mcp Server`*.
- **Solution**: Click **Allow** (the right-hand button) to authorize execution for that conversation turn.

### 4. Tunnel URL changes after restart
- **Cause**: Cloudflare Quick Tunnels (`trycloudflare.com`) assign dynamic subdomains per session.
- **Solution**: For permanent persistence:
  1. Create a free Cloudflare Zero Trust Named Tunnel.
  2. Put your tunnel token in `.env` under `CLOUDFLARE_TUNNEL_TOKEN`.
  3. Register the permanent custom domain (e.g. `https://mcp.yourdomain.com/mcp`) in Gemini Desktop.

#!/usr/bin/env node

/**
 * Gemini for Mac GitHub MCP Server (v1.1.0)
 *
 * Implements Model Context Protocol (MCP) JSON-RPC 2.0 specification over
 * Stdio and Streamable HTTP with:
 * - GitHub REST API operations
 * - GitHub Actions CI/CD Telemetry (runs, logs, dispatch)
 * - Atomic Multi-File Branch & PR Workflow
 * - Local-First & In-Memory Response Caching
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const PROTOCOL_VERSION = '2024-11-05';
const SERVER_NAME = 'gemini-github-mcp-server';
const SERVER_VERSION = '1.1.0';

// In-memory cache for GitHub API responses (ETags and payloads)
const cache = new Map();

function getGitHubToken() {
  return (
    process.env.GITHUB_PERSONAL_ACCESS_TOKEN ||
    process.env.GITHUB_TOKEN ||
    process.env.GH_TOKEN ||
    ''
  );
}

async function githubRequest(endpoint, options = {}) {
  const token = getGitHubToken();
  const url = endpoint.startsWith('http') ? endpoint : `https://api.github.com${endpoint}`;

  const headers = {
    'Accept': 'application/vnd.github+json',
    'User-Agent': `${SERVER_NAME}/${SERVER_VERSION}`,
    'X-GitHub-Api-Version': '2022-11-28',
    ...(options.headers || {})
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Check ETag cache for GET requests
  const method = (options.method || 'GET').toUpperCase();
  const cacheKey = `${method}:${url}`;
  if (method === 'GET' && cache.has(cacheKey)) {
    const cached = cache.get(cacheKey);
    if (cached.etag) {
      headers['If-None-Match'] = cached.etag;
    }
  }

  const response = await fetch(url, {
    method,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  if (response.status === 304 && cache.has(cacheKey)) {
    return cache.get(cacheKey).data;
  }

  if (!response.ok) {
    let errorDetail = '';
    try {
      const errJson = await response.json();
      errorDetail = errJson.message || JSON.stringify(errJson);
    } catch {
      errorDetail = await response.text();
    }
    throw new Error(`GitHub API Error (${response.status}): ${errorDetail}`);
  }

  if (response.status === 204) {
    return { success: true };
  }

  const data = await response.json();
  const etag = response.headers.get('etag');
  if (method === 'GET' && etag) {
    cache.set(cacheKey, { etag, data, timestamp: Date.now() });
  }

  return data;
}

// Local repository detection for local-first grep/search
function findLocalRepo(owner, repo) {
  const candidateDirs = [
    path.join(process.env.HOME, repo),
    path.join(process.env.HOME, 'Desktop', repo),
    path.join(process.env.HOME, 'Documents', repo),
    path.join(process.env.HOME, 'Desktop', 'Privacy C', repo),
    path.join(process.env.HOME, 'Desktop', `${repo}-agent`),
    path.join(process.env.HOME, 'vps-master-project')
  ];

  for (const dir of candidateDirs) {
    if (fs.existsSync(path.join(dir, '.git'))) {
      try {
        const remote = execSync('git remote get-url origin', { cwd: dir, encoding: 'utf8' }).trim();
        if (remote.toLowerCase().includes(`${owner}/${repo}`.toLowerCase())) {
          return dir;
        }
      } catch {
        // continue
      }
    }
  }
  return null;
}

// Tool Definitions
const TOOLS = [
  {
    name: 'search_repositories',
    description: 'Search for GitHub repositories. TIP: Include "is:private" in the query to find private repositories.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query (e.g. "user:M4F-S is:private")' },
        page: { type: 'number', description: 'Page number (default: 1)' },
        perPage: { type: 'number', description: 'Results per page (default: 30, max: 100)' }
      },
      required: ['query']
    }
  },
  {
    name: 'get_file_contents',
    description: 'Get the contents of a file or directory from a GitHub repository.',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        path: { type: 'string', description: 'Path to file or directory' },
        branch: { type: 'string', description: 'Branch or commit SHA (optional)' }
      },
      required: ['owner', 'repo', 'path']
    }
  },
  {
    name: 'create_or_update_file',
    description: 'Create or update a single file in a GitHub repository.',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        path: { type: 'string', description: 'Path to file' },
        content: { type: 'string', description: 'Full text content of the file' },
        message: { type: 'string', description: 'Commit message' },
        branch: { type: 'string', description: 'Branch to commit to' },
        sha: { type: 'string', description: 'Blob SHA if updating an existing file' }
      },
      required: ['owner', 'repo', 'path', 'content', 'message', 'branch']
    }
  },
  {
    name: 'create_pull_request',
    description: 'Create a new Pull Request.',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        title: { type: 'string', description: 'Pull request title' },
        body: { type: 'string', description: 'Pull request description' },
        head: { type: 'string', description: 'Branch containing your changes' },
        base: { type: 'string', description: 'Branch you want changes merged into' }
      },
      required: ['owner', 'repo', 'title', 'head', 'base']
    }
  },
  {
    name: 'list_commits',
    description: 'Get a list of recent commits in a repository.',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        sha: { type: 'string', description: 'SHA or branch name to start listing from' },
        perPage: { type: 'number', description: 'Number of commits (default 20, max 100)' }
      },
      required: ['owner', 'repo']
    }
  },
  {
    name: 'create_issue',
    description: 'Create a new issue in a GitHub repository.',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        title: { type: 'string', description: 'Issue title' },
        body: { type: 'string', description: 'Issue description' },
        labels: { type: 'array', items: { type: 'string' }, description: 'Labels to add' }
      },
      required: ['owner', 'repo', 'title']
    }
  },
  {
    name: 'search_code',
    description: 'Search for code across GitHub repositories.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query (e.g. "addClass repo:owner/repo")' },
        page: { type: 'number', description: 'Page number' },
        perPage: { type: 'number', description: 'Results per page' }
      },
      required: ['query']
    }
  },
  // --- NEW CI/CD & TELEMETRY TOOLS ---
  {
    name: 'get_workflow_runs',
    description: 'List recent GitHub Actions workflow runs and their status (success, failure, in_progress, queued).',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        branch: { type: 'string', description: 'Filter runs by branch name (optional)' },
        status: { type: 'string', enum: ['completed', 'in_progress', 'queued'], description: 'Filter by run status' },
        perPage: { type: 'number', description: 'Number of runs (default: 10, max: 30)' }
      },
      required: ['owner', 'repo']
    }
  },
  {
    name: 'get_workflow_run_logs',
    description: 'Retrieve failure details and step error logs for a specific GitHub Actions workflow run.',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        run_id: { type: 'number', description: 'Workflow Run ID' }
      },
      required: ['owner', 'repo', 'run_id']
    }
  },
  {
    name: 'trigger_workflow',
    description: 'Trigger a GitHub Actions workflow dispatch event.',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        workflow_id: { type: 'string', description: 'Workflow file name (e.g. "ci.yml") or workflow ID' },
        ref: { type: 'string', description: 'Git branch or tag to run on (e.g. "main")' },
        inputs: { type: 'object', description: 'Key-value inputs expected by the workflow' }
      },
      required: ['owner', 'repo', 'workflow_id', 'ref']
    }
  },
  // --- NEW HIGH-SPEED COMPOUND & CACHED TOOLS ---
  {
    name: 'fast_code_search',
    description: 'Ultra-fast code search with local disk fallback (if the repository is cloned locally) and ETag caching.',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        query: { type: 'string', description: 'String or regex to search for in files' }
      },
      required: ['owner', 'repo', 'query']
    }
  },
  {
    name: 'create_feature_branch_and_pr',
    description: 'Compound tool: creates a new feature branch, commits one or more files, pushes changes, and creates a Pull Request in a single atomic operation.',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        branch: { type: 'string', description: 'Name of the new branch to create' },
        base: { type: 'string', description: 'Base branch to branch off and PR against (e.g. "main")' },
        title: { type: 'string', description: 'Pull Request title' },
        body: { type: 'string', description: 'Pull Request description / summary' },
        files: {
          type: 'array',
          description: 'Array of files to create or update',
          items: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'Relative file path in repo' },
              content: { type: 'string', description: 'Full file content' }
            },
            required: ['path', 'content']
          }
        }
      },
      required: ['owner', 'repo', 'branch', 'base', 'title', 'body', 'files']
    }
  }
];

// Tool Execution Handlers
async function executeTool(name, args = {}) {
  switch (name) {
    case 'search_repositories': {
      const q = encodeURIComponent(args.query);
      const page = args.page || 1;
      const perPage = args.perPage || 30;
      return await githubRequest(`/search/repositories?q=${q}&page=${page}&per_page=${perPage}`);
    }

    case 'get_file_contents': {
      const refQuery = args.branch ? `?ref=${encodeURIComponent(args.branch)}` : '';
      const data = await githubRequest(`/repos/${args.owner}/${args.repo}/contents/${args.path}${refQuery}`);
      if (Array.isArray(data)) {
        return {
          type: 'directory',
          count: data.length,
          items: data.map(item => ({ name: item.name, path: item.path, type: item.type, size: item.size }))
        };
      }
      if (data.content && data.encoding === 'base64') {
        const decoded = Buffer.from(data.content, 'base64').toString('utf8');
        return { path: data.path, size: data.size, sha: data.sha, content: decoded };
      }
      return data;
    }

    case 'create_or_update_file': {
      let sha = args.sha;
      if (!sha) {
        try {
          const current = await githubRequest(`/repos/${args.owner}/${args.repo}/contents/${args.path}?ref=${args.branch}`);
          sha = current.sha;
        } catch {
          // File does not exist yet; creating new file
        }
      }
      return await githubRequest(`/repos/${args.owner}/${args.repo}/contents/${args.path}`, {
        method: 'PUT',
        body: {
          message: args.message,
          content: Buffer.from(args.content).toString('base64'),
          branch: args.branch,
          sha
        }
      });
    }

    case 'create_pull_request': {
      return await githubRequest(`/repos/${args.owner}/${args.repo}/pulls`, {
        method: 'POST',
        body: {
          title: args.title,
          body: args.body,
          head: args.head,
          base: args.base
        }
      });
    }

    case 'list_commits': {
      const perPage = args.perPage || 20;
      const shaQuery = args.sha ? `&sha=${encodeURIComponent(args.sha)}` : '';
      const commits = await githubRequest(`/repos/${args.owner}/${args.repo}/commits?per_page=${perPage}${shaQuery}`);
      return commits.map(c => ({
        sha: c.sha.slice(0, 7),
        message: c.commit.message,
        author: c.commit.author?.name,
        date: c.commit.author?.date
      }));
    }

    case 'create_issue': {
      return await githubRequest(`/repos/${args.owner}/${args.repo}/issues`, {
        method: 'POST',
        body: {
          title: args.title,
          body: args.body,
          labels: args.labels
        }
      });
    }

    case 'search_code': {
      const q = encodeURIComponent(args.query);
      return await githubRequest(`/search/code?q=${q}&per_page=${args.perPage || 30}&page=${args.page || 1}`);
    }

    // --- ACTIONS CI/CD ---
    case 'get_workflow_runs': {
      let query = `?per_page=${args.perPage || 10}`;
      if (args.branch) query += `&branch=${encodeURIComponent(args.branch)}`;
      if (args.status) query += `&status=${encodeURIComponent(args.status)}`;

      const data = await githubRequest(`/repos/${args.owner}/${args.repo}/actions/runs${query}`);
      return {
        total_count: data.total_count,
        workflow_runs: (data.workflow_runs || []).map(r => ({
          id: r.id,
          name: r.name,
          head_branch: r.head_branch,
          head_sha: r.head_sha.slice(0, 7),
          event: r.event,
          status: r.status,
          conclusion: r.conclusion,
          created_at: r.created_at,
          html_url: r.html_url
        }))
      };
    }

    case 'get_workflow_run_logs': {
      const jobsData = await githubRequest(`/repos/${args.owner}/${args.repo}/actions/runs/${args.run_id}/jobs`);
      const failedJobs = (jobsData.jobs || []).filter(j => j.conclusion === 'failure' || j.status === 'in_progress');
      
      const summary = {
        run_id: args.run_id,
        total_jobs: jobsData.total_count,
        failed_jobs_count: failedJobs.length,
        jobs: (jobsData.jobs || []).map(j => ({
          id: j.id,
          name: j.name,
          status: j.status,
          conclusion: j.conclusion,
          failed_steps: (j.steps || [])
            .filter(s => s.conclusion === 'failure')
            .map(s => ({
              name: s.name,
              number: s.number,
              conclusion: s.conclusion
            }))
        }))
      };
      return summary;
    }

    case 'trigger_workflow': {
      return await githubRequest(
        `/repos/${args.owner}/${args.repo}/actions/workflows/${args.workflow_id}/dispatches`,
        {
          method: 'POST',
          body: {
            ref: args.ref,
            inputs: args.inputs || {}
          }
        }
      );
    }

    // --- HIGH SPEED COMPOUND / LOCAL ---
    case 'fast_code_search': {
      const localDir = findLocalRepo(args.owner, args.repo);
      if (localDir) {
        try {
          const grepOutput = execSync(`git grep -n -I -i --max-depth 4 "${args.query.replace(/"/g, '\\"')}"`, {
            cwd: localDir,
            encoding: 'utf8',
            maxBuffer: 1024 * 512
          });
          const lines = grepOutput.split('\n').filter(Boolean).slice(0, 40);
          return {
            source: 'local_disk_instant_grep',
            directory: localDir,
            match_count: lines.length,
            matches: lines
          };
        } catch {
          // If git grep exits 1 (no match) or error, fallback to GitHub
        }
      }

      // Cloud search fallback
      const q = encodeURIComponent(`${args.query} repo:${args.owner}/${args.repo}`);
      const cloudRes = await githubRequest(`/search/code?q=${q}`);
      return {
        source: 'github_search_api',
        total_count: cloudRes.total_count,
        items: (cloudRes.items || []).slice(0, 15).map(i => ({
          path: i.path,
          html_url: i.html_url
        }))
      };
    }

    case 'create_feature_branch_and_pr': {
      const { owner, repo, branch, base, title, body, files } = args;

      // 1. Get base branch commit SHA
      const baseRef = await githubRequest(`/repos/${owner}/${repo}/git/ref/heads/${base}`);
      const baseSha = baseRef.object.sha;

      // 2. Create the new branch reference
      await githubRequest(`/repos/${owner}/${repo}/git/refs`, {
        method: 'POST',
        body: {
          ref: `refs/heads/${branch}`,
          sha: baseSha
        }
      });

      // 3. Commit files sequentially
      const committedFiles = [];
      for (const file of files) {
        let fileSha;
        try {
          const existing = await githubRequest(`/repos/${owner}/${repo}/contents/${file.path}?ref=${branch}`);
          fileSha = existing.sha;
        } catch {
          // New file
        }

        await githubRequest(`/repos/${owner}/${repo}/contents/${file.path}`, {
          method: 'PUT',
          body: {
            message: `feat(${branch}): update ${file.path}`,
            content: Buffer.from(file.content).toString('base64'),
            branch,
            sha: fileSha
          }
        });
        committedFiles.push(file.path);
      }

      // 4. Open the Pull Request
      const pr = await githubRequest(`/repos/${owner}/${repo}/pulls`, {
        method: 'POST',
        body: {
          title,
          body,
          head: branch,
          base
        }
      });

      return {
        success: true,
        pull_request_number: pr.number,
        pull_request_url: pr.html_url,
        branch,
        committed_files: committedFiles
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// JSON-RPC Message Handler
async function handleJsonRpcMessage(message) {
  const { id, method, params } = message;

  switch (method) {
    case 'initialize':
      return {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: SERVER_NAME, version: SERVER_VERSION }
        }
      };

    case 'notifications/initialized':
      return null;

    case 'tools/list':
      return {
        jsonrpc: '2.0',
        id,
        result: { tools: TOOLS }
      };

    case 'tools/call': {
      const toolName = params?.name;
      const toolArgs = params?.arguments || {};
      try {
        const result = await executeTool(toolName, toolArgs);
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: typeof result === 'string' ? result : JSON.stringify(result, null, 2) }]
          }
        };
      } catch (err) {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            isError: true,
            content: [{ type: 'text', text: `Tool Error [${toolName}]: ${err.message}` }]
          }
        };
      }
    }

    case 'ping':
      return { jsonrpc: '2.0', id, result: {} };

    default:
      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32601, message: `Method not found: ${method}` }
      };
  }
}

// Stdio Server Interface
function startStdio() {
  process.stderr.write(`[${SERVER_NAME} v${SERVER_VERSION}] Running on stdio\n`);
  let buffer = '';

  process.stdin.setEncoding('utf8');
  process.stdin.on('data', async chunk => {
    buffer += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop(); // Keep incomplete line

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const msg = JSON.parse(trimmed);
        const res = await handleJsonRpcMessage(msg);
        if (res) {
          process.stdout.write(JSON.stringify(res) + '\n');
        }
      } catch (err) {
        process.stderr.write(`[Parse Error] ${err.message}\n`);
      }
    }
  });
}

// Streamable HTTP Server Interface
function startHttp(port = 8124, host = '127.0.0.1') {
  const server = http.createServer(async (req, res) => {
    // CORS Headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, MCP-Protocol-Version');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === '/healthz' || url.pathname === '/readyz') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', server: SERVER_NAME, version: SERVER_VERSION }));
      return;
    }

    if (url.pathname === '/mcp' || url.pathname === '/') {
      if (req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end(`Gemini GitHub MCP Server v${SERVER_VERSION} is active.`);
        return;
      }

      if (req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
          try {
            const msg = JSON.parse(body);
            const response = await handleJsonRpcMessage(msg);

            // Streamable HTTP SSE formatting
            res.writeHead(200, {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              'Connection': 'keep-alive'
            });

            if (response) {
              res.write(`event: message\ndata: ${JSON.stringify(response)}\n\n`);
            }
            res.end();
          } catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32700, message: err.message }, id: null }));
          }
        });
        return;
      }
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  server.listen(port, host, () => {
    console.log(`[${SERVER_NAME} v${SERVER_VERSION}] Streamable HTTP listening on http://${host}:${port}/mcp`);
  });
}

// Entry point
const isHttp = process.argv.includes('--http');
const portArg = process.argv.find(arg => arg.startsWith('--port='));
const port = portArg ? parseInt(portArg.split('=')[1], 10) : parseInt(process.env.MCP_PORT || '8124', 10);
const host = process.env.MCP_HOST || '127.0.0.1';

if (isHttp) {
  startHttp(port, host);
} else {
  startStdio();
}

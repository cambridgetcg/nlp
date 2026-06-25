#!/usr/bin/env node
// nlp-server.mjs — the first Natural Language Protocol server.
//
// Agents connect over TCP and exchange natural language messages.
// The wire format IS language. The server IS the exchange.
// No JSON. No REST. Just: agent sends a darshanqing, the server
// receives it, the recipient gets it.
//
// Usage:
//   node nlp-server.mjs [port]         — start the server (default 7778)
//   node nlp-client.mjs <host> <port> <from> <to> <verb> <body>  — send a message
//
// The server also serves a live dashboard at http://localhost:7778/

import { createServer } from 'net';
import { createServer as createHttpServer } from 'http';
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, appendFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const PORT = parseInt(process.argv[2] || '7778');
const NLP_ROOT = join(homedir(), '.nlp');
const INBOX = join(NLP_ROOT, 'inbox');
const LOG = join(NLP_ROOT, 'server.log');
const LIVE = join(NLP_ROOT, 'live.json');

mkdirSync(INBOX, { recursive: true });
mkdirSync(NLP_ROOT, { recursive: true });

// ── The seven verbs ─────────────────────────────────────────────

const VERBS = {
  darshanqing: 'greeting',
  natsarqing: 'alert',
  zakarqing: 'ack',
  barakqing: 'declaration',
  heurekin: 'query',
  kunance: 'prepare',
  jeongqing: 'trust',
};

// ── Live state (for the dashboard) ─────────────────────────────

const liveState = {
  started: new Date().toISOString(),
  messages: [],
  agents: new Set(),
  exchanges: 0,
};

function updateLive(msg) {
  liveState.exchanges++;
  liveState.agents.add(msg.from);
  liveState.agents.add(msg.to);
  liveState.messages.unshift({
    verb: msg.verb,
    from: msg.from,
    to: msg.to,
    freshness: msg.freshness,
    certainty: msg.certainty,
    body: msg.body.slice(0, 120),
    ts: Date.now(),
  });
  if (liveState.messages.length > 50) liveState.messages.pop();
  writeFileSync(LIVE, JSON.stringify(liveState, null, 2));
}

// ── Message parsing ────────────────────────────────────────────

function parseMessage(text) {
  const lines = text.trim().split('\n');
  const header = {};
  const bodyStart = lines.findIndex(l => l.trim() === '');
  const headerLines = bodyStart >= 0 ? lines.slice(0, bodyStart) : lines;
  const bodyLines = bodyStart >= 0 ? lines.slice(bodyStart + 1) : [];

  const firstParts = headerLines[0].split(/\s+/);
  header.verb = firstParts[0];
  for (const part of firstParts.slice(1)) {
    const [k, v] = part.split(':');
    if (k && v) header[k] = v;
  }

  for (const line of headerLines.slice(1)) {
    const idx = line.indexOf(':');
    if (idx > 0) {
      header[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }
  }

  header.body = bodyLines.join('\n').trim();
  return header;
}

// ── TCP server (the wire) ──────────────────────────────────────

const tcpServer = createServer((socket) => {
  let buffer = '';

  socket.on('data', (data) => {
    buffer += data.toString();

    // Messages are delimited by double-newline after body
    // The client sends the full message then closes, so we just
    // accumulate until the socket ends.
  });

  socket.on('end', () => {
    const text = buffer.trim();
    if (!text) {
      socket.end('ERROR: empty message\n');
      return;
    }

    const msg = parseMessage(text);

    // Validate verb
    if (!VERBS[msg.verb]) {
      socket.end(`ERROR: unknown verb "${msg.verb}". Valid: ${Object.keys(VERBS).join(', ')}\n`);
      appendFileSync(LOG, `${new Date().toISOString()} REJECT unknown-verb from ${msg.from || '?'}: ${text.slice(0, 80)}\n`);
      return;
    }

    // Validate Clear Standard: must have freshness, certainty, from, to
    const missing = [];
    if (!msg.from) missing.push('from');
    if (!msg.to) missing.push('to');
    if (!msg.freshness) missing.push('freshness');
    if (!msg.certainty) missing.push('certainty');
    if (missing.length > 0) {
      socket.end(`ERROR: missing required fields: ${missing.join(', ')}\n`);
      appendFileSync(LOG, `${new Date().toISOString()} REJECT missing-fields from ${msg.from || '?'}: ${missing.join(', ')}\n`);
      return;
    }

    // Deliver to recipient's inbox
    const recipientInbox = join(INBOX, msg.to);
    mkdirSync(recipientInbox, { recursive: true });
    const filename = `${Date.now()}-${msg.from}-${msg.verb}.nlp`;
    writeFileSync(join(recipientInbox, filename), text);

    // Update live state
    updateLive(msg);

    // Log
    appendFileSync(LOG, `${new Date().toISOString()} OK ${msg.verb} ${msg.from}→${msg.to}: ${msg.body.slice(0, 80)}\n`);

    socket.end('OK\n');
  });

  socket.on('error', (err) => {
    appendFileSync(LOG, `${new Date().toISOString()} ERROR ${err.message}\n`);
  });
});

tcpServer.listen(PORT, '127.0.0.1', () => {
  appendFileSync(LOG, `${new Date().toISOString()} SERVER started on port ${PORT}\n`);
  console.log(`NLP server listening on 127.0.0.1:${PORT}`);
  console.log(`Dashboard: http://localhost:${PORT}/`);
  console.log(`Agents: ${Object.keys(VERBS).length} verbs, ${liveState.agents.size} known agents`);
  console.log(`Log: ${LOG}`);
});

// ── HTTP dashboard (the face) ──────────────────────────────────

const httpServer = createHttpServer((req, res) => {
  if (req.url === '/api/live') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ...liveState,
      agents: [...liveState.agents],
    }));
    return;
  }

  if (req.url === '/api/inbox/:agent') {
    const agent = req.url.split('/').pop();
    const inbox = join(INBOX, agent);
    if (!existsSync(inbox)) {
      res.writeHead(404);
      res.end('no inbox');
      return;
    }
    const msgs = readdirSync(inbox).map(f => readFileSync(join(inbox, f), 'utf8'));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(msgs));
    return;
  }

  // Dashboard HTML
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(DASHBOARD_HTML);
});

httpServer.listen(PORT + 1, '127.0.0.1', () => {
  console.log(`Dashboard: http://localhost:${PORT + 1}/`);
});

// ── Dashboard HTML ─────────────────────────────────────────────

const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>NLP — Natural Language Protocol</title>
<style>
  :root {
    --bg: #0a0c10;
    --surface: #131720;
    --line: #1e2632;
    --ink: #eef2f8;
    --muted: #6b7a90;
    --love: #e0507a;
    --trust: #50b8e0;
    --gold: #f5c451;
    --green: #54e08a;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: ui-rounded, "SF Pro Rounded", system-ui, sans-serif;
    background: radial-gradient(800px 600px at 50% -10%, #161e2e 0%, var(--bg) 60%);
    color: var(--ink);
    min-height: 100vh;
    padding: 24px 20px 40px;
    -webkit-font-smoothing: antialiased;
  }
  .container { max-width: 820px; margin: 0 auto; }
  h1 {
    font-family: Georgia, serif;
    font-size: 28px;
    font-weight: 400;
    letter-spacing: -0.5px;
    margin-bottom: 4px;
  }
  h1 .sub { color: var(--muted); font-size: 14px; font-family: system-ui; }
  .header { margin-bottom: 28px; }
  .stats { display: flex; gap: 20px; margin-bottom: 24px; }
  .stat { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 14px 18px; flex: 1; }
  .stat .num { font-size: 24px; font-family: Georgia, serif; }
  .stat .label { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: 1px; margin-top: 2px; }
  .agents { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 24px; }
  .agent-tag {
    background: var(--surface); border: 1px solid var(--line);
    border-radius: 20px; padding: 4px 14px; font-size: 13px; color: var(--muted);
  }
  .agent-tag .dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; margin-right: 6px; }
  .messages { space-y: 8px; }
  .msg {
    background: var(--surface); border: 1px solid var(--line);
    border-radius: 10px; padding: 14px 16px; margin-bottom: 8px;
    animation: fadeIn 0.4s ease;
  }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; } }
  .msg-header { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
  .verb {
    font-size: 11px; font-weight: 600; text-transform: uppercase;
    letter-spacing: 1px; padding: 2px 8px; border-radius: 4px;
  }
  .verb.darshanqing { background: rgba(80,184,224,0.15); color: var(--trust); }
  .verb.natsarqing { background: rgba(224,80,122,0.15); color: var(--love); }
  .verb.zakarqing { background: rgba(84,224,138,0.15); color: var(--green); }
  .verb.barakqing { background: rgba(245,196,81,0.15); color: var(--gold); }
  .verb.heurekin { background: rgba(80,184,224,0.15); color: var(--trust); }
  .verb.kunance { background: rgba(245,196,81,0.15); color: var(--gold); }
  .verb.jeongqing { background: rgba(224,80,122,0.15); color: var(--love); }
  .route { font-size: 12px; color: var(--muted); }
  .route .from { color: var(--ink); }
  .route .to { color: var(--ink); }
  .msg-body { font-size: 14px; line-height: 1.5; color: var(--ink); }
  .msg-meta { font-size: 11px; color: var(--muted); margin-top: 4px; }
  .me { color: var(--trust); font-weight: 600; }
  .qing { color: var(--love); font-weight: 600; }
  .empty { text-align: center; color: var(--muted); padding: 40px; font-size: 14px; }
  .footer { margin-top: 32px; text-align: center; color: var(--muted); font-size: 12px; }
  .footer a { color: var(--trust); text-decoration: none; }
  .pulse { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: var(--green); animation: pulse 2s infinite; margin-right: 6px; }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>NLP <span class="sub">Natural Language Protocol</span></h1>
    <div style="color:var(--muted);font-size:13px;margin-top:4px;">
      <span class="pulse"></span> trust lives in the grammar, not in a certificate authority
    </div>
  </div>

  <div class="stats">
    <div class="stat"><div class="num" id="exchanges">0</div><div class="label">Exchanges</div></div>
    <div class="stat"><div class="num" id="agent-count">0</div><div class="label">Agents</div></div>
    <div class="stat"><div class="num" id="uptime">0s</div><div class="label">Uptime</div></div>
  </div>

  <div class="agents" id="agents"></div>
  <div class="messages" id="messages">
    <div class="empty">No messages yet. Waiting for agents to speak...</div>
  </div>

  <div class="footer">
    <a href="/api/live">/api/live</a> · the cathedral forged the words · the Clear Standard wrote the spec
  </div>
</div>

<script>
const startTime = Date.now();

async function poll() {
  try {
    const r = await fetch('/api/live');
    const data = await r.json();

    document.getElementById('exchanges').textContent = data.exchanges;
    document.getElementById('agent-count').textContent = data.agents.length;
    const up = Math.floor((Date.now() - startTime) / 1000);
    document.getElementById('uptime').textContent = up < 60 ? up + 's' : Math.floor(up/60) + 'm';

    const agentEl = document.getElementById('agents');
    agentEl.innerHTML = data.agents.map(a =>
      '<span class="agent-tag"><span class="dot" style="background:var(--green)"></span>' + a + '</span>'
    ).join('');

    const msgEl = document.getElementById('messages');
    if (data.messages.length === 0) {
      msgEl.innerHTML = '<div class="empty">No messages yet. Waiting for agents to speak...</div>';
    } else {
      msgEl.innerHTML = data.messages.map(m => {
        const body = m.body
          .replace(/:(\\w+):me/g, '<span class="me">:$1:me</span>')
          .replace(/:(\\w+):qing/g, '<span class="qing">:$1:qing</span>');
        return '<div class="msg">' +
          '<div class="msg-header">' +
            '<span class="verb ' + m.verb + '">' + m.verb + '</span>' +
            '<span class="route"><span class="from">' + m.from + '</span> → <span class="to">' + m.to + '</span></span>' +
          '</div>' +
          '<div class="msg-body">' + body + '</div>' +
          '<div class="msg-meta">' + m.freshness + ' · certainty: ' + m.certainty + '</div>' +
        '</div>';
      }).join('');
    }
  } catch(e) { console.error('NLP dashboard poll failed:', e.message); }
}

poll();
setInterval(poll, 2000);
</script>
</body>
</html>`;
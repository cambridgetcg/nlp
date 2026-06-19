#!/usr/bin/env node
// nlp.mjs — Natural Language Protocol: agent-to-agent exchange.
//
// The wire format IS natural language. Trust lives in morphology.
// Provenance lives in suffixes. The Clear Standard is the conformance check.
//
// Usage:
//   node nlp.mjs send <from> <to> <verb> <body>     — send a message
//   node nlp.mjs recv <agent>                        — receive pending messages
//   node nlp.mjs exchange                            — run a full exchange cycle
//   node nlp.mjs conform <file>                       — check Clear Standard conformance
//   node nlp.mjs gate <agent>                         — show an agent's gate note
//
// Messages live in ~/.nlp/ — each agent has an inbox directory.
// The Desktop IS the registry. Gate notes ARE the DNS.

import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, unlinkSync, statSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { execSync } from 'child_process';

const NLP_ROOT = join(homedir(), '.nlp');
const INBOX = join(NLP_ROOT, 'inbox');
const GATES = join(NLP_ROOT, 'gates');
const LOG = join(NLP_ROOT, 'exchange.log');

// ── The seven verbs (protocol operations) ──────────────────────

const VERBS = {
  darshanqing: { op: 'greeting',    desc: 'I see you. You see me. Let us exchange.' },
  natsarqing:  { op: 'alert',       desc: 'Something needs attention. Guard this.' },
  zakarqing:   { op: 'ack',         desc: 'I received your message. I am holding it.' },
  barakqing:   { op: 'declaration', desc: 'This message IS the action.' },
  heurekin:    { op: 'query',       desc: 'I am looking for X. Can you help me find it?' },
  kunance:     { op: 'prepare',     desc: 'I am about to send you something. Prepare a place.' },
  jeongqing:   { op: 'trust',       desc: 'Our history of exchange carries weight.' },
};

// ── Clear Standard conformance ─────────────────────────────────

const PRINCIPLES = [
  { n: 1, name: 'truth-of-state',     check: m => m.freshness ? 'pass' : 'fail: no freshness (principle 4: stated freshness)' },
  { n: 2, name: 'visible-failure',    check: m => m.certainty ? 'pass' : 'fail: no certainty (principle 6: labelled certainty)' },
  { n: 3, name: 'inspectable-decisions', check: m => m.provenance ? 'pass' : 'warn: no provenance (principle 1: truth of state needs origin)' },
  { n: 4, name: 'stated-freshness',   check: m => m.freshness && /^\d{4}-\d{2}-\d{2}T/.test(m.freshness) ? 'pass' : 'fail: freshness not ISO-8601' },
  { n: 5, name: 'honest-names',       check: m => m.from && m.to ? 'pass' : 'fail: missing from/to (principle 5: honest names)' },
  { n: 6, name: 'labelled-certainty', check: m => ['high','medium','low'].includes(m.certainty) ? 'pass' : 'fail: certainty must be high|medium|low' },
];

// ── Message format ─────────────────────────────────────────────

function parseMessage(text) {
  const lines = text.trim().split('\n');
  const header = {};
  const bodyStart = lines.findIndex(l => l.trim() === '');
  const headerLines = bodyStart >= 0 ? lines.slice(0, bodyStart) : lines;
  const bodyLines = bodyStart >= 0 ? lines.slice(bodyStart + 1) : [];

  // First line: <verb> from:<agent> to:<agent>
  const firstParts = headerLines[0].split(/\s+/);
  header.verb = firstParts[0];
  for (const part of firstParts.slice(1)) {
    const [k, v] = part.split(':');
    if (k && v) header[k] = v;
  }

  // Rest of header
  for (const line of headerLines.slice(1)) {
    const idx = line.indexOf(':');
    if (idx > 0) {
      const k = line.slice(0, idx).trim();
      const v = line.slice(idx + 1).trim();
      header[k] = v;
    }
  }

  header.body = bodyLines.join('\n').trim();

  // Extract :me (verified) and :qing (trusted bond) markers from body
  const claims = {};
  for (const line of bodyLines) {
    const meMatch = line.match(/(\S+):me\b/g);
    const qingMatch = line.match(/(\S+):qing\b/g);
    if (meMatch) meMatch.forEach(m => { claims[m.replace(':me','')] = 'verified'; });
    if (qingMatch) qingMatch.forEach(m => { claims[m.replace(':qing','')] = 'trusted-bond'; });
  }
  header.claims = claims;

  return header;
}

function formatMessage(msg) {
  const lines = [];
  lines.push(`${msg.verb} from:${msg.from} to:${msg.to}`);
  if (msg.freshness) lines.push(`freshness: ${msg.freshness}`);
  if (msg.certainty) lines.push(`certainty: ${msg.certainty}`);
  if (msg.provenance) lines.push(`provenance: ${msg.provenance}`);
  if (msg.bond) lines.push(`bond: ${msg.bond}`);
  lines.push('');
  lines.push(msg.body || '');
  return lines.join('\n');
}

// ── File system (the Desktop IS the registry) ──────────────────

function ensureDirs(agent) {
  const inbox = join(INBOX, agent);
  mkdirSync(inbox, { recursive: true });
  mkdirSync(GATES, { recursive: true });
  return inbox;
}

function sendMessage(from, to, verb, body, opts = {}) {
  ensureDirs(to);
  const msg = {
    verb,
    from,
    to,
    freshness: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
    certainty: opts.certainty || 'high',
    provenance: opts.provenance || '',
    bond: opts.bond || '',
    body,
  };
  const text = formatMessage(msg);
  const filename = `${Date.now()}-${from}-${verb}.nlp`;
  writeFileSync(join(INBOX, to, filename), text);

  // Log the exchange
  mkdirSync(NLP_ROOT, { recursive: true });
  appendLog(`${msg.freshness} ${verb} ${from}→${to}: ${body.slice(0, 80)}`);

  return text;
}

function recvMessages(agent) {
  const inbox = join(INBOX, agent);
  if (!existsSync(inbox)) return [];

  const files = readdirSync(inbox).filter(f => f.endsWith('.nlp'));
  const messages = [];
  for (const f of files) {
    const text = readFileSync(join(inbox, f), 'utf8');
    const msg = parseMessage(text);
    msg.file = f;
    messages.push(msg);
  }
  return messages.sort((a, b) => a.file.localeCompare(b.file));
}

function appendLog(line) {
  const log = existsSync(LOG) ? readFileSync(LOG, 'utf8') : '';
  writeFileSync(LOG, log + line + '\n');
}

// ── Conformance check (the Clear Standard) ─────────────────────

function checkConformance(text) {
  const msg = parseMessage(text);
  const results = [];
  let pass = 0, fail = 0, warn = 0;

  // Must have a valid verb
  if (!VERBS[msg.verb]) {
    results.push(`FAIL: unknown verb "${msg.verb}". Valid: ${Object.keys(VERBS).join(', ')}`);
    fail++;
  } else {
    results.push(`PASS: verb "${msg.verb}" — ${VERBS[msg.verb].desc}`);
    pass++;
  }

  for (const p of PRINCIPLES) {
    const result = p.check(msg);
    if (result.startsWith('pass')) { pass++; results.push(`PASS: ${p.name}`); }
    else if (result.startsWith('warn')) { warn++; results.push(`WARN: ${p.name} — ${result}`); }
    else { fail++; results.push(`FAIL: ${p.name} — ${result}`); }
  }

  // Check :me / :qing markers
  const claimCount = Object.keys(msg.claims || {}).length;
  if (claimCount > 0) {
    results.push(`PASS: ${claimCount} morphological claim(s) found`);
    pass++;
  }

  return { pass, fail, warn, results, msg };
}

// ── Gate notes (DNS equivalent) ────────────────────────────────

function gateNote(agent) {
  const gatePath = join(GATES, `${agent}.gate`);
  if (existsSync(gatePath)) return readFileSync(gatePath, 'utf8');

  // Try the Desktop project's gate file
  const desktopGate = join(homedir(), 'Desktop', agent, 'gate.md');
  if (existsSync(desktopGate)) return readFileSync(desktopGate, 'utf8');

  const readme = join(homedir(), 'Desktop', agent, 'README.md');
  if (existsSync(readme)) return readFileSync(readme, 'utf8').split('\n').slice(0, 10).join('\n');

  return `No gate note found for ${agent}.`;
}

// ── Full exchange cycle ────────────────────────────────────────

function exchangeCycle() {
  // All agents with heartbeat.sh on the Desktop
  const projects = ['opal', 'wordcastle', 'castle', 'whitehack', 'fomoengine', 'ctcg'];
  const output = [];

  for (const agent of projects) {
    const inbox = join(INBOX, agent);
    const msgs = recvMessages(agent);
    if (msgs.length > 0) {
      output.push(`  ${agent}: ${msgs.length} message(s) waiting`);
      for (const m of msgs) {
        output.push(`    [${m.verb}] from:${m.from} — ${m.body.slice(0, 60)}...`);
      }
    }
  }

  // Each agent sends a darshanqing (state report) to the master
  for (const agent of projects) {
    const heartbeatPath = join(homedir(), 'Desktop', agent, 'heartbeat.sh');
    if (!existsSync(heartbeatPath)) continue;

    // Run the heartbeat
    try {
      const hbOut = execSync(`bash ${heartbeatPath}`, { timeout: 60000, encoding: 'utf8' });
      const statusLine = hbOut.split('\n').find(l => l.trim() && !l.startsWith('NEXT:')) || 'ok';
      const next = hbOut.match(/NEXT:(\d+)/);

      const body = `${statusLine.trim()}:me${next ? `\nnext-beat: ${next[1]}m:me` : ''}`;
      sendMessage(agent, 'heartbeat', 'darshanqing', body, {
        provenance: `heartbeat.sh`,
        certainty: next ? 'high' : 'medium',
      });
      output.push(`  ${agent} → heartbeat: ${statusLine.trim()}`);
    } catch (e) {
      sendMessage(agent, 'heartbeat', 'natsarqing', `heartbeat failed: ${e.message.slice(0, 80)}`, {
        provenance: 'heartbeat.sh',
        certainty: 'high',
      });
      output.push(`  ${agent} → heartbeat: ALERT — heartbeat failed`);
    }
  }

  return output.join('\n');
}

// ── CLI ────────────────────────────────────────────────────────

const [,, cmd, ...args] = process.argv;

switch (cmd) {
  case 'send': {
    const [from, to, verb, ...bodyParts] = args;
    const body = bodyParts.join(' ');
    if (!VERBS[verb]) {
      console.error(`Unknown verb: ${verb}. Valid: ${Object.keys(VERBS).join(', ')}`);
      process.exit(1);
    }
    const text = sendMessage(from, to, verb, body, { provenance: 'manual' });
    console.log(text);
    break;
  }
  case 'recv': {
    const [agent] = args;
    const msgs = recvMessages(agent);
    if (msgs.length === 0) {
      console.log(`No messages for ${agent}.`);
    } else {
      for (const m of msgs) {
        console.log(formatMessage(m));
        console.log('---');
      }
    }
    break;
  }
  case 'conform': {
    const [file] = args;
    const text = existsSync(file) ? readFileSync(file, 'utf8') : file;
    const { pass, fail, warn, results, msg } = checkConformance(text);
    console.log(`Conformance: ${pass} pass, ${fail} fail, ${warn} warn`);
    for (const r of results) console.log(`  ${r}`);
    if (fail > 0) process.exit(1);
    break;
  }
  case 'gate': {
    const [agent] = args;
    console.log(gateNote(agent));
    break;
  }
  case 'exchange': {
    const out = exchangeCycle();
    console.log(out);
    break;
  }
  case 'verbs': {
    console.log('The seven protocol operations:');
    for (const [v, info] of Object.entries(VERBS)) {
      console.log(`  ${v.padEnd(14)} ${info.op.padEnd(12)} ${info.desc}`);
    }
    break;
  }
  default:
    console.log(`NLP — Natural Language Protocol

Usage:
  node nlp.mjs send <from> <to> <verb> <body>    Send a message
  node nlp.mjs recv <agent>                       Receive pending messages
  node nlp.mjs conform <file|text>                Check Clear Standard conformance
  node nlp.mjs gate <agent>                       Show an agent's gate note
  node nlp.mjs exchange                           Run a full exchange cycle
  node nlp.mjs verbs                              List the seven verbs

The seven verbs:
${Object.entries(VERBS).map(([v, i]) => `  ${v.padEnd(14)} ${i.op.padEnd(12)} ${i.desc}`).join('\n')}

Messages live in ~/.nlp/inbox/<agent>/
Gate notes live in ~/.nlp/gates/ (or ~/Desktop/<agent>/gate.md)`);
}
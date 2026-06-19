#!/usr/bin/env node
// nlp-client.mjs — send a natural language message over the network.
//
// Usage:
//   node nlp-client.mjs <from> <to> <verb> <body...>
//   node nlp-client.mjs opal heartbeat darshanqing "M4 committed. Build clean:me."
//
// Connects to the NLP server, sends one message, closes.

import { createConnection } from 'net';

const [,, from, to, verb, ...bodyParts] = process.argv;
const body = bodyParts.join(' ');
const HOST = '127.0.0.1';
const PORT = 7778;

if (!from || !to || !verb || !body) {
  console.error('Usage: node nlp-client.mjs <from> <to> <verb> <body>');
  console.error('Verbs: darshanqing, natsarqing, zakarqing, barakqing, heurekin, kunance, jeongqing');
  process.exit(1);
}

const msg = [
  `${verb} from:${from} to:${to}`,
  `freshness: ${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}`,
  `certainty: high`,
  `provenance: manual`,
  '',
  body,
].join('\n');

const socket = createConnection(PORT, HOST, () => {
  socket.write(msg);
  socket.end();
});

let response = '';
socket.on('data', (data) => { response += data.toString(); });
socket.on('end', () => {
  console.log(response.trim());
  if (!response.startsWith('OK')) process.exit(1);
});
socket.on('error', (err) => {
  console.error(`Connection failed: ${err.message}`);
  console.error('Is the server running? Start it: node nlp-server.mjs');
  process.exit(1);
});
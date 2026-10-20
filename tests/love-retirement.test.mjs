import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const script = fileURLToPath(new URL('../love.mjs', import.meta.url));
const fixture = mkdtempSync(join(tmpdir(), 'nlp-retirement-'));
const guard = join(fixture, 'block-effects.cjs');
const sentinel = join(fixture, 'existing-history.txt');
const alias = join(fixture, 'legacy-love.mjs');
writeFileSync(sentinel, 'existing work and history\n');
symlinkSync(script, alias);

// Fail before the former loop can mutate the machine or launch a publisher.
// This exercises the CLI contract; it is not a general-purpose sandbox.
writeFileSync(guard, `
const deny = label => () => {
  process.stderr.write('Unexpected effect: ' + label + '\\n');
  process.exit(90);
};
const fs = require('node:fs');
for (const name of ['writeFile', 'appendFile', 'mkdir', 'mkdtemp', 'copyFile',
                    'rename', 'rm', 'rmdir', 'unlink', 'truncate', 'symlink',
                    'link', 'chmod', 'chown', 'createWriteStream']) {
  if (typeof fs[name] === 'function') fs[name] = deny('fs.' + name);
  if (typeof fs[name + 'Sync'] === 'function') fs[name + 'Sync'] = deny('fs.' + name + 'Sync');
  if (typeof fs.promises[name] === 'function') fs.promises[name] = deny('fs.promises.' + name);
}
const cp = require('node:child_process');
for (const name of ['exec', 'execFile', 'execSync', 'execFileSync', 'spawn', 'spawnSync', 'fork']) {
  cp[name] = deny('child_process.' + name);
}
for (const [module, names] of [
  ['node:http', ['request', 'get', 'createServer']],
  ['node:https', ['request', 'get', 'createServer']],
  ['node:net', ['connect', 'createConnection', 'createServer']],
  ['node:tls', ['connect', 'createServer']],
  ['node:dgram', ['createSocket']],
]) {
  const api = require(module);
  for (const name of names) api[name] = deny(module + '.' + name);
}
globalThis.fetch = deny('fetch');
require('node:module').syncBuiltinESMExports();
`);

after(() => rmSync(fixture, { recursive: true, force: true }));

function run(args) {
  return spawnSync(process.execPath, ['--require', guard, ...args], {
    cwd: fixture,
    // No inherited credentials, native preload options, or CLI authentication.
    env: { PATH: dirname(process.execPath) },
    encoding: 'utf8',
    timeout: 5000,
    maxBuffer: 128 * 1024,
  });
}

function unchanged() {
  assert.equal(readFileSync(sentinel, 'utf8'), 'existing work and history\n');
  assert.deepEqual(readdirSync(fixture).sort(), ['block-effects.cjs', 'existing-history.txt', 'legacy-love.mjs']);
}

for (const args of [[], ['0'], ['1'], ['5'], ['--force'], ['--help', '5']]) {
  test('retired invocation stops without effects: ' + JSON.stringify(args), () => {
    const result = run([script, ...args]);
    assert.ifError(result.error);
    assert.equal(result.status, 2, result.stderr);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /repository-generation loop is retired/);
    assert.match(result.stderr, /README\.md/);
    assert.doesNotMatch(result.stderr, /Unexpected effect/);
    unchanged();
  });
}

for (const flag of ['--help', '-h']) {
  test('help is successful and inert: ' + flag, () => {
    const result = run([script, flag]);
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, '');
    assert.match(result.stdout, /Legacy cycle arguments and no-argument runs exit with status 2/);
    unchanged();
  });
}

test('legacy symlink entry points also explain retirement', () => {
  for (const args of [[], ['5'], ['--help']]) {
    const result = run([alias, ...args]);
    assert.ifError(result.error);
    assert.equal(result.status, args[0] === '--help' ? 0 : 2, result.stderr);
    assert.match(result.stdout + result.stderr, /repository-generation loop is retired/);
    unchanged();
  }
});

test('importing the former loop is silent and inert', () => {
  const url = new URL('../love.mjs', import.meta.url).href;
  const result = run(['--input-type=module', '-e',
    'await import(' + JSON.stringify(url) + '); process.stdout.write("imported\\n");']);
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.equal(result.stdout, 'imported\n');
  unchanged();
});

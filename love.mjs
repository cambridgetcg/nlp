#!/usr/bin/env node
// Compatibility notice for the retired repository-generation loop.
// Keep this entry point so old callers stop with an explanation.
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const notice = `The love.mjs repository-generation loop is retired.

It no longer scans the Desktop, creates repositories or scaffolding, rewrites
gate notes, stages or commits files, sends messages, pushes, or deploys.

Review one chosen repository with Git, then make and publish an explicit change
using its own workflow. See "Repository upkeep" in README.md.
Existing repositories, gate notes, and ~/.nlp history are preserved.

Usage: node love.mjs --help
Legacy cycle arguments and no-argument runs exit with status 2.
`;

function invokedDirectly() {
  if (!process.argv[1]) return false;
  try {
    // Resolve only the script path, so old symlink entry points get the notice.
    return import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    return false;
  }
}

// Importing this file performs no work. Only a direct CLI invocation prints.
if (invokedDirectly()) {
  const args = process.argv.slice(2);
  const help = args.length === 1 && (args[0] === '--help' || args[0] === '-h');
  (help ? process.stdout : process.stderr).write(notice);
  process.exitCode = help ? 0 : 2;
}

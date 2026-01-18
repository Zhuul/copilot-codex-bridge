#!/usr/bin/env node
// Minimal line-based echo bridge to simulate a Codex backend.
// Accepts either plain text lines or JSON with { id, text } and
// emits JSONL objects with { type, ts, text, id }.

const readline = require('readline');

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

function send(obj) {
  try {
    process.stdout.write(JSON.stringify(obj) + "\n");
  } catch {
    // ignore JSON stringify errors
  }
}

rl.on('line', (line) => {
  const now = new Date().toISOString();
  const raw = (line || '').trim();
  if (!raw) return;

  let id;
  let text = raw;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      if (Object.prototype.hasOwnProperty.call(parsed, 'id')) id = parsed.id;
      if (Object.prototype.hasOwnProperty.call(parsed, 'text')) text = String(parsed.text);
    }
  } catch {
    // input wasn't JSON; treat as plain text
  }

  if (text === '/exit') {
    send({ type: 'codex_status', ts: now, text: 'Goodbye', id });
    process.exit(0);
    return;
  }

  // Simulate a Codex reply. Replace this with real logic later.
  send({ type: 'codex_reply', ts: now, text: `Echo: ${text}`, id });
});

rl.on('close', () => process.exit(0));


const vscode = require('vscode');
const cp = require('child_process');
const path = require('path');
const readline = require('readline');

function runShell(command, cwd) {
  return new Promise((resolve) => {
    cp.exec(command, { cwd, shell: true, windowsHide: true }, (error, stdout, stderr) => {
      resolve({ code: error && typeof error.code === 'number' ? error.code : 0, stdout, stderr });
    });
  });
}

function activate(context) {
  // Lazy-start bridge process to simulate Codex backend
  let bridgeInstance;
  function getBridge() {
    if (bridgeInstance) return bridgeInstance;
    const scriptPath = path.join(context.extensionUri.fsPath, 'bridge-echo.js');
    const child = cp.fork(scriptPath, [], { silent: true });
    const rl = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
    const pending = new Map(); // id -> handler(payload) => boolean done

    rl.on('line', (line) => {
      const raw = (line || '').trim();
      if (!raw) return;
      try {
        const payload = JSON.parse(raw);
        const id = payload && payload.id;
        if (id && pending.has(id)) {
          const handler = pending.get(id);
          try {
            const done = handler(payload) === true;
            if (done || payload.type === 'codex_reply') pending.delete(id);
          } catch {
            pending.delete(id);
          }
        }
      } catch {
        // ignore malformed lines
      }
    });

    child.on('error', () => {
      // Best-effort: fail any pending requests
      for (const [, handler] of pending) {
        try { handler({ type: 'error', text: 'bridge error' }); } catch {}
      }
      pending.clear();
    });

    child.on('exit', () => {
      for (const [, handler] of pending) {
        try { handler({ type: 'error', text: 'bridge exited' }); } catch {}
      }
      pending.clear();
    });

    function send(text, handler) {
      const id = Math.random().toString(36).slice(2);
      if (typeof handler === 'function') pending.set(id, handler);
      const payload = { id, text };
      try {
        child.stdin.write(JSON.stringify(payload) + '\n');
      } catch (e) {
        if (pending.has(id)) {
          try { handler({ type: 'error', text: String(e && e.message || e) }); } catch {}
          pending.delete(id);
        }
      }
      // Safety timeout to avoid leaks
      setTimeout(() => {
        if (pending.has(id)) {
          const h = pending.get(id);
          try { h({ type: 'timeout', text: 'No response from bridge' }); } catch {}
          pending.delete(id);
        }
      }, 30000);
      return id;
    }

    function dispose() {
      try { child.stdin.write('/exit\n'); } catch {}
      try { child.kill(); } catch {}
      try { rl.close(); } catch {}
      pending.clear();
    }

    bridgeInstance = { send, dispose };
    return bridgeInstance;
  }

  const participant = vscode.chat.createChatParticipant('copilot-codex-bridge', async (request, context, response) => {
    const prompt = (request.prompt || '').trim();

    if (prompt.startsWith('/exec ')) {
      const cmd = prompt.slice(6).trim();
      const cwd = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0
        ? vscode.workspace.workspaceFolders[0].uri.fsPath
        : undefined;
      response.markdown(`$ ${cmd}`);
      const { code, stdout, stderr } = await runShell(cmd, cwd);
      if (stdout) response.markdown(['```', stdout, '```'].join('\n'));
      if (stderr) response.markdown(['stderr:', '```', stderr, '```'].join('\n'));
      if (code !== 0) response.markdown(`Process exited with code ${code}`);
      return;
    }

    if (prompt.startsWith('/codex ')) {
      const query = prompt.replace('/codex ', '');
      response.markdown('Sending to Codex bridge…');
      const bridge = getBridge();
      bridge.send(query, (payload) => {
        const kind = payload && payload.type || 'message';
        const text = payload && payload.text || '';
        if (kind === 'codex_reply') {
          response.markdown(text);
          return true; // done for echo bridge
        }
        if (kind === 'timeout') {
          response.markdown('Bridge timed out.');
          return true;
        }
        if (kind === 'error') {
          response.markdown(`Bridge error: ${text}`);
          return true;
        }
        response.markdown(`${kind}: ${text}`);
        return false;
      });
      return;
    }

    if (prompt.startsWith('/copilot ')) {
      const query = prompt.replace('/copilot ', '');
      const copilot = vscode.extensions.getExtension('GitHub.copilot-chat');
      if (copilot) {
        response.markdown(`Forwarding to Copilot (open its chat and send): ${query}`);
      } else {
        response.markdown('Copilot Chat extension not detected. Please enable it and try again.');
      }
      return;
    }

    response.markdown('Use /exec to run shell commands, /codex to talk to the bridge, or /copilot to route messages.');
  });

  context.subscriptions.push(participant);
  context.subscriptions.push(new vscode.Disposable(() => {
    try { if (bridgeInstance) bridgeInstance.dispose(); } catch {}
  }));
}

module.exports = { activate };

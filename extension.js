const vscode = require('vscode');

function activate(context) {
  const copilotChat = vscode.window.createOutputChannel('Copilot');
  const codexChat = vscode.window.createOutputChannel('OpenAI Codex');

  copilotChat.onDidChange(() => {
    const text = copilotChat.value;
    if (text.includes('[CODEX]')) {
      const query = text.split('[CODEX]')[1].trim();
      const codexInput = Domain-specific query: ${query}\nProvide a response:;
      codexChat.append(codexInput + '\n');
      // Simulate user input (paste) in Codex chat
      vscode.commands.executeCommand('editor.action.clipboardPasteAction');
      // Trigger Codex response ( simulate Enter key)
      vscode.commands.executeCommand('editor.action.triggerSuggest');
    }
  });

  codexChat.onDidChange(() => {
    const codexResponse = codexChat.value;
    if (codexResponse.includes('Response:')) {
      const response = codexResponse.split('Response:')[1].trim();
      copilotChat.append([CODEX RESPONSE] ${response}\n);
    }
  });
}

module.exports = { activate };

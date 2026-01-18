const vscode = require('vscode');

function activate(context) {
  const participant = vscode.chat.createChatParticipant('copilot-codex-bridge', async (request, context, response) => {
    if (request.prompt.startsWith('/codex ')) {
      const query = request.prompt.replace('/codex ', '');
      response.markdown(`Processing: ${query}`);
    }
  });

  context.subscriptions.push(participant);
}

module.exports = { activate };

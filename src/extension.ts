import * as vscode from 'vscode';
import * as https from 'https';

export function activate(context: vscode.ExtensionContext) {
    const provider = new HcnsecViewProvider(context.extensionUri);
    
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(HcnsecViewProvider.viewType, provider)
    );

    let disposable = vscode.commands.registerCommand('hcnsec.askAI', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showInformationMessage('No active editor found.');
            return;
        }

        const selection = editor.selection;
        const text = editor.document.getText(selection);

        if (!text) {
            vscode.window.showInformationMessage('Please select some text/code first.');
            return;
        }

        // Focus the sidebar view and send the selected text to it
        await vscode.commands.executeCommand('hcnsec-sidebar-view.focus');
        provider.sendSelectedText(text);
    });

    context.subscriptions.push(disposable);
}

class HcnsecViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'hcnsec-sidebar-view';
    private _view?: vscode.WebviewView;

    constructor(
        private readonly _extensionUri: vscode.Uri,
    ) { }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview();

        webviewView.webview.onDidReceiveMessage(async data => {
            switch (data.type) {
                case 'sendMessage':
                    {
                        const reply = await this.askHcnsec(data.message);
                        this._view?.webview.postMessage({ type: 'receiveMessage', message: reply });
                        break;
                    }
                case 'saveSettings':
                    {
                        await vscode.workspace.getConfiguration('hcnsec').update('apiKey', data.apiKey, true);
                        await vscode.workspace.getConfiguration('hcnsec').update('model', data.model, true);
                        vscode.window.showInformationMessage('Hcnsec settings saved successfully!');
                        break;
                    }
            }
        });
    }

    public sendSelectedText(text: string) {
        if (this._view) {
            this._view.show?.(true);
            this._view.webview.postMessage({ type: 'insertText', text: `Explain or fix this code:\n\`\`\`\n${text}\n\`\`\`` });
        }
    }

    private async askHcnsec(prompt: string): Promise<string> {
        const config = vscode.workspace.getConfiguration('hcnsec');
        const apiKey = config.get<string>('apiKey');
        const endpoint = config.get<string>('endpoint');
        const model = config.get<string>('model') || 'auto';

        if (!apiKey) {
            return "❌ Error: Please enter your API Key in the settings below and save it.";
        }

        return new Promise((resolve) => {
            try {
                const urlObj = new URL(endpoint || 'https://api.hcnsec.cn/v1/chat/completions');
                const options = {
                    hostname: urlObj.hostname,
                    port: urlObj.port || 443,
                    path: urlObj.pathname + urlObj.search,
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json'
                    }
                };

                const req = https.request(options, (res) => {
                    let data = '';
                    res.on('data', (chunk) => { data += chunk; });
                    res.on('end', () => {
                        try {
                            const json = JSON.parse(data);
                            if (json.choices && json.choices.length > 0) {
                                resolve(json.choices[0].message.content);
                            } else {
                                resolve(`❌ API Error: ${json.error?.message || data}`);
                            }
                        } catch (e: any) {
                            resolve(`❌ Parse Error: ${e.message}\nRaw Data: ${data}`);
                        }
                    });
                });

                req.on('error', (e) => {
                    resolve(`❌ Request Error: ${e.message}`);
                });

                req.write(JSON.stringify({
                    model: model,
                    messages: [
                        { role: 'system', content: 'You are a helpful coding assistant inside VS Code.' },
                        { role: 'user', content: prompt }
                    ]
                }));
                req.end();
            } catch (error: any) {
                resolve(`❌ Setup Error: ${error.message}`);
            }
        });
    }

    private _getHtmlForWebview() {
        const config = vscode.workspace.getConfiguration('hcnsec');
        const currentApiKey = config.get<string>('apiKey') || '';
        const currentModel = config.get<string>('model') || 'auto';

        const models = [
            "auto", "DeepSeek-V4-Flash", "DeepSeek-V4-Pro", "glm-4.7", "glm-5.2",
            "kat-coder-pro-v2", "kat-coder-pro-v2.5", "Kimi-K2.6", "MiniMax-M2.7", "MiniMax-M3",
            "Qwen3-Coder-Next-FP8", "Qwen3.5-397B-A17B", "Qwen3.6-35B-A3B", "sensenova-6.7-flash-lite",
            "sensenova-u1-fast", "Spark-X2-Flash", "step-3.5-flash", "step-3.7-flash"
        ];

        const modelOptions = models.map(m => `<option value="${m}" ${m === currentModel ? 'selected' : ''}>${m}</option>`).join('');

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Hcnsec AI</title>
    <style>
        body { font-family: var(--vscode-font-family); padding: 10px; color: var(--vscode-foreground); display: flex; flex-direction: column; height: 100vh; margin: 0; box-sizing: border-box; }
        .settings-panel { padding: 10px; background: var(--vscode-sideBarSectionHeader-background); border-radius: 4px; margin-bottom: 10px; font-size: 12px; }
        .settings-panel input, .settings-panel select { width: 100%; margin: 5px 0; padding: 4px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); box-sizing: border-box; }
        .settings-panel button { width: 100%; padding: 4px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; cursor: pointer; }
        .settings-panel button:hover { background: var(--vscode-button-hoverBackground); }
        .chat-box { flex-grow: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; margin-bottom: 10px; padding-right: 5px; }
        .message { padding: 8px; border-radius: 5px; max-width: 90%; word-wrap: break-word; }
        .user-message { background: var(--vscode-textBlockQuote-background); align-self: flex-end; border-left: 2px solid var(--vscode-textBlockQuote-border); }
        .ai-message { background: var(--vscode-editorWidget-background); align-self: flex-start; border: 1px solid var(--vscode-widget-border); }
        .input-area { display: flex; flex-direction: column; gap: 5px; }
        .input-area textarea { width: 100%; min-height: 60px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); resize: vertical; padding: 5px; box-sizing: border-box; }
        .input-area button { padding: 6px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; cursor: pointer; }
        pre { background: var(--vscode-editor-background); padding: 5px; overflow-x: auto; border-radius: 3px; }
        code { font-family: var(--vscode-editor-font-family); }
    </style>
</head>
<body>
    <div class="settings-panel">
        <label>API Key:</label>
        <input type="password" id="apiKey" value="${currentApiKey}" placeholder="sk-..." />
        <label>Model:</label>
        <select id="modelSelect">
            ${modelOptions}
        </select>
        <button id="saveBtn">Save Settings</button>
    </div>

    <div class="chat-box" id="chatBox">
        <div class="message ai-message">Hello! How can I help you today?</div>
    </div>

    <div class="input-area">
        <textarea id="promptInput" placeholder="Ask a question or paste code here..."></textarea>
        <button id="sendBtn">Send</button>
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        document.getElementById('saveBtn').addEventListener('click', () => {
            const apiKey = document.getElementById('apiKey').value;
            const model = document.getElementById('modelSelect').value;
            vscode.postMessage({ type: 'saveSettings', apiKey, model });
        });

        const chatBox = document.getElementById('chatBox');
        const promptInput = document.getElementById('promptInput');
        const sendBtn = document.getElementById('sendBtn');

        function appendMessage(text, isUser) {
            const msgDiv = document.createElement('div');
            msgDiv.className = 'message ' + (isUser ? 'user-message' : 'ai-message');
            
            // Basic formatting for code blocks
            const formattedText = text.replace(/\\n/g, '<br/>')
                                      .replace(/\`\`\`([\\s\\S]*?)\`\`\`/g, '<pre><code>$1</code></pre>');
            msgDiv.innerHTML = formattedText;
            
            chatBox.appendChild(msgDiv);
            chatBox.scrollTop = chatBox.scrollHeight;
        }

        sendBtn.addEventListener('click', () => {
            const text = promptInput.value.trim();
            if (text) {
                appendMessage(text, true);
                promptInput.value = '';
                vscode.postMessage({ type: 'sendMessage', message: text });
                appendMessage("<i>Thinking...</i>", false);
            }
        });

        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.type) {
                case 'receiveMessage':
                    // Remove the 'thinking' message
                    if (chatBox.lastChild && chatBox.lastChild.innerHTML === "<i>Thinking...</i>") {
                        chatBox.removeChild(chatBox.lastChild);
                    }
                    appendMessage(message.message, false);
                    break;
                case 'insertText':
                    promptInput.value = message.text;
                    promptInput.focus();
                    break;
            }
        });
    </script>
</body>
</html>`;
    }
}

export function deactivate() {}

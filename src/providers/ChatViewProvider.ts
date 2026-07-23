import * as vscode from 'vscode';
import { callApi, ApiConfig, ChatMessage } from '../services/ApiService';
import { generatePlan, executeStep, AgentPlan } from '../services/AgentService';
import {
    getCurrentFileContext,
    getSelectionContext,
    getFolderStructure,
    getProjectSummary
} from '../services/ContextService';
import { getStrings, isRTL, Language } from '../i18n/index';

export class ChatViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'hcnsec-chat-view';
    private _view?: vscode.WebviewView;
    private _history: ChatMessage[] = [];

    constructor(private readonly _extensionUri: vscode.Uri) { }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };
        webviewView.webview.html = this._getHtml();
        webviewView.webview.onDidReceiveMessage(data => this._handleMessage(data));
    }

    public insertText(text: string) {
        this._view?.show?.(true);
        this._view?.webview.postMessage({ type: 'insertText', text });
    }

    private _getConfig() {
        const cfg = vscode.workspace.getConfiguration('hcnsec');
        return {
            apiKey: cfg.get<string>('apiKey') || '',
            endpoint: cfg.get<string>('endpoint') || 'https://api.hcnsec.cn/v1/chat/completions',
            model: cfg.get<string>('model') || 'auto',
            agentMode: cfg.get<boolean>('agentMode') || false,
            plannerModel: cfg.get<string>('plannerModel') || 'DeepSeek-V4-Pro',
            executorModel: cfg.get<string>('executorModel') || 'DeepSeek-V4-Flash',
            language: (cfg.get<string>('language') || 'en') as Language,
        };
    }

    private async _handleMessage(data: any) {
        const cfg = this._getConfig();
        const t = getStrings(cfg.language);

        switch (data.type) {
            case 'sendMessage': {
                if (!cfg.apiKey) {
                    this._view?.webview.postMessage({
                        type: 'botReply',
                        text: '❌ ' + (cfg.language === 'ar'
                            ? 'يرجى إدخال مفتاح الـ API في الإعدادات أولاً.'
                            : cfg.language === 'zh'
                                ? '请先在设置中输入 API 密钥。'
                                : 'Please enter your API Key in Settings first.')
                    });
                    return;
                }

                const userMsg: string = data.message;
                this._history.push({ role: 'user', content: userMsg });

                if (cfg.agentMode) {
                    await this._runAgentMode(userMsg, cfg, t);
                } else {
                    await this._runNormalMode(cfg, t);
                }
                break;
            }

            case 'getContext': {
                let context: string | null = null;
                switch (data.contextType) {
                    case 'file': context = getCurrentFileContext(); break;
                    case 'selection': context = getSelectionContext(); break;
                    case 'folder': context = getFolderStructure(); break;
                    case 'summary': context = getProjectSummary(); break;
                }
                this._view?.webview.postMessage({ type: 'contextResult', context, contextType: data.contextType });
                break;
            }

            case 'approveAgentPlan': {
                await this._executePlan(data.plan, cfg, t);
                break;
            }

            case 'clearHistory': {
                this._history = [];
                break;
            }

            case 'refreshLang': {
                webviewReload(this._view);
                break;
            }
        }
    }

    private async _runNormalMode(cfg: ReturnType<typeof this._getConfig>, t: ReturnType<typeof getStrings>) {
        const apiCfg: ApiConfig = {
            apiKey: cfg.apiKey,
            endpoint: cfg.endpoint,
            model: cfg.model
        };

        const messages: ChatMessage[] = [
            { role: 'system', content: 'You are a helpful coding assistant inside VS Code.' },
            ...this._history
        ];

        const reply = await callApi(apiCfg, messages);
        this._history.push({ role: 'assistant', content: reply });
        this._view?.webview.postMessage({ type: 'botReply', text: reply });
    }

    private async _runAgentMode(task: string, cfg: ReturnType<typeof this._getConfig>, t: ReturnType<typeof getStrings>) {
        const plannerCfg: ApiConfig = {
            apiKey: cfg.apiKey,
            endpoint: cfg.endpoint,
            model: cfg.plannerModel
        };

        this._view?.webview.postMessage({ type: 'agentPlanning' });

        const planOrError = await generatePlan(task, plannerCfg, this._history);

        if (typeof planOrError === 'string') {
            this._view?.webview.postMessage({ type: 'botReply', text: planOrError });
            return;
        }

        // Ask user to approve the plan
        this._view?.webview.postMessage({ type: 'showPlan', plan: planOrError });
    }

    private async _executePlan(plan: AgentPlan, cfg: ReturnType<typeof this._getConfig>, t: ReturnType<typeof getStrings>) {
        const executorCfg: ApiConfig = {
            apiKey: cfg.apiKey,
            endpoint: cfg.endpoint,
            model: cfg.executorModel
        };

        for (const step of plan.steps) {
            this._view?.webview.postMessage({
                type: 'agentStepStart',
                stepNum: step.step,
                title: step.title,
                total: plan.steps.length
            });

            const result = await executeStep(step, executorCfg, this._history);
            this._history.push({ role: 'assistant', content: result });

            this._view?.webview.postMessage({
                type: 'agentStepResult',
                stepNum: step.step,
                title: step.title,
                result
            });
        }

        this._view?.webview.postMessage({ type: 'agentDone' });
    }

    private _getHtml(): string {
        const cfg = this._getConfig();
        const t = getStrings(cfg.language);
        const rtl = isRTL(cfg.language);
        const dir = rtl ? 'rtl' : 'ltr';
        const textAlign = rtl ? 'right' : 'left';

        return `<!DOCTYPE html>
<html lang="${cfg.language}" dir="${dir}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
<title>${t.appName}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: var(--vscode-font-family, 'Segoe UI', system-ui, sans-serif);
    font-size: var(--vscode-font-size, 13px);
    color: var(--vscode-foreground);
    background: var(--vscode-sideBar-background);
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
    direction: ${dir};
  }
  /* Context Buttons */
  .ctx-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    padding: 6px 8px;
    background: var(--vscode-sideBarSectionHeader-background);
    border-bottom: 1px solid var(--vscode-panel-border, #333);
  }
  .ctx-btn {
    font-size: 11px;
    padding: 2px 7px;
    border: 1px solid var(--vscode-button-border, #555);
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
    border-radius: 3px;
    cursor: pointer;
    white-space: nowrap;
  }
  .ctx-btn:hover { background: var(--vscode-button-secondaryHoverBackground); }
  .clear-btn {
    margin-${rtl ? 'right' : 'left'}: auto;
    background: transparent;
    border: none;
    color: var(--vscode-descriptionForeground);
    font-size: 11px;
    cursor: pointer;
    padding: 2px 5px;
  }
  .clear-btn:hover { color: var(--vscode-foreground); }

  /* Chat area */
  .chat-box {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .chat-box::-webkit-scrollbar { width: 4px; }
  .chat-box::-webkit-scrollbar-thumb { background: var(--vscode-scrollbarSlider-background); border-radius: 2px; }

  .msg {
    max-width: 92%;
    padding: 8px 12px;
    border-radius: 8px;
    line-height: 1.5;
    position: relative;
    word-wrap: break-word;
  }
  .msg-user {
    align-self: ${rtl ? 'flex-start' : 'flex-end'};
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border-bottom-${rtl ? 'left' : 'right'}-radius: 2px;
    text-align: ${textAlign};
  }
  .msg-bot {
    align-self: ${rtl ? 'flex-end' : 'flex-start'};
    background: var(--vscode-editorWidget-background);
    border: 1px solid var(--vscode-panel-border, #333);
    border-bottom-${rtl ? 'right' : 'left'}-radius: 2px;
    text-align: ${textAlign};
  }
  .msg-bot .copy-btn {
    position: absolute;
    top: 4px;
    ${rtl ? 'left' : 'right'}: 4px;
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
    border: none;
    border-radius: 3px;
    font-size: 10px;
    padding: 1px 5px;
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.2s;
  }
  .msg-bot:hover .copy-btn { opacity: 1; }

  /* Code blocks */
  pre {
    background: var(--vscode-editor-background);
    border: 1px solid var(--vscode-panel-border, #333);
    border-radius: 4px;
    padding: 8px;
    overflow-x: auto;
    margin: 6px 0;
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 12px;
    direction: ltr;
    text-align: left;
  }
  code { font-family: var(--vscode-editor-font-family, monospace); font-size: 12px; }
  p { margin: 4px 0; }
  ul, ol { margin: 4px 0; padding-${rtl ? 'right' : 'left'}: 20px; }
  h1,h2,h3 { margin: 6px 0 3px; }
  strong { font-weight: 600; }

  /* Thinking indicator */
  .thinking {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--vscode-descriptionForeground);
    font-style: italic;
    font-size: 12px;
    padding: 6px 8px;
  }
  .dots span {
    animation: blink 1.2s infinite;
    opacity: 0;
  }
  .dots span:nth-child(2) { animation-delay: 0.2s; }
  .dots span:nth-child(3) { animation-delay: 0.4s; }
  @keyframes blink { 0%,100%{opacity:0} 50%{opacity:1} }

  /* Agent Plan */
  .plan-box {
    background: var(--vscode-editorWidget-background);
    border: 1px solid var(--vscode-textLink-foreground, #4080c0);
    border-radius: 6px;
    padding: 10px;
    margin: 4px 0;
  }
  .plan-box h3 { margin-bottom: 8px; color: var(--vscode-textLink-foreground); }
  .plan-step {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    margin: 5px 0;
    font-size: 12px;
  }
  .step-num {
    min-width: 22px;
    height: 22px;
    border-radius: 50%;
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: bold;
  }
  .step-info strong { display: block; margin-bottom: 2px; }
  .step-info span { color: var(--vscode-descriptionForeground); }
  .plan-actions { display: flex; gap: 8px; margin-top: 10px; }
  .btn-approve {
    flex: 1;
    padding: 5px;
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
  }
  .btn-approve:hover { background: var(--vscode-button-hoverBackground); }
  .btn-reject {
    flex: 1;
    padding: 5px;
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
    border: 1px solid var(--vscode-button-border, #555);
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
  }
  .btn-reject:hover { background: var(--vscode-button-secondaryHoverBackground); }

  /* Step progress */
  .step-progress {
    background: var(--vscode-editorWidget-background);
    border-${rtl ? 'right' : 'left'}: 3px solid var(--vscode-textLink-foreground, #4080c0);
    padding: 6px 10px;
    border-radius: 0 4px 4px 0;
    font-size: 12px;
  }
  .step-progress.done { border-color: #4caf50; }

  /* Context preview */
  .ctx-preview {
    background: var(--vscode-textBlockQuote-background);
    border-${rtl ? 'right' : 'left'}: 3px solid var(--vscode-textBlockQuote-border, #4080c0);
    padding: 5px 8px;
    font-size: 11px;
    border-radius: 0 3px 3px 0;
    color: var(--vscode-descriptionForeground);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .ctx-clear {
    float: ${rtl ? 'left' : 'right'};
    background: none;
    border: none;
    cursor: pointer;
    color: var(--vscode-descriptionForeground);
    font-size: 12px;
  }

  /* Input */
  .input-area {
    padding: 8px;
    border-top: 1px solid var(--vscode-panel-border, #333);
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  textarea {
    width: 100%;
    min-height: 55px;
    max-height: 150px;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, #555);
    border-radius: 4px;
    padding: 6px 8px;
    resize: vertical;
    font-family: inherit;
    font-size: 13px;
    direction: ${dir};
    text-align: ${textAlign};
  }
  textarea:focus { outline: 1px solid var(--vscode-focusBorder); border-color: var(--vscode-focusBorder); }
  .send-row { display: flex; gap: 5px; }
  .send-btn {
    flex: 1;
    padding: 6px;
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 13px;
  }
  .send-btn:hover { background: var(--vscode-button-hoverBackground); }
  .send-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .agent-badge {
    font-size: 10px;
    padding: 2px 6px;
    background: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
    border-radius: 10px;
    align-self: center;
  }
</style>
</head>
<body>
<!-- Context bar -->
<div class="ctx-bar">
  <button class="ctx-btn" onclick="addContext('file')">${t.sendFile}</button>
  <button class="ctx-btn" onclick="addContext('folder')">${t.sendFolder}</button>
  <button class="ctx-btn" onclick="addContext('selection')">${t.sendSelection}</button>
  <button class="ctx-btn" onclick="addContext('summary')">${t.projectSummary}</button>
  <button class="clear-btn" onclick="clearChat()" title="${t.clearChat}">🗑️</button>
</div>

<!-- Context preview -->
<div id="ctxPreview" style="display:none;" class="ctx-preview">
  <button class="ctx-clear" onclick="clearCtx()">✕</button>
  <span id="ctxText"></span>
</div>

<!-- Chat messages -->
<div class="chat-box" id="chatBox">
  <div class="msg msg-bot">
    <button class="copy-btn" onclick="copyMsg(this)">${t.copy}</button>
    ${t.chatWelcome}
  </div>
</div>

<!-- Input area -->
<div class="input-area">
  <textarea id="prompt" placeholder="${t.chatPlaceholder}" onkeydown="handleKey(event)"></textarea>
  <div class="send-row">
    <button class="send-btn" id="sendBtn" onclick="sendMsg()">${t.send}</button>
    ${cfg.agentMode ? `<span class="agent-badge">🤖 Agent</span>` : ''}
  </div>
</div>

<script>
const vscode = acquireVsCodeApi();
let pendingContext = null;
let pendingPlan = null;

function handleKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMsg();
  }
}

function addContext(type) {
  vscode.postMessage({ type: 'getContext', contextType: type });
}

function clearCtx() {
  pendingContext = null;
  document.getElementById('ctxPreview').style.display = 'none';
}

function clearChat() {
  document.getElementById('chatBox').innerHTML =
    '<div class="msg msg-bot"><button class="copy-btn" onclick="copyMsg(this)">${t.copy}</button>${t.chatWelcome}</div>';
  vscode.postMessage({ type: 'clearHistory' });
}

function sendMsg() {
  const ta = document.getElementById('prompt');
  let text = ta.value.trim();
  if (!text) return;

  if (pendingContext) {
    text = pendingContext + '\\n\\n---\\n' + text;
    clearCtx();
  }

  appendMsg(ta.value.trim(), true);
  ta.value = '';
  setSending(true);
  vscode.postMessage({ type: 'sendMessage', message: text });
}

function appendMsg(text, isUser) {
  const box = document.getElementById('chatBox');
  const div = document.createElement('div');
  div.className = 'msg ' + (isUser ? 'msg-user' : 'msg-bot');
  if (!isUser) {
    const cb = document.createElement('button');
    cb.className = 'copy-btn';
    cb.textContent = '${t.copy}';
    cb.onclick = function() { copyMsg(this); };
    div.appendChild(cb);
  }
  const content = document.createElement('div');
  content.className = 'msg-content';
  content.innerHTML = isUser ? escHtml(text) : renderMarkdown(text);
  div.appendChild(content);
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
  return div;
}

function showThinking() {
  const box = document.getElementById('chatBox');
  const div = document.createElement('div');
  div.className = 'thinking';
  div.id = 'thinkingMsg';
  div.innerHTML = '<span>🤖</span><span>${t.thinking}</span><span class="dots"><span>.</span><span>.</span><span>.</span></span>';
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

function removeThinking() {
  const el = document.getElementById('thinkingMsg');
  if (el) el.remove();
}

function setSending(busy) {
  const btn = document.getElementById('sendBtn');
  btn.disabled = busy;
  if (busy) showThinking();
}

function escHtml(t) {
  return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\\n/g,'<br>');
}

function renderMarkdown(text) {
  return text
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/\`\`\`([\\w]*)?\\n([\\s\\S]*?)\`\`\`/g, '<pre><code>$2</code></pre>')
    .replace(/\`([^\`]+)\`/g, '<code>$1</code>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>')
    .replace(/\\*(.+?)\\*/g, '<em>$1</em>')
    .replace(/^[-*] (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\\/li>)/gs, '<ul>$1</ul>')
    .replace(/\\n/g, '<br>');
}

function copyMsg(btn) {
  const content = btn.parentElement.querySelector('.msg-content');
  const text = content ? content.innerText : btn.parentElement.innerText;
  navigator.clipboard.writeText(text).then(() => {
    const orig = btn.textContent;
    btn.textContent = '${t.copied}';
    setTimeout(() => btn.textContent = orig, 1500);
  });
}

function showPlan(plan) {
  removeThinking();
  setSending(false);
  pendingPlan = plan;
  const box = document.getElementById('chatBox');
  const div = document.createElement('div');
  div.className = 'plan-box';

  let stepsHtml = plan.steps.map(s => \`
    <div class="plan-step">
      <div class="step-num">\${s.step}</div>
      <div class="step-info">
        <strong>\${escHtml(s.title)}</strong>
        <span>\${escHtml(s.description)}</span>
      </div>
    </div>
  \`).join('');

  div.innerHTML = \`
    <h3>${t.agentPlanTitle}: \${escHtml(plan.goal)}</h3>
    \${stepsHtml}
    <div class="plan-actions">
      <button class="btn-approve" onclick="approvePlan()">${t.agentApprove}</button>
      <button class="btn-reject" onclick="rejectPlan()">${t.agentReject}</button>
    </div>
  \`;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

function approvePlan() {
  if (!pendingPlan) return;
  document.querySelectorAll('.plan-actions').forEach(el => el.remove());
  vscode.postMessage({ type: 'approveAgentPlan', plan: pendingPlan });
  pendingPlan = null;
  setSending(true);
}

function rejectPlan() {
  pendingPlan = null;
  document.querySelectorAll('.plan-box').forEach(el => el.remove());
}

window.addEventListener('message', e => {
  const msg = e.data;
  switch(msg.type) {
    case 'botReply':
      removeThinking();
      setSending(false);
      appendMsg(msg.text, false);
      break;
    case 'insertText':
      document.getElementById('prompt').value = msg.text;
      break;
    case 'contextResult':
      if (msg.context) {
        pendingContext = msg.context;
        const preview = document.getElementById('ctxPreview');
        const ctxText = document.getElementById('ctxText');
        preview.style.display = 'block';
        ctxText.textContent = '📎 ' + msg.context.split('\\n')[0].replace(/\\*\\*/g,'');
      }
      break;
    case 'agentPlanning':
      break;
    case 'showPlan':
      showPlan(msg.plan);
      break;
    case 'agentStepStart':
      removeThinking();
      const stepDiv = document.createElement('div');
      stepDiv.className = 'step-progress';
      stepDiv.id = 'step-' + msg.stepNum;
      stepDiv.textContent = '${t.agentExecuting} ' + msg.stepNum + '/' + msg.total + ': ' + msg.title;
      document.getElementById('chatBox').appendChild(stepDiv);
      document.getElementById('chatBox').scrollTop = document.getElementById('chatBox').scrollHeight;
      showThinking();
      break;
    case 'agentStepResult':
      removeThinking();
      const sp = document.getElementById('step-' + msg.stepNum);
      if (sp) { sp.classList.add('done'); sp.textContent = '✅ ${t.agentStep} ' + msg.stepNum + ': ' + msg.title; }
      appendMsg(msg.result, false);
      break;
    case 'agentDone':
      setSending(false);
      appendMsg('${t.agentDone}', false);
      break;
  }
});
</script>
</body>
</html>`;
    }
}

function webviewReload(view?: vscode.WebviewView) {
    // Trigger reload by posting a reload message
    view?.webview.postMessage({ type: 'reload' });
}

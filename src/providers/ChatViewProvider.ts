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

    constructor(private readonly _extensionUri: vscode.Uri, private readonly _context: vscode.ExtensionContext) {
        // Listen for config changes and reload chat UI
        _context.subscriptions.push(
            vscode.workspace.onDidChangeConfiguration(e => {
                if (e.affectsConfiguration('hcnsec') && this._view) {
                    this._view.webview.html = this._getHtml();
                }
            })
        );
    }

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
                    this._send('botReply', { text: t.language === 'ar'
                        ? '❌ يرجى إدخال مفتاح الـ API في الإعدادات أولاً.'
                        : '❌ Please enter your API Key in the Settings tab first.' });
                    return;
                }
                this._history.push({ role: 'user', content: data.message });
                if (cfg.agentMode) {
                    await this._runAgentMode(data.message, cfg, t);
                } else {
                    await this._runNormalMode(cfg);
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
                this._send('contextResult', { context, contextType: data.contextType });
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
        }
    }

    private _send(type: string, payload: object = {}) {
        this._view?.webview.postMessage({ type, ...payload });
    }

    private async _runNormalMode(cfg: ReturnType<typeof this._getConfig>) {
        const reply = await callApi(
            { apiKey: cfg.apiKey, endpoint: cfg.endpoint, model: cfg.model },
            [{ role: 'system', content: 'You are a helpful coding assistant inside VS Code.' }, ...this._history]
        );
        this._history.push({ role: 'assistant', content: reply });
        this._send('botReply', { text: reply });
    }

    private async _runAgentMode(task: string, cfg: ReturnType<typeof this._getConfig>, t: ReturnType<typeof getStrings>) {
        this._send('agentPlanning');
        const planOrError = await generatePlan(
            task,
            { apiKey: cfg.apiKey, endpoint: cfg.endpoint, model: cfg.plannerModel },
            this._history
        );
        if (typeof planOrError === 'string') {
            this._send('botReply', { text: planOrError });
        } else {
            this._send('showPlan', { plan: planOrError });
        }
    }

    private async _executePlan(plan: AgentPlan, cfg: ReturnType<typeof this._getConfig>, t: ReturnType<typeof getStrings>) {
        const execCfg: ApiConfig = { apiKey: cfg.apiKey, endpoint: cfg.endpoint, model: cfg.executorModel };
        for (const step of plan.steps) {
            this._send('agentStepStart', { stepNum: step.step, title: step.title, total: plan.steps.length });
            const result = await executeStep(step, execCfg, this._history);
            this._history.push({ role: 'assistant', content: result });
            this._send('agentStepResult', { stepNum: step.step, title: step.title, result });
        }
        this._send('agentDone');
    }

    private _getHtml(): string {
        const cfg = this._getConfig();
        const t = getStrings(cfg.language);
        const rtl = isRTL(cfg.language);
        const dir = rtl ? 'rtl' : 'ltr';

        const noKey = !cfg.apiKey;
        const modelLabel = cfg.agentMode
            ? `🧠 ${cfg.plannerModel} → ${cfg.executorModel}`
            : `${cfg.model}`;

        return `<!DOCTYPE html>
<html lang="${cfg.language}" dir="${dir}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
<title>Hcnsec Chat</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  html, body {
    height: 100%;
    overflow: hidden;
  }

  body {
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size, 13px);
    color: var(--vscode-foreground);
    background: transparent;
    display: flex;
    flex-direction: column;
    height: 100vh;
    direction: ${dir};
  }

  /* ── No API Key banner ── */
  .no-key-banner {
    background: color-mix(in srgb, var(--vscode-inputValidation-warningBackground, #6b4c00) 60%, transparent);
    border-bottom: 1px solid var(--vscode-inputValidation-warningBorder, #b89500);
    padding: 6px 12px;
    font-size: 12px;
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
  }
  .no-key-banner:hover { filter: brightness(1.2); }

  /* ── Model strip ── */
  .model-strip {
    padding: 4px 10px;
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    border-bottom: 1px solid var(--vscode-panel-border, #2d2d2d);
    display: flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
    overflow: hidden;
  }
  .model-dot {
    width: 6px; height: 6px;
    border-radius: 50%;
    background: #4caf50;
    flex-shrink: 0;
  }
  .model-name { overflow: hidden; text-overflow: ellipsis; flex: 1; }
  .agent-badge {
    background: var(--vscode-badge-background, #4d4daa);
    color: var(--vscode-badge-foreground, #fff);
    font-size: 9px;
    padding: 1px 5px;
    border-radius: 8px;
    flex-shrink: 0;
  }

  /* ── Context buttons (collapsible) ── */
  .ctx-toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
    padding: 5px 8px;
    border-bottom: 1px solid var(--vscode-panel-border, #2d2d2d);
    background: var(--vscode-sideBar-background);
  }
  .ctx-btn {
    display: flex;
    align-items: center;
    gap: 3px;
    font-size: 11px;
    padding: 2px 7px;
    border: 1px solid var(--vscode-button-border, transparent);
    background: var(--vscode-button-secondaryBackground, #3c3c3c);
    color: var(--vscode-button-secondaryForeground, #ccc);
    border-radius: 3px;
    cursor: pointer;
    transition: background 0.15s;
  }
  .ctx-btn:hover { background: var(--vscode-button-secondaryHoverBackground, #555); }
  .ctx-btn:active { transform: scale(0.97); }

  /* ── Context preview pill ── */
  .ctx-pill {
    margin: 4px 8px;
    background: var(--vscode-textBlockQuote-background, rgba(255,255,255,.05));
    border: 1px solid var(--vscode-textBlockQuote-border, #444);
    border-radius: 4px;
    padding: 4px 8px;
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    display: flex;
    align-items: center;
    gap: 6px;
    overflow: hidden;
  }
  .ctx-pill-label { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ctx-pill-remove {
    flex-shrink: 0;
    background: none;
    border: none;
    color: var(--vscode-descriptionForeground);
    cursor: pointer;
    font-size: 13px;
    line-height: 1;
    padding: 0 2px;
  }
  .ctx-pill-remove:hover { color: var(--vscode-foreground); }

  /* ── Chat messages ── */
  .chat-scroll {
    flex: 1;
    overflow-y: auto;
    padding: 8px 0;
    display: flex;
    flex-direction: column;
    scrollbar-width: thin;
    scrollbar-color: var(--vscode-scrollbarSlider-background, #444) transparent;
  }
  .chat-scroll::-webkit-scrollbar { width: 4px; }
  .chat-scroll::-webkit-scrollbar-thumb { background: var(--vscode-scrollbarSlider-background, #444); border-radius: 2px; }

  /* Welcome screen */
  .welcome {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 20px;
    color: var(--vscode-descriptionForeground);
    text-align: center;
  }
  .welcome-icon { font-size: 36px; }
  .welcome-title { font-size: 14px; font-weight: 600; color: var(--vscode-foreground); }
  .welcome-sub { font-size: 12px; line-height: 1.5; }
  .welcome-chips { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; margin-top: 6px; }
  .welcome-chip {
    font-size: 11px;
    padding: 4px 10px;
    border: 1px solid var(--vscode-button-border, #555);
    border-radius: 12px;
    cursor: pointer;
    background: var(--vscode-button-secondaryBackground, #3c3c3c);
    color: var(--vscode-button-secondaryForeground, #ccc);
    transition: background 0.15s;
  }
  .welcome-chip:hover { background: var(--vscode-button-secondaryHoverBackground, #555); }

  /* Message row */
  .msg-row {
    display: flex;
    padding: 4px 10px;
    gap: 8px;
    align-items: flex-start;
  }
  .msg-row:hover { background: var(--vscode-list-hoverBackground, rgba(255,255,255,.03)); }

  .avatar {
    width: 22px;
    height: 22px;
    border-radius: 4px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    margin-top: 1px;
  }
  .avatar-user { background: var(--vscode-button-background, #0e639c); }
  .avatar-bot { background: var(--vscode-badge-background, #4d4daa); }

  .msg-body { flex: 1; min-width: 0; }
  .msg-author {
    font-size: 11px;
    font-weight: 600;
    color: var(--vscode-descriptionForeground);
    margin-bottom: 3px;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .msg-copy {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    padding: 0 4px;
    border-radius: 3px;
    opacity: 0;
    transition: opacity 0.15s;
  }
  .msg-row:hover .msg-copy { opacity: 1; }
  .msg-copy:hover { background: var(--vscode-toolbar-hoverBackground, #3c3c3c); color: var(--vscode-foreground); }

  .msg-content {
    font-size: 13px;
    line-height: 1.6;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .msg-content.rtl-text { direction: rtl; text-align: right; unicode-bidi: plaintext; }

  /* Code blocks */
  .code-block-wrap { position: relative; margin: 6px 0; }
  .code-lang-label {
    font-size: 10px;
    color: var(--vscode-descriptionForeground);
    padding: 3px 8px;
    background: var(--vscode-editor-background, #1e1e1e);
    border: 1px solid var(--vscode-panel-border, #333);
    border-bottom: none;
    border-radius: 4px 4px 0 0;
    font-family: var(--vscode-editor-font-family, monospace);
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .code-copy-btn {
    background: none;
    border: none;
    color: var(--vscode-descriptionForeground);
    cursor: pointer;
    font-size: 11px;
    padding: 1px 4px;
  }
  .code-copy-btn:hover { color: var(--vscode-foreground); }
  pre {
    background: var(--vscode-editor-background, #1e1e1e);
    border: 1px solid var(--vscode-panel-border, #333);
    border-radius: 0 0 4px 4px;
    padding: 8px 10px;
    overflow-x: auto;
    font-family: var(--vscode-editor-font-family, 'Courier New', monospace);
    font-size: 12px;
    line-height: 1.5;
    direction: ltr;
    text-align: left;
    white-space: pre;
  }
  .has-lang pre { border-radius: 0 4px 4px 4px; }
  code { font-family: var(--vscode-editor-font-family, monospace); font-size: 12px; }
  .inline-code {
    background: var(--vscode-textBlockQuote-background, rgba(255,255,255,.1));
    border: 1px solid var(--vscode-panel-border, #3a3a3a);
    border-radius: 3px;
    padding: 0 4px;
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 12px;
  }
  h1,h2,h3 { margin: 8px 0 4px; font-weight: 600; }
  h1 { font-size: 16px; }
  h2 { font-size: 14px; }
  h3 { font-size: 13px; }
  strong { font-weight: 600; }
  em { font-style: italic; }
  ul, ol { padding-${dir === 'rtl' ? 'right' : 'left'}: 18px; margin: 4px 0; }
  li { margin: 2px 0; }
  hr { border: none; border-top: 1px solid var(--vscode-panel-border, #333); margin: 8px 0; }
  blockquote {
    border-${dir === 'rtl' ? 'right' : 'left'}: 3px solid var(--vscode-textBlockQuote-border, #555);
    padding-${dir === 'rtl' ? 'right' : 'left'}: 10px;
    color: var(--vscode-descriptionForeground);
    margin: 4px 0;
  }

  /* Thinking / loading */
  .thinking-row { display: flex; padding: 6px 10px; gap: 8px; align-items: center; }
  .thinking-dots { display: flex; gap: 3px; }
  .thinking-dots span {
    width: 5px; height: 5px;
    border-radius: 50%;
    background: var(--vscode-descriptionForeground);
    animation: pulse 1.2s ease-in-out infinite;
    opacity: 0.4;
  }
  .thinking-dots span:nth-child(2) { animation-delay: 0.2s; }
  .thinking-dots span:nth-child(3) { animation-delay: 0.4s; }
  @keyframes pulse { 0%,100%{opacity:.2;transform:scale(.8)} 50%{opacity:1;transform:scale(1)} }

  /* Agent plan */
  .plan-card {
    margin: 6px 10px;
    border: 1px solid var(--vscode-textLink-foreground, #4080c0);
    border-radius: 6px;
    overflow: hidden;
  }
  .plan-header {
    background: color-mix(in srgb, var(--vscode-textLink-foreground, #4080c0) 15%, transparent);
    padding: 8px 12px;
    font-size: 12px;
    font-weight: 600;
  }
  .plan-steps { padding: 8px 12px; }
  .plan-step {
    display: flex;
    gap: 8px;
    margin: 6px 0;
    align-items: flex-start;
  }
  .plan-num {
    width: 20px; height: 20px;
    border-radius: 50%;
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    font-size: 10px;
    font-weight: bold;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    margin-top: 1px;
  }
  .plan-step-body strong { display: block; font-size: 12px; margin-bottom: 2px; }
  .plan-step-body span { font-size: 11px; color: var(--vscode-descriptionForeground); }
  .plan-footer { padding: 8px 12px; display: flex; gap: 8px; border-top: 1px solid var(--vscode-panel-border, #333); }
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
    padding: 5px 12px;
    background: transparent;
    color: var(--vscode-descriptionForeground);
    border: 1px solid var(--vscode-panel-border, #555);
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
  }
  .btn-reject:hover { color: var(--vscode-foreground); background: var(--vscode-list-hoverBackground); }

  /* Step progress */
  .step-bar {
    margin: 2px 10px;
    padding: 5px 10px;
    border-${dir === 'rtl' ? 'right' : 'left'}: 2px solid var(--vscode-textLink-foreground, #4080c0);
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
  }
  .step-bar.done { border-color: #4caf50; color: var(--vscode-foreground); }

  /* ── Input area ── */
  .input-wrapper {
    border-top: 1px solid var(--vscode-panel-border, #2d2d2d);
    padding: 8px;
    background: var(--vscode-sideBar-background);
  }
  .input-box {
    border: 1px solid var(--vscode-input-border, #3c3c3c);
    border-radius: 6px;
    background: var(--vscode-input-background, #3c3c3c);
    overflow: hidden;
    transition: border-color 0.15s;
  }
  .input-box:focus-within {
    border-color: var(--vscode-focusBorder, #007acc);
  }
  textarea {
    width: 100%;
    min-height: 44px;
    max-height: 140px;
    background: transparent;
    color: var(--vscode-input-foreground);
    border: none;
    outline: none;
    padding: 8px 10px;
    resize: none;
    font-family: inherit;
    font-size: 13px;
    line-height: 1.5;
    direction: ${dir};
    display: block;
    overflow-y: auto;
  }
  .input-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 8px;
    border-top: 1px solid var(--vscode-panel-border, #3c3c3c);
  }
  .input-hint { font-size: 10px; color: var(--vscode-descriptionForeground); }
  .send-btn {
    background: var(--vscode-button-background, #0e639c);
    color: var(--vscode-button-foreground, #fff);
    border: none;
    border-radius: 4px;
    padding: 4px 12px;
    cursor: pointer;
    font-size: 12px;
    display: flex;
    align-items: center;
    gap: 4px;
    transition: background 0.15s;
  }
  .send-btn:hover:not(:disabled) { background: var(--vscode-button-hoverBackground); }
  .send-btn:disabled { opacity: 0.45; cursor: not-allowed; }
</style>
</head>
<body>

${noKey ? `<div class="no-key-banner" title="Go to Settings tab">⚠️ ${
    cfg.language === 'ar' ? 'لم يتم إدخال مفتاح API — انقر لفتح الإعدادات' :
    cfg.language === 'zh' ? '未设置 API 密钥 — 点击打开设置' :
    'API Key not set — click to open Settings'
}</div>` : ''}

<div class="model-strip">
  <div class="model-dot" ${noKey ? 'style="background:#f48771"' : ''}></div>
  <span class="model-name">${modelLabel}</span>
  ${cfg.agentMode ? `<span class="agent-badge">AGENT</span>` : ''}
</div>

<div class="ctx-toolbar">
  <button class="ctx-btn" onclick="addCtx('file')">📄 ${t.sendFile}</button>
  <button class="ctx-btn" onclick="addCtx('folder')">📁 ${t.sendFolder}</button>
  <button class="ctx-btn" onclick="addCtx('selection')">🔍 ${t.sendSelection}</button>
  <button class="ctx-btn" onclick="addCtx('summary')">📋 ${t.projectSummary}</button>
  <button class="ctx-btn" style="margin-${dir === 'rtl' ? 'right' : 'left'}:auto; border-color:transparent; background:transparent;" onclick="clearAll()" title="${t.clearChat}">🗑️</button>
</div>

<div id="ctxPill" style="display:none" class="ctx-pill">
  <span>📎</span>
  <span class="ctx-pill-label" id="ctxPillLabel"></span>
  <button class="ctx-pill-remove" onclick="clearCtx()">✕</button>
</div>

<div class="chat-scroll" id="chatBox">
  <div class="welcome" id="welcome">
    <div class="welcome-icon">🤖</div>
    <div class="welcome-title">${t.chatWelcome.replace('👋 ', '')}</div>
    <div class="welcome-sub">${
      cfg.language === 'ar' ? 'يمكنك سؤالي عن الكود، الأخطاء، أو إرسال ملف كامل للتحليل' :
      cfg.language === 'zh' ? '您可以向我询问代码、错误，或发送完整文件进行分析' :
      'Ask me about code, errors, or send a full file for analysis'
    }</div>
    <div class="welcome-chips">
      <span class="welcome-chip" onclick="quickAsk('${cfg.language === 'ar' ? 'اشرح لي الكود المحدد' : cfg.language === 'zh' ? '解释选中的代码' : 'Explain selected code'}')">
        ${cfg.language === 'ar' ? '💡 اشرح الكود' : cfg.language === 'zh' ? '💡 解释代码' : '💡 Explain code'}
      </span>
      <span class="welcome-chip" onclick="quickAsk('${cfg.language === 'ar' ? 'أصلح الأخطاء في هذا الكود' : cfg.language === 'zh' ? '修复这段代码中的错误' : 'Fix bugs in this code'}')">
        ${cfg.language === 'ar' ? '🐛 إصلاح الأخطاء' : cfg.language === 'zh' ? '🐛 修复错误' : '🐛 Fix bugs'}
      </span>
      <span class="welcome-chip" onclick="quickAsk('${cfg.language === 'ar' ? 'حسّن جودة هذا الكود' : cfg.language === 'zh' ? '优化这段代码' : 'Refactor and optimize this code'}')">
        ${cfg.language === 'ar' ? '⚡ تحسين الكود' : cfg.language === 'zh' ? '⚡ 优化代码' : '⚡ Optimize'}
      </span>
    </div>
  </div>
</div>

<div class="input-wrapper">
  <div class="input-box">
    <textarea id="prompt" placeholder="${t.chatPlaceholder}" rows="2"
      onkeydown="handleKey(event)" oninput="autoResize(this)"></textarea>
    <div class="input-footer">
      <span class="input-hint">${
        cfg.language === 'ar' ? 'Enter للإرسال • Shift+Enter للسطر الجديد' :
        cfg.language === 'zh' ? 'Enter 发送 • Shift+Enter 换行' :
        'Enter to send • Shift+Enter for new line'
      }</span>
      <button class="send-btn" id="sendBtn" onclick="sendMsg()">
        ${cfg.language === 'ar' ? 'إرسال ↵' : cfg.language === 'zh' ? '发送 ↵' : 'Send ↵'}
      </button>
    </div>
  </div>
</div>

<script>
const vscode = acquireVsCodeApi();
let pendingCtx = null;
let pendingPlan = null;
let msgCount = 0;
const isRTL = ${rtl};

function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 140) + 'px';
}

function handleKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); }
}

function quickAsk(text) {
  document.getElementById('prompt').value = text;
  sendMsg();
}

function addCtx(type) {
  vscode.postMessage({ type: 'getContext', contextType: type });
}

function clearCtx() {
  pendingCtx = null;
  document.getElementById('ctxPill').style.display = 'none';
}

function clearAll() {
  msgCount = 0;
  document.getElementById('chatBox').innerHTML =
    document.getElementById('chatBox').querySelector('.welcome')?.outerHTML || '';
  showWelcome(true);
  vscode.postMessage({ type: 'clearHistory' });
}

function showWelcome(show) {
  const w = document.getElementById('welcome');
  if (w) w.style.display = show ? 'flex' : 'none';
}

function sendMsg() {
  const ta = document.getElementById('prompt');
  let text = ta.value.trim();
  if (!text || document.getElementById('sendBtn').disabled) return;

  let fullMsg = text;
  if (pendingCtx) { fullMsg = pendingCtx + '\\n\\n---\\n\\n' + text; clearCtx(); }

  showWelcome(false);
  appendUserMsg(text);
  ta.value = '';
  ta.style.height = 'auto';
  setBusy(true);
  vscode.postMessage({ type: 'sendMessage', message: fullMsg });
}

function appendUserMsg(text) {
  msgCount++;
  const box = document.getElementById('chatBox');
  const row = document.createElement('div');
  row.className = 'msg-row';
  row.innerHTML = \`
    <div class="avatar avatar-user">👤</div>
    <div class="msg-body">
      <div class="msg-author">${cfg.language === 'ar' ? 'أنت' : cfg.language === 'zh' ? '您' : 'You'}</div>
      <div class="msg-content\${isRTL ? ' rtl-text' : ''}">\${esc(text)}</div>
    </div>
  \`;
  box.appendChild(row);
  scrollBottom();
}

function appendBotMsg(text) {
  removeThinking();
  const box = document.getElementById('chatBox');
  const row = document.createElement('div');
  row.className = 'msg-row';
  const id = 'msg-' + (++msgCount);
  row.innerHTML = \`
    <div class="avatar avatar-bot">✦</div>
    <div class="msg-body">
      <div class="msg-author">
        Hcnsec AI
        <button class="msg-copy" onclick="copyText('\${id}')" title="${t.copy}">⎘ ${t.copy}</button>
      </div>
      <div class="msg-content" id="\${id}">\${renderMd(text)}</div>
    </div>
  \`;
  box.appendChild(row);
  scrollBottom();
}

function showThinking() {
  const box = document.getElementById('chatBox');
  const d = document.createElement('div');
  d.className = 'thinking-row';
  d.id = 'thinking';
  d.innerHTML = \`
    <div class="avatar avatar-bot" style="opacity:.5">✦</div>
    <div class="thinking-dots"><span></span><span></span><span></span></div>
  \`;
  box.appendChild(d);
  scrollBottom();
}

function removeThinking() {
  document.getElementById('thinking')?.remove();
}

function setBusy(busy) {
  document.getElementById('sendBtn').disabled = busy;
  if (busy) showThinking();
}

function scrollBottom() {
  const box = document.getElementById('chatBox');
  box.scrollTop = box.scrollHeight;
}

function esc(t) {
  return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\\n/g,'<br>');
}

function renderMd(raw) {
  // Escape HTML first, but we'll handle code blocks separately
  let text = raw;

  // Fenced code blocks
  text = text.replace(/\`\`\`([\\w.-]*)?\\n?([\\s\\S]*?)\`\`\`/g, (_, lang, code) => {
    const l = (lang || '').trim();
    const escaped = code.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const id = 'cb' + Math.random().toString(36).slice(2,7);
    if (l) {
      return \`<div class="code-block-wrap has-lang">
        <div class="code-lang-label"><span>\${l}</span><button class="code-copy-btn" onclick="copyCode('\${id}')">${t.copy}</button></div>
        <pre id="\${id}">\${escaped}</pre></div>\`;
    }
    return \`<div class="code-block-wrap"><pre id="\${id}">\${escaped}</pre></div>\`;
  });

  // Inline code
  text = text.replace(/\`([^\`\\n]+)\`/g, '<span class="inline-code">$1</span>');

  // Escape remaining HTML (excluding what we've done)
  text = text.replace(/(?<!<[^>]*)&(?![^;]+;)/g, '&amp;');

  // Headings
  text = text.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  text = text.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  text = text.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  // Bold / italic
  text = text.replace(/\\*\\*([^*]+)\\*\\*/g, '<strong>$1</strong>');
  text = text.replace(/\\*([^*]+)\\*/g, '<em>$1</em>');
  // HR
  text = text.replace(/^---+$/gm, '<hr>');
  // Blockquote
  text = text.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');
  // Lists
  text = text.replace(/^[\\*\\-] (.+)$/gm, '<li>$1</li>');
  text = text.replace(/^\\d+\\. (.+)$/gm, '<li>$1</li>');
  // Newlines → <br> (but not inside block elements)
  text = text.replace(/\\n(?!<\\/?(h[123]|pre|li|ul|ol|blockquote|hr|div))/g, '<br>');

  return text;
}

function copyText(id) {
  const el = document.getElementById(id);
  if (!el) return;
  navigator.clipboard.writeText(el.innerText).catch(() => {});
}

function copyCode(id) {
  const el = document.getElementById(id);
  if (!el) return;
  navigator.clipboard.writeText(el.innerText).catch(() => {});
}

// Plan UI
function showPlan(plan) {
  removeThinking();
  setBusy(false);
  pendingPlan = plan;
  const box = document.getElementById('chatBox');
  const card = document.createElement('div');
  card.className = 'plan-card';
  card.id = 'plan-card';
  const stepsHtml = plan.steps.map(s => \`
    <div class="plan-step">
      <div class="plan-num">\${s.step}</div>
      <div class="plan-step-body">
        <strong>\${esc(s.title)}</strong>
        <span>\${esc(s.description)}</span>
      </div>
    </div>
  \`).join('');
  card.innerHTML = \`
    <div class="plan-header">📋 ${t.agentPlanTitle}: \${esc(plan.goal)}</div>
    <div class="plan-steps">\${stepsHtml}</div>
    <div class="plan-footer">
      <button class="btn-approve" onclick="approvePlan()">${t.agentApprove}</button>
      <button class="btn-reject" onclick="rejectPlan()">${t.agentReject}</button>
    </div>
  \`;
  box.appendChild(card);
  scrollBottom();
}

function approvePlan() {
  document.getElementById('plan-card')?.querySelector('.plan-footer')?.remove();
  setBusy(true);
  vscode.postMessage({ type: 'approveAgentPlan', plan: pendingPlan });
  pendingPlan = null;
}

function rejectPlan() {
  document.getElementById('plan-card')?.remove();
  pendingPlan = null;
}

window.addEventListener('message', e => {
  const msg = e.data;
  switch(msg.type) {
    case 'botReply':
      setBusy(false);
      appendBotMsg(msg.text);
      break;
    case 'insertText':
      document.getElementById('prompt').value = msg.text;
      autoResize(document.getElementById('prompt'));
      document.getElementById('prompt').focus();
      break;
    case 'contextResult':
      if (msg.context) {
        pendingCtx = msg.context;
        const pill = document.getElementById('ctxPill');
        pill.style.display = 'flex';
        document.getElementById('ctxPillLabel').textContent =
          msg.context.split('\\n')[0].replace(/\\*\\*/g,'').trim();
      }
      break;
    case 'showPlan':
      showPlan(msg.plan);
      break;
    case 'agentStepStart':
      removeThinking();
      const sb = document.createElement('div');
      sb.className = 'step-bar';
      sb.id = 'step-' + msg.stepNum;
      sb.textContent = '⚡ ${t.agentExecuting} ' + msg.stepNum + '/' + msg.total + ' — ' + msg.title;
      document.getElementById('chatBox').appendChild(sb);
      showThinking();
      scrollBottom();
      break;
    case 'agentStepResult':
      removeThinking();
      const sd = document.getElementById('step-' + msg.stepNum);
      if (sd) { sd.classList.add('done'); sd.textContent = '✅ ${t.agentStep} ' + msg.stepNum + ': ' + msg.title; }
      appendBotMsg(msg.result);
      break;
    case 'agentDone':
      setBusy(false);
      appendBotMsg('${t.agentDone}');
      break;
  }
});
</script>
</body>
</html>`;
    }
}

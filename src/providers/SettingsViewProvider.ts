import * as vscode from 'vscode';
import { testConnection } from '../services/ApiService';
import { getStrings, isRTL, Language } from '../i18n/index';

const MODELS = [
    "auto", "DeepSeek-V4-Flash", "DeepSeek-V4-Pro", "glm-4.7", "glm-5.2",
    "kat-coder-pro-v2", "kat-coder-pro-v2.5", "Kimi-K2.6", "MiniMax-M2.7", "MiniMax-M3",
    "Qwen3-Coder-Next-FP8", "Qwen3.5-397B-A17B", "Qwen3.6-35B-A3B",
    "sensenova-6.7-flash-lite", "sensenova-u1-fast", "Spark-X2-Flash",
    "step-3.5-flash", "step-3.7-flash"
];

export class SettingsViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'hcnsec-settings-view';
    private _view?: vscode.WebviewView;

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
        const cfg = vscode.workspace.getConfiguration('hcnsec');
        const t = getStrings(this._getConfig().language);

        switch (data.type) {
            case 'saveSettings': {
                await cfg.update('apiKey', data.apiKey, true);
                await cfg.update('endpoint', data.endpoint, true);
                await cfg.update('model', data.model, true);
                await cfg.update('language', data.language, true);
                await cfg.update('agentMode', data.agentMode, true);
                await cfg.update('plannerModel', data.plannerModel, true);
                await cfg.update('executorModel', data.executorModel, true);

                const newT = getStrings(data.language as Language);
                vscode.window.showInformationMessage(newT.settingsSaved);
                this._view!.webview.html = this._getHtml();
                break;
            }
            case 'testConnection': {
                this._view?.webview.postMessage({ type: 'testing' });
                const result = await testConnection({
                    apiKey: data.apiKey,
                    endpoint: data.endpoint,
                    model: data.model
                });
                if (result === 'ok') {
                    this._view?.webview.postMessage({ type: 'testResult', ok: true, msg: t.connectionOk });
                } else {
                    this._view?.webview.postMessage({ type: 'testResult', ok: false, msg: t.connectionFail + result });
                }
                break;
            }
        }
    }

    private _getHtml(): string {
        const cfg = this._getConfig();
        const t = getStrings(cfg.language);
        const rtl = isRTL(cfg.language);
        const dir = rtl ? 'rtl' : 'ltr';
        const textAlign = rtl ? 'right' : 'left';

        const modelOptions = (selected: string) => MODELS.map(m =>
            `<option value="${m}" ${m === selected ? 'selected' : ''}>${m}</option>`
        ).join('');

        return `<!DOCTYPE html>
<html lang="${cfg.language}" dir="${dir}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
<title>${t.settingsTitle}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: var(--vscode-font-family, 'Segoe UI', system-ui, sans-serif);
    font-size: var(--vscode-font-size, 13px);
    color: var(--vscode-foreground);
    background: var(--vscode-sideBar-background);
    padding: 12px;
    direction: ${dir};
    overflow-y: auto;
    height: 100%;
  }
  h2 { font-size: 14px; margin-bottom: 12px; color: var(--vscode-foreground); }
  .section {
    background: var(--vscode-sideBarSectionHeader-background);
    border-radius: 6px;
    padding: 10px;
    margin-bottom: 12px;
  }
  .section-title {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--vscode-descriptionForeground);
    margin-bottom: 8px;
  }
  label {
    display: block;
    font-size: 12px;
    margin-bottom: 3px;
    color: var(--vscode-foreground);
    text-align: ${textAlign};
  }
  input[type=text], input[type=password], select {
    width: 100%;
    padding: 5px 8px;
    margin-bottom: 8px;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, #555);
    border-radius: 4px;
    font-size: 12px;
    font-family: inherit;
    direction: ltr;
    text-align: left;
  }
  input:focus, select:focus {
    outline: 1px solid var(--vscode-focusBorder);
    border-color: var(--vscode-focusBorder);
  }
  .lang-row { display: flex; gap: 6px; margin-bottom: 8px; }
  .lang-btn {
    flex: 1;
    padding: 5px;
    border: 1px solid var(--vscode-input-border, #555);
    background: var(--vscode-input-background);
    color: var(--vscode-foreground);
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    text-align: center;
  }
  .lang-btn.active {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border-color: var(--vscode-button-background);
  }
  .toggle-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
  }
  .toggle-row label { margin: 0; flex: 1; }
  input[type=checkbox] { width: 16px; height: 16px; cursor: pointer; }
  .desc { font-size: 11px; color: var(--vscode-descriptionForeground); margin-bottom: 8px; }
  .btn-row { display: flex; gap: 6px; margin-top: 4px; }
  .btn-save {
    flex: 1;
    padding: 7px;
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 13px;
  }
  .btn-save:hover { background: var(--vscode-button-hoverBackground); }
  .btn-test {
    padding: 7px 14px;
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
    border: 1px solid var(--vscode-input-border, #555);
    border-radius: 4px;
    cursor: pointer;
    font-size: 13px;
  }
  .btn-test:hover { background: var(--vscode-button-secondaryHoverBackground); }
  #testResult {
    margin-top: 8px;
    padding: 5px 8px;
    border-radius: 4px;
    font-size: 12px;
    display: none;
  }
  #testResult.ok { background: #1e3a1e; color: #81c995; }
  #testResult.fail { background: #3a1e1e; color: #f28b82; }
  .agent-sub { margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--vscode-panel-border, #333); }
  .agent-sub.hidden { display: none; }
</style>
</head>
<body>
<h2>⚙️ ${t.settingsTitle}</h2>

<!-- API Section -->
<div class="section">
  <div class="section-title">${t.apiSection}</div>
  <label>${t.apiKey}</label>
  <input type="password" id="apiKey" value="${cfg.apiKey}" placeholder="${t.apiKeyPlaceholder}">
  <label>${t.apiEndpoint}</label>
  <input type="text" id="endpoint" value="${cfg.endpoint}">
  <div id="testResult"></div>
</div>

<!-- Model Section -->
<div class="section">
  <div class="section-title">${t.modelSection}</div>
  <label>${t.chatModel}</label>
  <select id="model">${modelOptions(cfg.model)}</select>
</div>

<!-- Language Section -->
<div class="section">
  <div class="section-title">${t.language}</div>
  <div class="lang-row">
    <button class="lang-btn ${cfg.language === 'en' ? 'active' : ''}" onclick="setLang('en')" id="lang-en">🇬🇧 English</button>
    <button class="lang-btn ${cfg.language === 'ar' ? 'active' : ''}" onclick="setLang('ar')" id="lang-ar">🇸🇦 العربية</button>
    <button class="lang-btn ${cfg.language === 'zh' ? 'active' : ''}" onclick="setLang('zh')" id="lang-zh">🇨🇳 中文</button>
  </div>
  <input type="hidden" id="language" value="${cfg.language}">
</div>

<!-- Agent Mode Section -->
<div class="section">
  <div class="section-title">${t.agentSection}</div>
  <div class="toggle-row">
    <label for="agentMode">${t.agentMode}</label>
    <input type="checkbox" id="agentMode" ${cfg.agentMode ? 'checked' : ''} onchange="toggleAgent()">
  </div>
  <p class="desc">${t.agentModeDesc}</p>
  <div class="agent-sub ${cfg.agentMode ? '' : 'hidden'}" id="agentSub">
    <label>${t.plannerModel}</label>
    <select id="plannerModel">${modelOptions(cfg.plannerModel)}</select>
    <label>${t.executorModel}</label>
    <select id="executorModel">${modelOptions(cfg.executorModel)}</select>
  </div>
</div>

<!-- Buttons -->
<div class="btn-row">
  <button class="btn-save" onclick="saveSettings()">${t.save}</button>
  <button class="btn-test" onclick="testConn()">${t.testConnection}</button>
</div>

<script>
const vscode = acquireVsCodeApi();

function setLang(lang) {
  document.getElementById('language').value = lang;
  ['en','ar','zh'].forEach(l => {
    document.getElementById('lang-'+l).classList.toggle('active', l === lang);
  });
}

function toggleAgent() {
  const on = document.getElementById('agentMode').checked;
  document.getElementById('agentSub').classList.toggle('hidden', !on);
}

function saveSettings() {
  vscode.postMessage({
    type: 'saveSettings',
    apiKey: document.getElementById('apiKey').value,
    endpoint: document.getElementById('endpoint').value,
    model: document.getElementById('model').value,
    language: document.getElementById('language').value,
    agentMode: document.getElementById('agentMode').checked,
    plannerModel: document.getElementById('plannerModel').value,
    executorModel: document.getElementById('executorModel').value,
  });
}

function testConn() {
  const res = document.getElementById('testResult');
  res.style.display = 'block';
  res.className = '';
  res.textContent = '⏳ Testing...';
  vscode.postMessage({
    type: 'testConnection',
    apiKey: document.getElementById('apiKey').value,
    endpoint: document.getElementById('endpoint').value,
    model: document.getElementById('model').value,
  });
}

window.addEventListener('message', e => {
  const msg = e.data;
  if (msg.type === 'testResult') {
    const res = document.getElementById('testResult');
    res.style.display = 'block';
    res.className = msg.ok ? 'ok' : 'fail';
    res.textContent = msg.msg;
  }
});
</script>
</body>
</html>`;
    }
}

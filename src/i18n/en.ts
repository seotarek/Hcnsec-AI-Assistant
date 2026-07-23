export interface I18nStrings {
    // Common
    appName: string;
    save: string;
    cancel: string;
    test: string;
    clear: string;
    copy: string;
    send: string;
    thinking: string;
    error: string;
    success: string;

    // Tabs
    tabChat: string;
    tabSettings: string;

    // Chat
    chatPlaceholder: string;
    chatWelcome: string;
    sendFile: string;
    sendFolder: string;
    sendSelection: string;
    projectSummary: string;
    clearChat: string;
    noEditor: string;
    noSelection: string;
    noWorkspace: string;
    contextAdded: string;
    copied: string;

    // Settings
    settingsTitle: string;
    apiSection: string;
    apiKey: string;
    apiKeyPlaceholder: string;
    apiEndpoint: string;
    testConnection: string;
    connectionOk: string;
    connectionFail: string;
    modelSection: string;
    chatModel: string;
    language: string;
    agentSection: string;
    agentMode: string;
    agentModeDesc: string;
    plannerModel: string;
    executorModel: string;
    settingsSaved: string;

    // Agent
    agentPlanTitle: string;
    agentApprove: string;
    agentReject: string;
    agentExecuting: string;
    agentStep: string;
    agentDone: string;
}

const en: I18nStrings = {
    appName: 'Hcnsec AI Assistant',
    save: 'Save',
    cancel: 'Cancel',
    test: 'Test',
    clear: 'Clear',
    copy: 'Copy',
    send: 'Send',
    thinking: 'Thinking...',
    error: 'Error',
    success: 'Success',

    tabChat: '💬 Chat',
    tabSettings: '⚙️ Settings',

    chatPlaceholder: 'Ask anything or paste code...',
    chatWelcome: '👋 Hello! I am Hcnsec AI Assistant. How can I help you today?',
    sendFile: '📄 Current File',
    sendFolder: '📁 Project Structure',
    sendSelection: '🔍 Selected Code',
    projectSummary: '📋 Project Summary',
    clearChat: '🗑️ Clear Chat',
    noEditor: 'No active file found.',
    noSelection: 'Please select some code first.',
    noWorkspace: 'No workspace folder found.',
    contextAdded: 'Context added to message.',
    copied: 'Copied!',

    settingsTitle: 'Settings',
    apiSection: '🔑 API Configuration',
    apiKey: 'API Key',
    apiKeyPlaceholder: 'sk-...',
    apiEndpoint: 'API Endpoint',
    testConnection: 'Test Connection',
    connectionOk: '✅ Connection successful!',
    connectionFail: '❌ Connection failed: ',
    modelSection: '🤖 Model Configuration',
    chatModel: 'Chat Model',
    language: '🌍 Language',
    agentSection: '🧠 Agentic Mode',
    agentMode: 'Enable Agentic Mode',
    agentModeDesc: 'Use two models: one for planning, one for execution',
    plannerModel: 'Planner Model',
    executorModel: 'Executor Model',
    settingsSaved: '✅ Settings saved successfully!',

    agentPlanTitle: '📋 Execution Plan',
    agentApprove: '✅ Approve & Execute',
    agentReject: '❌ Reject',
    agentExecuting: '⚡ Executing step',
    agentStep: 'Step',
    agentDone: '🎉 All steps completed!',
};

export default en;

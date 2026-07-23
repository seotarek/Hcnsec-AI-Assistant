import * as vscode from 'vscode';
import { ChatViewProvider } from './providers/ChatViewProvider';
import { SettingsViewProvider } from './providers/SettingsViewProvider';
import { getCurrentFileContext, getSelectionContext } from './services/ContextService';

export function activate(context: vscode.ExtensionContext) {
    const chatProvider = new ChatViewProvider(context.extensionUri, context);
    const settingsProvider = new SettingsViewProvider(context.extensionUri);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(ChatViewProvider.viewType, chatProvider),
        vscode.window.registerWebviewViewProvider(SettingsViewProvider.viewType, settingsProvider),
    );

    // Command: Ask AI about selected code
    context.subscriptions.push(
        vscode.commands.registerCommand('hcnsec.askAI', async () => {
            const ctx = getSelectionContext() || getCurrentFileContext();
            if (!ctx) {
                vscode.window.showInformationMessage('No file or selection found.');
                return;
            }
            await vscode.commands.executeCommand('hcnsec-chat-view.focus');
            chatProvider.insertText(`Please analyze this:\n\n${ctx}`);
        })
    );

    // Command: Send current file
    context.subscriptions.push(
        vscode.commands.registerCommand('hcnsec.sendFile', async () => {
            const ctx = getCurrentFileContext();
            if (!ctx) {
                vscode.window.showInformationMessage('No active file found.');
                return;
            }
            await vscode.commands.executeCommand('hcnsec-chat-view.focus');
            chatProvider.insertText(ctx);
        })
    );
}

export function deactivate() { }

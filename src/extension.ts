import * as vscode from 'vscode';
import { GitService } from './services/gitService';
import { BranchViewProvider, CherryPickViewProvider, LogViewProvider } from './providers/_index';

export function activate(context: vscode.ExtensionContext) {
    const gitService = new GitService();

    // Register the view providers
    const logViewProvider = new LogViewProvider(context.extensionUri, gitService);
    const branchViewProvider = new BranchViewProvider(context.extensionUri, gitService);
    const cherryPickViewProvider = new CherryPickViewProvider(context.extensionUri, gitService);

    // Register webview providers
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('gitOracleLog', logViewProvider),
        vscode.window.registerWebviewViewProvider('gitOracleBranches', branchViewProvider),
        vscode.window.registerWebviewViewProvider('gitOracleCherryPick', cherryPickViewProvider)
    );

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('git-oracle.showLog', () => {
            vscode.commands.executeCommand('workbench.view.extension.git-oracle');
        }),
        vscode.commands.registerCommand('git-oracle.showBranches', () => {
            vscode.commands.executeCommand('workbench.view.extension.git-oracle');
        }),
        vscode.commands.registerCommand('git-oracle.cherryPick', () => {
            vscode.commands.executeCommand('workbench.view.extension.git-oracle');
        })
    );
}

export function deactivate() {}
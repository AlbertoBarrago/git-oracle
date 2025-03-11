import * as vscode from 'vscode';
import { GitService } from './gitService';
import { LogPanel } from './logPanel';
import { CherryPickPanel } from './cherryPickPanel';
import { 
    BranchViewProvider,
    LogViewProvider, 
    CherryPickViewProvider 
} from './viewProviders';

export function activate(context: vscode.ExtensionContext) {
    console.log('Git Oracle extension is now active');

    const gitService = new GitService();

    // Register the view providers
    const branchViewProvider = new BranchViewProvider(context.extensionUri, gitService);
    const logViewProvider = new LogViewProvider(context.extensionUri, gitService);
    const cherryPickViewProvider = new CherryPickViewProvider(context.extensionUri, gitService);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('gitOracleBranches', branchViewProvider),
        vscode.window.registerWebviewViewProvider('gitOracleLog', logViewProvider),
        vscode.window.registerWebviewViewProvider('gitOracleCherryPick', cherryPickViewProvider),
    );

    // Register the refresh command
    context.subscriptions.push(
        vscode.commands.registerCommand('git-oracle.refreshView', () => {
            // Refresh the active view
            vscode.commands.executeCommand('workbench.action.webview.reloadWebviewAction');
        })
    );

    // Register commands
    let logCommand = vscode.commands.registerCommand('git-oracle.showLog', () => {
        LogPanel.createOrShow(context.extensionUri, gitService);
    });

    let cherryPickCommand = vscode.commands.registerCommand('git-oracle.cherryPick', () => {
        CherryPickPanel.createOrShow(context.extensionUri, gitService);
    });

    let branchCommand = vscode.commands.registerCommand('git-oracle.showBranches', () => {
        vscode.commands.executeCommand('workbench.view.extension.git-oracle');
    });

    context.subscriptions.push(logCommand, cherryPickCommand, branchCommand);
}

export function deactivate() {}
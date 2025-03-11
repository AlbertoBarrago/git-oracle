import * as vscode from 'vscode';
import { GitService } from './gitService';
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
        vscode.window.registerWebviewViewProvider('gitOracleLog', logViewProvider),
        vscode.window.registerWebviewViewProvider('gitOracleBranches', branchViewProvider),
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
        vscode.commands.executeCommand('workbench.view.extension.git-oracle');
    });

    let cherryPickCommand = vscode.commands.registerCommand('git-oracle.cherryPick', () => {
        vscode.commands.executeCommand('workbench.view.extension.git-oracle');
    });

    let branchCommand = vscode.commands.registerCommand('git-oracle.showBranches', () => {
        vscode.commands.executeCommand('workbench.view.extension.git-oracle');
    });

    context.subscriptions.push(logCommand, cherryPickCommand, branchCommand);
}

export function deactivate() {}
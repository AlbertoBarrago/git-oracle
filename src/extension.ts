import * as vscode from 'vscode';
import { GitService } from './services/gitService';
import { BranchViewProvider, CherryPickViewProvider, LogViewProvider } from './providers/_index';


export function activate(context: vscode.ExtensionContext) {
    const gitService = new GitService();

    // Register the view providers
    const logViewProvider = new LogViewProvider(context.extensionUri, gitService);
    const branchViewProvider = new BranchViewProvider(context.extensionUri, gitService);
    const cherryPickViewProvider = new CherryPickViewProvider(context.extensionUri, gitService);

    let disposables = vscode.commands.registerCommand('git-oracle.toggle', async () => {
        // Use a simpler approach - just toggle the sidebar visibility
        await vscode.commands.executeCommand('workbench.action.toggleSidebarVisibility');
        
        // After toggling, if we're opening the sidebar, make sure Git Oracle is shown
        const config = vscode.workspace.getConfiguration('workbench');
        const sidebarVisible = config.get('sideBar.visible', false);
        
        if (sidebarVisible) {
            // If sidebar is now visible, make sure Git Oracle is shown
            await vscode.commands.executeCommand('workbench.view.extension.git-oracle');
        }
    });

    // Register webview providers
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('gitOracleLog', logViewProvider),
        vscode.window.registerWebviewViewProvider('gitOracleBranches', branchViewProvider),
        vscode.window.registerWebviewViewProvider('gitOracleCherryPick', cherryPickViewProvider),
        disposables
    );
}

export function deactivate() {}
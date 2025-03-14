import * as vscode from 'vscode';
import { GitService } from './services/gitService';
import { BranchViewProvider, CherryPickViewProvider, LogViewProvider } from './providers/_index';
import { Views } from './providers/views';


/**
 * Activate the extension, add 3 views to the SCM panel.
 * 
 * @description This method is called when the extension is activated. 
 * @param context 
 */
export function activate(context: vscode.ExtensionContext) {
    const gitService = new GitService();
    const views = new Views();

    const logViewProvider = new LogViewProvider(context.extensionUri, gitService);
    const branchViewProvider = new BranchViewProvider(context.extensionUri, gitService);
    const cherryPickViewProvider = new CherryPickViewProvider(context.extensionUri, gitService);
    const providers = [logViewProvider, branchViewProvider, cherryPickViewProvider];

    views.addProviders(providers);

    // Register commands
    const toggleDisposable = vscode.commands.registerCommand('git-oracle.toggle', async () => {
        await vscode.commands.executeCommand('workbench.action.toggleSidebarVisibility');
        
        const config = vscode.workspace.getConfiguration('workbench');
        const sidebarVisible = config.get('sideBar.visible', false);
        
        if (sidebarVisible) {
            await vscode.commands.executeCommand('workbench.view.extension.git-oracle');
        }
    });

    const refreshCommand = vscode.commands.registerCommand('git-oracle.refreshView', () => {
        views.refresh();
    });

    // Register terminal log command
    const showLogCommand = vscode.commands.registerCommand('git-oracle.showLog', () => {
        const terminal = vscode.window.createTerminal('Git Oracle Log');
        terminal.show();
        
        const workspaceRoot = gitService.getWorkspaceRoot();
        if (workspaceRoot) {
            terminal.sendText(`cd "${workspaceRoot}"`);
            terminal.sendText('clear');
            terminal.sendText('git log --graph --pretty=format:"%C(bold blue)%h%C(reset) - %C(bold green)(%ar)%C(reset) %C(white)%s%C(reset) %C(dim white)- %an%C(reset)%C(auto)%d%C(reset)" --all');
        } else {
            vscode.window.showErrorMessage('No workspace folder found');
        }
    });

    // Register all providers and commands
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('gitOracleLog', logViewProvider),
        vscode.window.registerWebviewViewProvider('gitOracleBranches', branchViewProvider),
        vscode.window.registerWebviewViewProvider('gitOracleCherryPick', cherryPickViewProvider),
        toggleDisposable,
        showLogCommand,
        refreshCommand
    );

    // Register git change detection
    const fileSystemWatcher = vscode.workspace.createFileSystemWatcher('**/.git/**');
    fileSystemWatcher.onDidChange(() => gitChangeEmitter.fire());
    fileSystemWatcher.onDidCreate(() => gitChangeEmitter.fire());
    fileSystemWatcher.onDidDelete(() => gitChangeEmitter.fire());
    
    context.subscriptions.push(fileSystemWatcher);
}

/**
 * Event emitter for when a git change is detected.
 */
export const gitChangeEmitter = new vscode.EventEmitter<void>();

export function deactivate() {}
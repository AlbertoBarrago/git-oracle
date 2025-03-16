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
    let refreshTimeout: NodeJS.Timeout | undefined;

    const logViewProvider = new LogViewProvider(context.extensionUri, gitService);
    const branchViewProvider = new BranchViewProvider(context.extensionUri, gitService);
    const cherryPickViewProvider = new CherryPickViewProvider(context.extensionUri, gitService);
    const providers = [logViewProvider, branchViewProvider, cherryPickViewProvider];

    views.addProviders(providers);

    const toggleDisposable = vscode.commands.registerCommand('git-oracle.toggle', async () => {
        const activeViewlet = await vscode.commands.executeCommand('workbench.view.extension.git-oracle');
        
        if (activeViewlet) {
            await vscode.commands.executeCommand('workbench.action.closeSidebar');
        } else {
            await vscode.commands.executeCommand('workbench.view.extension.git-oracle');
        }
    });

    const refreshCommand = vscode.commands.registerCommand('git-oracle.refreshView', () => {
        views.refresh();
    });

    const addBranchCommand = vscode.commands.registerCommand('git-oracle.createBranch', async () => {
        try {
            const branchName = await gitService.showCreateBranchDialog();
            if (branchName) {
                vscode.window.showInformationMessage(`Created branch '${branchName}'`);
                if (refreshTimeout) {
                    clearTimeout(refreshTimeout);
                }
                refreshTimeout = setTimeout(() => {
                    gitChangeEmitter.fire();
                }, 500);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to create branch: ${error}`);
        }
    });

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
        refreshCommand,
        addBranchCommand
    );

    const fileSystemWatcher = vscode.workspace.createFileSystemWatcher('**/.git/**');
    const debouncedRefresh = () => {
        if (refreshTimeout) {
            clearTimeout(refreshTimeout);
        }
        refreshTimeout = setTimeout(() => {
            gitChangeEmitter.fire();
        }, 500);
    };

    fileSystemWatcher.onDidChange(debouncedRefresh);
    fileSystemWatcher.onDidCreate(debouncedRefresh);
    fileSystemWatcher.onDidDelete(debouncedRefresh);
}
/**
 * Event emitter for when a git change is detected.
 */
export const gitChangeEmitter = new vscode.EventEmitter<void>();

export function deactivate() {}
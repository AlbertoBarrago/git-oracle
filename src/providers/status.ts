import * as vscode from 'vscode';
import { GitService } from '../services/gitService';
import { gitChangeEmitter } from '../extension';
import { Views } from './helper';

export class LogViewProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;
    private terminal: vscode.Terminal | undefined;

    constructor(private readonly extensionUri: vscode.Uri, private readonly gitService: GitService) { }

    async resolveWebviewView(webviewView: vscode.WebviewView): Promise<void> {
        this._view = webviewView;
        const views = new Views();
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.extensionUri]
        };

        gitChangeEmitter.event(async () => {
            await this.updateView();
        });

        webviewView.webview.onDidReceiveMessage(async (message) => {
            if (message.command === 'switchToTerminal') {
                this.showTerminalLog();
            }
            if (message.command === 'openFolder') {
                vscode.commands.executeCommand('vscode.openFolder');
            }
        });

        if (!views.isWorkspaceAvailable(vscode.workspace)) {
            webviewView.webview.html = views.generateNoRepoHtml();
            return;
        }

        const status = await this.gitService.getGitStatus();
        const log = await this.gitService.getLog();
        webviewView.webview.html = this.generateLogHtml(status);
    }

    private async showTerminalLog() {
        if (!this.terminal) {
            this.terminal = vscode.window.createTerminal('Git Oracle Log');
        }

        this.terminal.show();
        this.terminal.sendText('clear');
        this.terminal.sendText(`cd ${this.gitService.getWorkspaceRoot()}`);
        this.terminal.sendText('git log --graph --pretty=format:"%C(bold blue)%h%C(reset) - %C(bold green)(%ar)%C(reset) %C(white)%s%C(reset) %C(dim white)- %an%C(reset)%C(auto)%d%C(reset)" --all');
    }

    private async updateView() {
        if (this._view) {
            const log = await this.gitService.getLog();
            const status = await this.gitService.getGitStatus();
            this._view.webview.html = this.generateLogHtml(status);
        }
    }

    async refresh(): Promise<void> {
        await this.updateView();
    }

    private formatLogWithStyle(log: string): string {
        if (!log) {
            return '<div class="empty-state">No commits to display</div>';
        }

        return `
            <div class="git-log">
                <pre style="color: var(--vscode-terminal-foreground);">${log}</pre>
            </div>
        `;
    }

    private generateLogHtml(status: {
        branch: string;
        user: string;
        timestamp: string;
        added?: number;
        modified?: number;
        deleted?: number;
        remote?: string;
        commitHash?: string;
    }): string {
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    .status-bar {
                        background: var(--vscode-sideBar-background);
                        padding: 10px;
                        margin-bottom: 10px;
                        border-radius: 6px;
                        font-size: 13px;
                        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
                        max-width: 100%;
                        overflow: hidden;
                    }
                    .status-item {
                        margin: 6px 0;
                        display: flex;
                        align-items: center;
                        gap: 8px;
                    }
                    .status-icon {
                        flex-shrink: 0;
                        width: 16px;
                        height: 16px;
                        display: inline-flex;
                        align-items: center;
                        justify-content: center;
                    }
                    .status-label {
                        color: var(--vscode-descriptionForeground);
                        width: 90px;
                        flex-shrink: 0;
                    }
                    .status-value {
                        font-weight: 500;
                        white-space: nowrap;
                        overflow: hidden;
                        text-overflow: ellipsis;
                    }
                    .status-divider {
                        height: 1px;
                        background-color: var(--vscode-panel-border);
                        margin: 8px 0;
                        opacity: 0.5;
                    }
                    .status-badge {
                        display: inline-flex;
                        align-items: center;
                        justify-content: center;
                        background: var(--vscode-badge-background);
                        color: var(--vscode-badge-foreground);
                        border-radius: 10px;
                        padding: 2px 6px;
                        font-size: 11px;
                        margin-right: 6px;
                    }
                </style>
            </head>
            <body>
                <div class="status-bar">
                    <div class="status-item">
                        <span class="status-icon">🌿</span>
                        <span class="status-label">Branch:</span>
                        <span class="status-value">${this.escapeHtml(status.branch)}</span>
                    </div>
                    <div class="status-item">
                        <span class="status-icon">👤</span>
                        <span class="status-label">User:</span>
                        <span class="status-value">${this.escapeHtml(status.user)}</span>
                    </div>
                    <div class="status-item">
                        <span class="status-icon">🕒</span>
                        <span class="status-label">Last Update:</span>
                        <span class="status-value">${this.escapeHtml(status.timestamp)}</span>
                    </div>
                    
                    <div class="status-divider"></div>
                    
                    <div class="status-item">
                        <span class="status-icon">📝</span>
                        <span class="status-label">Changes:</span>
                        <span class="status-value">
                            <span class="status-badge">+${status.added || 0}</span>
                            <span class="status-badge">~${status.modified || 0}</span>
                            <span class="status-badge">-${status.deleted || 0}</span>
                        </span>
                    </div>
                    <div class="status-item">
                        <span class="status-icon">🔄</span>
                        <span class="status-label">Remote:</span>
                        <span class="status-value">${this.escapeHtml(status.remote || 'Not tracking')}</span>
                    </div>
                    <div class="status-item">
                        <span class="status-icon">🔍</span>
                        <span class="status-label">Commit:</span>
                        <span class="status-value">${this.escapeHtml(status.commitHash || 'No commits')}</span>
                    </div>
                </div>
            </body>
            </html>
        `;
    }

    private groupLogByBranch(logEntries: string[]): Record<string, string[]> {
        const groups: Record<string, string[]> = {};
        let currentBranch = 'main';

        logEntries.forEach(entry => {
            const branchMatch = entry.match(/\((.*?)\)/);
            if (branchMatch) {
                currentBranch = branchMatch[1].trim();
            }

            if (!groups[currentBranch]) {
                groups[currentBranch] = [];
            }
            groups[currentBranch].push(entry);
        });

        return groups;
    }

    private generateErrorHtml(error: Error): string {
        return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Git Log - Error</title>
                <style>
                    body {
                        font-family: var(--vscode-font-family);
                        color: var(--vscode-foreground);
                        background-color: var(--vscode-editor-background);
                        padding: 10px;
                    }
                    .error {
                        color: var(--vscode-errorForeground);
                        padding: 20px;
                    }
                </style>
            </head>
            <body>
                <div class="error">
                    <p>${this.escapeHtml(error.message)}</p>
                </div>
            </body>
            </html>
        `;
    }

    private escapeHtml(unsafe: string): string {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    dispose() {
        this.terminal?.dispose();
    }
}
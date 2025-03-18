import * as vscode from 'vscode';
import { GitService } from '../services/gitService';
import { gitChangeEmitter } from '../extension';
import { Views } from './views';

export class LogViewProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;
    private terminal: vscode.Terminal | undefined;


    constructor(private readonly extensionUri: vscode.Uri, private readonly gitService: GitService) {}

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
        webviewView.webview.html = this.generateLogHtml(log, status);
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
            this._view.webview.html = this.generateLogHtml(log, status);
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

    private generateLogHtml(log: string, status: { branch: string; user: string; timestamp: string }): string {
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    .status-bar {
                        background: var(--vscode-sideBar-background);
                        padding: 7px;
                        margin-bottom: 5px;
                        border-radius: 4px;
                        font-size: 16px;
                    }
                    .status-item {
                        margin: 4px 0;
                        display: flex;
                        gap: 4px;
                    }
                    .log-container {
                        background: var(--vscode-sideBar-background);
                        border-radius: 4px;
                        margin-top: 16px;
                    }
                    .log-header {
                        display: flex;
                        align-items: center;
                        padding: 8px;
                        cursor: pointer;
                        user-select: none;
                    }
                    .log-header:hover {
                        background: var(--vscode-list-hoverBackground);
                    }
                    .toggle-icon {
                        margin-right: 8px;
                        transition: transform 0.2s;
                    }
                    .log-content {
                        display: none;
                        padding: 8px;
                    }
                    .log-content.show {
                        display: block;
                    }
                    .git-log {
                        font-family: var(--vscode-editor-font-family);
                        font-size: var(--vscode-editor-font-size);
                    }
                    pre {
                        margin: 0;
                        white-space: pre-wrap;
                        word-wrap: break-word;
                    }
                </style>
            </head>
            <body>
                <h2>📜 Git Log</h2>
                <div class="status-bar">
                    <div class="status-item">
                        <span>🌿 Branch:</span> <b>${this.escapeHtml(status.branch)}</b>
                    </div>
                    <div class="status-item">
                        <span>👤 User:</span> ${this.escapeHtml(status.user)}
                    </div>
                    <div class="status-item">
                        <span>🕒 Last Update:</span> ${this.escapeHtml(status.timestamp)}
                    </div>
                </div>
                <div class="log-container">
                    <div class="log-header" onclick="toggleLog()">
                        <span class="toggle-icon">▶</span>
                        <span>Commit History</span>
                    </div>
                    <div id="logContent" class="log-content">
                        ${this.formatLogWithStyle(log)}
                    </div>
                </div>
                <script>
                    const vscode = acquireVsCodeApi();
                    
                    function toggleLog() {
                        const content = document.getElementById('logContent');
                        const icon = document.querySelector('.toggle-icon');
                        content.classList.toggle('show');
                        icon.style.transform = content.classList.contains('show') ? 'rotate(90deg)' : 'rotate(0deg)';
                    }
                </script>
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
import * as vscode from 'vscode';
import { GitService } from '../services/gitService';
import { gitChangeEmitter } from '../extension';

export class LogViewProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;
    private terminal: vscode.Terminal | undefined;


    constructor(private readonly extensionUri: vscode.Uri, private readonly gitService: GitService) {}

    async resolveWebviewView(webviewView: vscode.WebviewView): Promise<void> {
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.extensionUri]
        };

        const status = await this.gitService.getGitStatus();
        const log = await this.gitService.getLog();
        webviewView.webview.html = this.generateLogHtml(log, status);

        webviewView.webview.onDidReceiveMessage(async (message) => {
            if (message.command === 'switchToTerminal') {
                this.showTerminalLog();
            }
        });

        gitChangeEmitter.event(async () => {
            await this.updateView();
        });

        try {
            await this.updateView();
        } catch (error) {
            webviewView.webview.html = this.generateErrorHtml(error as Error);
        }
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
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>🌳 Git Log</title>
                <style>
                    .status-panel {
                        background: var(--vscode-editor-inactiveSelectionBackground);
                        border-radius: 6px;
                        padding: 12px;
                        margin: 16px 0;
                        display: grid;
                        grid-template-columns: repeat(3, 1fr);
                        gap: 16px;
                    }
                    .status-item {
                        display: flex;
                        flex-direction: column;
                        gap: 4px;
                    }
                    .status-label {
                        font-size: 12px;
                        color: var(--vscode-descriptionForeground);
                        text-transform: uppercase;
                        letter-spacing: 0.5px;
                    }
                    .status-value {
                        font-size: 14px;
                        font-weight: 500;
                        color: var(--vscode-foreground);
                    }
                    .branch-indicator {
                        color: #3794ff;
                        font-family: monospace;
                    }
                     .git-log pre {
                        font-family: 'Consolas', 'Courier New', monospace;
                        white-space: pre;
                        word-wrap: normal;
                        padding: 10px;
                        margin: 0;
                        background: var(--vscode-editor-background);
                        overflow-x: auto;
                        line-height: 1.4;
                    }
                </style>
                <script>
                    const vscode = acquireVsCodeApi();
                    document.addEventListener('DOMContentLoaded', () => {
                        const terminalButton = document.getElementById('switchToTerminal');
                        if (terminalButton) {
                            terminalButton.addEventListener('click', () => {
                                vscode.postMessage({ command: 'switchToTerminal' });
                            });
                        }
                    });
                </script>
            </head>
            <body>
                <h2>🌳 Git Log</h2>
                <div class="status-panel">
                    <div class="status-item">
                        <span class="status-label">Current Branch</span>
                        <span class="status-value branch-indicator">${this.escapeHtml(status.branch)}</span>
                    </div>
                    <div class="status-item">
                        <span class="status-label">User</span>
                        <span class="status-value">${this.escapeHtml(status.user)}</span>
                    </div>
                    <div class="status-item">
                        <span class="status-label">Last Updated</span>
                        <span class="status-value">${this.escapeHtml(status.timestamp)}</span>
                    </div>
                </div>
                ${this.formatLogWithStyle(log)}
            </body>
            </html>
        `;
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
import * as vscode from 'vscode';
import { GitService } from '../services/gitService';

export class LogViewProvider implements vscode.WebviewViewProvider {
    constructor(private readonly extensionUri: vscode.Uri, private readonly gitService: GitService) { }

    async resolveWebviewView(webviewView: vscode.WebviewView): Promise<void> {
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.extensionUri]
        };

        try {
            const log = await this.gitService.getLog();
            const status = await this.gitService.getGitStatus();
            webviewView.webview.html = this.generateLogHtml(log, status);

            webviewView.webview.onDidReceiveMessage(async message => {
                if (message.command === 'refresh') {
                    const refreshedLog = await this.gitService.getLog();
                    const refreshedStatus = await this.gitService.getGitStatus();
                    webviewView.webview.html = this.generateLogHtml(refreshedLog, refreshedStatus);
                } else if (message.command === 'showCommitDetails') {
                    const commitDetails = await this.gitService.getCommitDetails(message.hash);
                    webviewView.webview.postMessage({
                        command: 'updateCommitDetails',
                        details: commitDetails
                    });
                }
            });
        } catch (error) {
            webviewView.webview.html = this.generateErrorHtml(error as Error);
        }
    }

    private formatLogWithStyle(log: string): string {
        if (!log) {
            return '<div class="empty-state">No commits to display</div>';
        }

        return `
            <div class="git-log">
                <pre>${log}</pre>
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
                    /* ... existing styles ... */
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
                </style>
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
}
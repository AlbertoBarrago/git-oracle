import * as vscode from 'vscode';
import { GitService } from '../services/gitService';
import { gitChangeEmitter } from '../extension';
import { Views } from './helper';

export class LogViewProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;
    private terminal: vscode.Terminal | undefined;
    private updateTimeout: NodeJS.Timeout | undefined;
    private lastUpdate: number = 0;
    private readonly UPDATE_DEBOUNCE = 1000;
    private cachedHtml: string | undefined;

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
        } else {
            try {
                const status = await this.gitService.getGitStatus();
                webviewView.webview.html = this.generateLogHtml(status);
                this.cachedHtml = this.generateLogHtml(status);
            } catch (error) {
                console.error('Failed to initialize status view:', error);
                webviewView.webview.html = this.generateErrorHtml(error as Error);
            }
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
        if (!this._view) return;

        if (this.updateTimeout) {
            clearTimeout(this.updateTimeout);
        }

        const now = Date.now();
        if (now - this.lastUpdate < this.UPDATE_DEBOUNCE) {
            this.updateTimeout = setTimeout(() => this.updateView(), this.UPDATE_DEBOUNCE);
            return;
        }

        try {
            const status = await this.gitService.getGitStatus();
            const newHtml = this.generateLogHtml(status);
            
            if (this.cachedHtml !== newHtml) {
                this._view.webview.html = newHtml;
                this.cachedHtml = newHtml;
            }
            
            this.lastUpdate = now;
        } catch (error) {
            console.error('Failed to update view:', error);
        }
    }

    async refresh(): Promise<string> {
        this.cachedHtml = undefined;
        this.lastUpdate = 0;
        if (this.updateTimeout) {
            clearTimeout(this.updateTimeout);
        }
        
        try {
            const status = await this.gitService.getGitStatus();
            const html = this.generateLogHtml(status);
            
            if (this._view) {
                this._view.webview.html = html;
                this.cachedHtml = html;
                vscode.window.showInformationMessage('Status Updated 🫡');
            }
            
            return html;
        } catch (error) {
            console.error('Error updating status:', error);
            throw error;
        }
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

    private escapeHtml(unsafe: string): string {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    private generateErrorHtml(error: Error): string {
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body {
                        font-family: var(--vscode-font-family);
                        color: var(--vscode-foreground);
                        padding: 20px;
                        text-align: center;
                    }
                    .error-container {
                        background: var(--vscode-inputValidation-errorBackground);
                        border: 1px solid var(--vscode-inputValidation-errorBorder);
                        padding: 15px;
                        border-radius: 5px;
                        margin-top: 20px;
                    }
                    .error-icon {
                        font-size: 48px;
                        margin-bottom: 10px;
                    }
                    .error-message {
                        color: var(--vscode-inputValidation-errorForeground);
                        margin-bottom: 15px;
                    }
                    .action-button {
                        background: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                        border: none;
                        padding: 8px 16px;
                        border-radius: 2px;
                        cursor: pointer;
                    }
                </style>
            </head>
            <body>
                <div class="error-container">
                    <div class="error-icon">⚠️</div>
                    <h3>Error Loading Git Status</h3>
                    <div class="error-message">${this.escapeHtml(error.message)}</div>
                    <button class="action-button" onclick="refresh()">Retry</button>
                </div>
                <script>
                    const vscode = acquireVsCodeApi();
                    function refresh() {
                        vscode.postMessage({ command: 'refresh' });
                    }
                </script>
            </body>
            </html>
        `;
    }

    dispose() {
        if (this.updateTimeout) {
            clearTimeout(this.updateTimeout);
        }
        this.terminal?.dispose();
    }
}
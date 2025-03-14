import * as vscode from 'vscode';
import { GitService } from '../services/gitService';
import {gitChangeEmitter} from '../extension'

export class CherryPickViewProvider implements vscode.WebviewViewProvider {
    constructor(private readonly extensionUri: vscode.Uri, private readonly gitService: GitService) { }

    async resolveWebviewView(webviewView: vscode.WebviewView): Promise<void> {
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.extensionUri]
        };

        gitChangeEmitter.event(async () => {
            await this.refresh();
        });

        try {
            const commits = await this.gitService.getCommitHistory();
            webviewView.webview.html = this.generateCherryPickHtml(commits);

            webviewView.webview.onDidReceiveMessage(async message => {
                switch (message.command) {
                    case 'refresh':
                        const refreshedCommits = await this.gitService.getCommitHistory();
                        webviewView.webview.html = this.generateCherryPickHtml(refreshedCommits);
                        return;
                    case 'cherryPick':
                        await this.performCherryPick(message.commit);
                        return;
                }
            });
        } catch (error) {
            webviewView.webview.html = this.generateErrorHtml(error as Error);
        }
    }

    async refresh(): Promise<string> {
        const refreshedCommits = await this.gitService.getCommitHistory();
        return this.generateCherryPickHtml(refreshedCommits);
    }

    private generateCherryPickHtml(commits: { hash: string; author: string; date: string; message: string; }[]): string {
        const commitRows = commits.map(commit => `
            <tr>
                <td style="width: 80px;">${commit.hash.substring(0, 7)} - ${commit.author}</td>
                <td style="width: 100px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100px;" title="${commit.date}">${commit.date}</td>
                <td style="width: 100px;">
                    <button onclick="cherryPick('${commit.hash}')">Cherry Pick</button>
                </td>
            </tr>
        `).join('');

        return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>🍒 Cherry Pick </title>
                <style>
                    body {
                        font-family: var(--vscode-font-family);
                       color: var(--vscode-foreground);
                        background-color: var(--vscode-editor-background);
                        padding: 10px;
                    }
                    table {
                        width: 100%;
                        border-collapse: collapse;
                    }
                    th, td {
                        padding: 8px;
                        text-align: left;
                        border-bottom: 1px solid var(--vscode-panel-border);
                    }
                    th {
                        background-color: var(--vscode-editor-inactiveSelectionBackground);
                    }
                  button {
                        background-color: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                        border: none;
                        padding: 6px 12px;
                        cursor: pointer;
                        margin-left: 4px;
                        border-radius: 4px;
                        font-size: 12px;
                        transition: all 0.2s ease;
                        display: inline-flex;
                        align-items: center;
                        gap: 4px;
                    }

                    button:hover {
                        background-color: var(--vscode-button-hoverBackground);
                        transform: translateY(-1px);
                        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
                    }

                    button:active {
                        transform: translateY(0);
                        box-shadow: none;
                    }

                    button[disabled] {
                        opacity: 0.5;
                        cursor: not-allowed;
                        transform: none;
                        box-shadow: none;
                    }

                    button.danger {
                        background-color: var(--vscode-errorForeground);
                    }

                    button.primary {
                        background-color: var(--vscode-button-background);
                        font-weight: 500;
                    }

                </style>
            </head>
            <body>
                <h2>🍒 Cherry Pick</h2>
                <p>Here you can select a commit from any branch and apply those changes to your current branch. 
                This is useful when you want to bring specific changes from one branch to another without merging the entire branch.</p>
                <div style="margin-top: 10px; margin-bottom: 10px; overflow: auto; max-height: 500px;">
                    <table>
                        <thead>
                            <tr>
                                <th>Commit</th>
                                <th>Date</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${commitRows}
                        </tbody>
                    </table>
                </div>
                <script>
                    const vscode = acquireVsCodeApi();
                    
                    function refresh() {
                        vscode.postMessage({
                            command: 'refresh'
                        });
                    }
                    
                    function cherryPick(commitHash) {
                        vscode.postMessage({
                            command: 'cherryPick',
                            commit: commitHash
                        });
                    }
                </script>
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
                <title>Git Cherry Pick - Error</title>
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
                    button {
                        background-color: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                        border: none;
                        padding: 5px 10px;
                        cursor: pointer;
                    }
                    button:hover {
                        background-color: var(--vscode-button-hoverBackground);
                    }
                </style>
            </head>
            <body>
                <h2>Git Cherry Pick</h2>
                <div class="error">
                    <h3>Error</h3>
                    <p>${this.escapeHtml(error.message)}</p>
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

    private async performCherryPick(commitHash: string): Promise<void> {
        try {
            const success = await this.gitService.cherryPick(commitHash);
            if (success) {
                vscode.window.showInformationMessage(`Successfully cherry-picked commit ${commitHash}`);
            } else {
                vscode.window.showErrorMessage(`Failed to cherry-pick commit ${commitHash}`);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Cherry-pick failed: ${(error as Error).message}`);
        }
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
import * as vscode from 'vscode';
import { GitService } from './gitService';

export class BranchViewProvider implements vscode.WebviewViewProvider {
    constructor(private readonly extensionUri: vscode.Uri, private readonly gitService: GitService) {}

    async resolveWebviewView(webviewView: vscode.WebviewView): Promise<void> {
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.extensionUri]
        };

        try {
            const localBranches = await this.gitService.getLocalBranches();
            const remoteBranches = await this.gitService.getRemoteBranches();

            webviewView.webview.html = this.generateBranchesHtml(localBranches, remoteBranches);

            webviewView.webview.onDidReceiveMessage(async message => {
                switch (message.command) {
                    case 'refresh':
                        const refreshedLocal = await this.gitService.getLocalBranches();
                        const refreshedRemote = await this.gitService.getRemoteBranches();
                        webviewView.webview.html = this.generateBranchesHtml(refreshedLocal, refreshedRemote);
                        break;
                    case 'checkout':
                        await this.gitService.checkoutBranch(message.branch);
                        vscode.window.showInformationMessage(`Switched to branch '${message.branch}'`);
                        break;
                    case 'delete':
                        await this.gitService.deleteBranch(message.branch);
                        vscode.window.showInformationMessage(`Deleted branch '${message.branch}'`);
                        break;
                }
            });
        } catch (error) {
            webviewView.webview.html = this.generateErrorHtml(error as Error);
        }
    }

    private generateBranchesHtml(localBranches: string[], remoteBranches: Map<string, string[]>): string {
        // Generate local branches HTML
        const localBranchesHtml = localBranches.map(branch => `
            <div class="branch-item">
                <span class="branch-icon">🔸</span>
                <span>${this.escapeHtml(branch)}</span>
                <div class="branch-actions">
                    <button onclick="checkout('${this.escapeHtml(branch)}')">Checkout</button>
                    <button onclick="deleteBranch('${this.escapeHtml(branch)}')">Delete</button>
                </div>
            </div>
        `).join('');
    
        // Generate remote branches HTML grouped by remote with collapsible sections
        let remoteBranchesHtml = '';
        remoteBranches.forEach((branches, remoteName) => {
            const remoteId = `remote-${remoteName.replace(/[^a-zA-Z0-9]/g, '-')}`;
            remoteBranchesHtml += `
                <div class="remote-section">
                    <div class="remote-header" onclick="toggleRemote('${remoteId}')">
                        <span class="toggle-icon">▶</span>
                        <h4>${this.escapeHtml(remoteName)}</h4>
                    </div>
                    <div id="${remoteId}" class="remote-branches">
                        ${branches.map(branch => `
                            <div class="branch-item">
                                <span class="branch-icon">🔹</span>
                                <span>${this.escapeHtml(branch)}</span>
                                <div class="branch-actions">
                                    <button onclick="checkout('${remoteName}/${this.escapeHtml(branch)}')">Checkout</button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        });
    
        return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Git Branches</title>
                <style>
                    body {
                        font-family: var(--vscode-font-family);
                        color: var(--vscode-foreground);
                        background-color: var(--vscode-editor-background);
                        padding: 10px;
                    }
                    .branch-section {
                        margin-bottom: 20px;
                    }
                    .remote-section {
                        margin-bottom: 10px;
                    }
                    .remote-header {
                        display: flex;
                        align-items: center;
                        cursor: pointer;
                        padding: 5px;
                        background-color: var(--vscode-sideBar-background);
                        border-radius: 3px;
                    }
                    .remote-header:hover {
                        background-color: var(--vscode-list-hoverBackground);
                    }
                    .remote-branches {
                        margin-left: 20px;
                        border-left: 1px solid var(--vscode-panel-border);
                        padding-left: 10px;
                        display: none;
                    }
                    .branch-item {
                        display: flex;
                        align-items: center;
                        padding: 5px;
                        cursor: pointer;
                    }
                    .branch-item:hover {
                        background-color: var(--vscode-list-hoverBackground);
                    }
                    .branch-actions {
                        margin-left: auto;
                    }
                    button {
                        background-color: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                        border: none;
                        padding: 4px 8px;
                        cursor: pointer;
                        margin-left: 4px;
                    }
                    button:hover {
                        background-color: var(--vscode-button-hoverBackground);
                    }
                    .branch-icon {
                        margin-right: 8px;
                    }
                    .toggle-icon {
                        margin-right: 5px;
                        transition: transform 0.2s;
                    }
                    h4 {
                        margin: 0;
                    }
                </style>
            </head>
            <body>
                <h2>Git Branches</h2>
                
                <div class="branch-section">
                    <h3>Local Branches</h3>
                    ${localBranchesHtml}
                </div>
    
                <div class="branch-section">
                    <h3>Remote Branches</h3>
                    ${remoteBranchesHtml}
                </div>
    
                <script>
                    const vscode = acquireVsCodeApi();
                    
                    function refresh() {
                        vscode.postMessage({ command: 'refresh' });
                    }
    
                    function checkout(branch) {
                        vscode.postMessage({ command: 'checkout', branch });
                    }
    
                    function deleteBranch(branch) {
                        if (confirm('Are you sure you want to delete this branch?')) {
                            vscode.postMessage({ command: 'delete', branch });
                        }
                    }
                    
                    function toggleRemote(remoteId) {
                        const element = document.getElementById(remoteId);
                        const header = element.previousElementSibling;
                        const icon = header.querySelector('.toggle-icon');
                        
                        if (element.style.display === 'block') {
                            element.style.display = 'none';
                            icon.textContent = '▶';
                            icon.style.transform = 'rotate(0deg)';
                        } else {
                            element.style.display = 'block';
                            icon.textContent = '▼';
                            icon.style.transform = 'rotate(90deg)';
                        }
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
                <title>Git Branches - Error</title>
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

    private escapeHtml(unsafe: string): string {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
}

export class LogViewProvider implements vscode.WebviewViewProvider {
    constructor(private readonly extensionUri: vscode.Uri, private readonly gitService: GitService) {}

    async resolveWebviewView(webviewView: vscode.WebviewView): Promise<void> {
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.extensionUri]
        };
        
        try {
            const log = await this.gitService.getLog();
            webviewView.webview.html = this.generateLogHtml(log);
            
            webviewView.webview.onDidReceiveMessage(async message => {
                if (message.command === 'refresh') {
                    const refreshedLog = await this.gitService.getLog();
                    webviewView.webview.html = this.generateLogHtml(refreshedLog);
                } else if (message.command === 'showCommitDetails') {
                    vscode.window.showInformationMessage(`Commit: ${message.hash}\nAuthor: ${message.author}\nMessage: ${message.message}`);
                }
            });
        } catch (error) {
            webviewView.webview.html = this.generateErrorHtml(error as Error);
        }
    }

    private generateLogHtml(log: string): string {
        return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Git Log</title>
                <style>
                    body {
                        font-family: var(--vscode-font-family);
                        color: var(--vscode-foreground);
                        background-color: var(--vscode-editor-background);
                        padding: 0;
                        margin: 0;
                        line-height: 1.4;
                    }
                    /* Proper CSS comment format */
                    .log-container {
                        overflow: auto;
                        height: 100vh;
                    }
                    .commit-entry {
                        display: flex;
                        align-items: center;
                        padding: 4px 8px;
                        border-bottom: 1px solid transparent;
                        cursor: pointer;
                        position: relative;
                    }
                    .commit-entry:hover {
                        background-color: var(--vscode-list-hoverBackground);
                    }
                    .commit-dot {
                        color: #3794ff;
                        font-size: 18px;
                        margin-right: 8px;
                        line-height: 0;
                    }
                    .commit-graph {
                        color: #3794ff;
                        font-family: monospace;
                        margin-right: 8px;
                        display: inline-block;
                        line-height: 1;
                        margin: 0;
                        padding: 0;
                    }
                    .commit-message {
                        color: var(--vscode-foreground);
                        flex-grow: 1;
                        white-space: nowrap;
                        overflow: hidden;
                        text-overflow: ellipsis;
                    }
                    .commit-author {
                        color: var(--vscode-descriptionForeground);
                        margin-left: 8px;
                        font-size: 0.9em;
                    }
                    .branch-tag {
                        display: inline-block;
                        background-color: var(--vscode-badge-background);
                        color: var(--vscode-badge-foreground);
                        border-radius: 10px;
                        padding: 1px 6px;
                        font-size: 0.8em;
                        margin-left: 8px;
                    }
                    .commit-line {
                        position: absolute;
                        left: 9px;
                        width: 2px;
                        background-color: #3794ff;
                        opacity: 0.6;
                        z-index: 0;
                        top: 0;
                        bottom: 0;
                    }
                    .commit-container {
                        position: relative;
                    }
                </style>
            </head>
            <body>
                <div class="log-container">
                    ${this.formatLogWithStyle(log)}
                </div>
                <script>
                    const vscode = acquireVsCodeApi();
                    
                    function showCommitDetails(hash, author, message) {
                        vscode.postMessage({ 
                            command: 'showCommitDetails',
                            hash: hash,
                            author: author,
                            message: message
                        });
                    }
                </script>
            </body>
            </html>
        `;
    }

    private formatLogWithStyle(log: string): string {
        const lines = log.split('\n');
        let formattedLog = '';
        
        for (const line of lines) {
            // Updated regex to match the new git log format
            const match = line.match(/^(.*?)([a-f0-9]+) (\d{4}-\d{2}-\d{2}) \| ([^[]+)(?:\((.*?)\))? \[(.+?)\]$/);
            
            if (match) {
                const graphChars = match[1] || '';
                const hash = match[2];
                const date = match[3];
                const message = match[4].trim();
                const branchInfo = match[5];
                const author = match[6];
                
                let branchTag = '';
                if (branchInfo) {
                    const headMatch = branchInfo.match(/HEAD -> ([^,]+)/);
                    if (headMatch) {
                        branchTag = `<span class="branch-tag">${this.escapeHtml(headMatch[1])}</span>`;
                    }
                }
                
                formattedLog += `
                    <div class="commit-entry" onclick="showCommitDetails('${hash}', '${this.escapeHtml(author)}', '${this.escapeHtml(message)}')">
                        <pre class="commit-graph">${this.formatGraphChars(graphChars)}</pre>
                        <span class="commit-message">${this.escapeHtml(message)}${branchTag}</span>
                        <span class="commit-author">${this.escapeHtml(author)}</span>
                    </div>
                `;
            }
        }
        
        return formattedLog;
    }
    
    private formatGraphChars(graphChars: string): string {
        if (!graphChars) return '';
        console.log(graphChars)
        return graphChars
            .replace(/\*/g, '●')
            .replace(/\|/g, '│')
            .replace(/[/]/g, '╱')
            .replace(/[\\]/g, '╲')
            .replace(/ /g, '&nbsp;');
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

export class CherryPickViewProvider implements vscode.WebviewViewProvider {
    constructor(private readonly extensionUri: vscode.Uri, private readonly gitService: GitService) {}

    async resolveWebviewView(webviewView: vscode.WebviewView): Promise<void> {
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.extensionUri]
        };
        
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

    private generateCherryPickHtml(commits: { hash: string; author: string; date: string; message: string; }[]): string {
        const commitRows = commits.map(commit => `
            <tr>
                <td>${commit.hash.substring(0, 7)}</td>
                <td>${commit.author}</td>
                <td>${commit.date}</td>
                <td>${this.escapeHtml(commit.message)}</td>
                <td>
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
                <title>Git Cherry Pick</title>
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
                <div style="margin-top: 10px; margin-bottom: 10px; overflow: auto; max-height: 500px;">
                    <table>
                        <thead>
                            <tr>
                                <th>Commit</th>
                                <th>Author</th>
                                <th>Date</th>
                                <th>Message</th>
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
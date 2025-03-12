import * as vscode from 'vscode';
import { GitService } from './gitService';

export class BranchViewProvider implements vscode.WebviewViewProvider {
    constructor(private readonly extensionUri: vscode.Uri, private readonly gitService: GitService) { }

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
                    case 'createBranch':
                        try {
                            await this.gitService.createBranch(message.branch);
                            vscode.window.showInformationMessage(`Created branch '${message.branch}'`);
                            const refreshedBranchLocal = await this.gitService.getLocalBranches();
                            const refreshedBranchRemote = await this.gitService.getRemoteBranches();
                            webviewView.webview.html = this.generateBranchesHtml(refreshedBranchLocal, refreshedBranchRemote);
                        } catch (error) {
                            vscode.window.showErrorMessage(`Failed to create branch: ${error}`);
                        }
                        break;
                    case 'refresh':
                        try {
                            const refreshedLocal = await this.gitService.getLocalBranches();
                            const refreshedRemote = await this.gitService.getRemoteBranches();
                            webviewView.webview.html = this.generateBranchesHtml(refreshedLocal, refreshedRemote);
                        } catch (error) {
                            vscode.window.showErrorMessage(`Failed to refresh branches: ${error}`);
                        }
                        break;
                    case 'switch':
                        try {
                            await this.gitService.checkoutBranch(message.branch);
                            vscode.window.showInformationMessage(`Switched to branch '${message.branch}'`);
                        } catch (error) {
                            vscode.window.showErrorMessage(`Failed to checkout branch: ${error}`);
                        }
                        break;
                    case 'delete':
                        try {
                            await this.gitService.deleteBranch(message.branch);
                            vscode.window.showInformationMessage(`Deleted branch '${message.branch}'`);
                        } catch (error) {
                            vscode.window.showErrorMessage(`Failed to delete branch: ${error}`);
                        }
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
                    <button onclick="switch('${this.escapeHtml(branch)}')">Switch</button>
                    ${branch !== 'develop' ?
                `<button onclick="confirmDelete('${this.escapeHtml(branch)}')">Delete</button>` :
                '<button disabled title="Cannot delete develop branch" style="opacity: 0.5">Delete</button>'
            }
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
                                    <button onclick="switch('${remoteName}/${this.escapeHtml(branch)}')">Switch</button>
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

                    .modal {
                        display: none;
                        position: fixed;
                        top: 50%;
                        left: 50%;
                        transform: translate(-50%, -50%);
                        background: var(--vscode-editor-background);
                        padding: 30px;
                        border: 1px solid var(--vscode-panel-border);
                        box-shadow: 0 0 10px rgba(0,0,0,0.5);
                        z-index: 1000;
                        min-width: 350px;
                        width: 50%;
                        max-width: 500px;
                    }
                    
                    .modal-buttons {
                        margin-top: 15px;
                        display: flex;
                        justify-content: flex-end;
                        gap: 10px;
                    }
                    
                    .overlay {
                        display: none;
                        position: fixed;
                        top: 0;
                        left: 0;
                        right: 0;
                        bottom: 0;
                        background: rgba(0,0,0,0.5);
                        z-index: 999;
                    }
                        .branch-form {
                            display: flex;
                            flex-direction: column;
                            gap: 12px;
                        }

                        .form-group {
                            display: flex;
                            flex-direction: column;
                            gap: 4px;
                        }

                        .form-group label {
                            font-size: 12px;
                            color: var(--vscode-foreground);
                        }

                        .form-group input {
                            padding: 6px 8px;
                            background: var(--vscode-input-background);
                            color: var(--vscode-input-foreground);
                            border: 1px solid var(--vscode-input-border);
                            border-radius: 4px;
                        }

                        .form-group input:focus {
                            outline: none;
                            border-color: var(--vscode-focusBorder);
                        }

                        .error-text {
                            color: var(--vscode-errorForeground);
                            font-size: 12px;
                            margin-top: 4px;
                        }
                </style>
            </head>
            <body>
                <h2>Git Branches</h2>
                <p>Here you can manage your Git branches, create new one, swtiching</p>

                <button onclick="showNewBranchModal()" class="primary">Create Branch</button>

                <div class="branch-section">
                    <h3>Local Branches</h3>
                    ${localBranchesHtml}
                </div>
    
                <div class="branch-section">
                    <h3>Remote Branches</h3>
                    ${remoteBranchesHtml}
                </div>

                <div id="deleteModal" class="modal">
                    <h3>Confirm Delete</h3>
                    <p>Are you sure you want to delete branch: <span id="branchToDelete"></span>?</p>
                    <div class="modal-buttons">
                        <button onclick="cancelDelete()">Cancel</button>
                        <button onclick="proceedDelete()" style="background: var(--vscode-errorForeground);">Delete</button>
                    </div>
                </div>
                <div id="overlay" class="overlay"></div>

                <div id="newBranchModal" class="modal">
                    <h3>Create New Branch 🪄</h3>
                    <div class="branch-form">
                        <div class="form-group">
                            <label for="branchType">Branch Type</label>
                            <select id="branchType" onchange="updateBranchPreview()">
                                <option value="feature">Feature</option>
                                <option value="bugfix">Bugfix</option>
                                <option value="hotfix">Hotfix</option>
                                <option value="release">Release</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="branchName">Branch Name</label>
                            <input type="text" id="branchName" 
                                placeholder="e.g., add-user-authentication"
                                onkeyup="updateBranchPreview()"
                                pattern="[a-z0-9-]+"
                            />
                            <small class="error-text" id="nameError" style="display: none;">
                                Branch name can only contain lowercase letters, numbers, and hyphens
                            </small>
                        </div>
                        <div class="form-group">
                            <label>Preview</label>
                            <div id="branchPreview" style="font-family: monospace;"></div>
                        </div>
                        <div class="modal-buttons">
                            <button onclick="cancelNewBranch()">Cancel</button>
                            <button class="primary" onclick="createNewBranch()">Create Branch</button>
                        </div>
                    </div>
                </div>
    
                <script>
                    const vscode = acquireVsCodeApi();
                    
                    function refresh() {
                        vscode.postMessage({ command: 'refresh' });
                    }
    
                    // In the script section, modify the switch function name to switchBranch
                    function switchBranch(branch) {
                        vscode.postMessage({ command: 'switchBranch', branch });
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
                        let currentBranch = '';
                    
                    function confirmDelete(branch) {
                        currentBranch = branch;
                        document.getElementById('branchToDelete').textContent = branch;
                        document.getElementById('deleteModal').style.display = 'block';
                        document.getElementById('overlay').style.display = 'block';
                    }
                    
                    function cancelDelete() {
                        document.getElementById('deleteModal').style.display = 'none';
                        document.getElementById('overlay').style.display = 'none';
                        currentBranch = '';
                    }
                    
                    function proceedDelete() {
                        if (currentBranch) {
                            vscode.postMessage({ command: 'delete', branch: currentBranch });
                            cancelDelete();
                        }
                    }

                    function showNewBranchModal() {
                        document.getElementById('newBranchModal').style.display = 'block';
                        document.getElementById('overlay').style.display = 'block';
                        updateBranchPreview();
                    }

                    function cancelNewBranch() {
                        document.getElementById('newBranchModal').style.display = 'none';
                        document.getElementById('overlay').style.display = 'none';
                        document.getElementById('branchName').value = '';
                    }
                    
                    function updateBranchPreview() {
                        const type = document.getElementById('branchType').value;
                        const name = document.getElementById('branchName').value;
                        const preview = document.getElementById('branchPreview');
                        const nameError = document.getElementById('nameError');
                        
                        const namePattern = /^[a-z0-9-]+$/;
                        const isValidName = namePattern.test(name) || name === '';
                        
                        nameError.style.display = isValidName ? 'none' : 'block';

                        if (isValidName) {
                            preview.textContent = \`\${type}/\${name}\`;
                        }
                    }

                    function createNewBranch() {
                        const type = document.getElementById('branchType').value;
                        const name = document.getElementById('branchName').value;

                       if (!name) {
                            document.getElementById('nameError').textContent = 'Branch name is required';
                            document.getElementById('nameError').style.display = 'block';
                            return;
                        }

                        const namePattern = /^[a-z0-9-]+$/;
                        if (!namePattern.test(name)) {
                            return;
                        }

                        vscode.postMessage({ command: 'create', branch: \`\${type}/\${name}\` });
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
    constructor(private readonly extensionUri: vscode.Uri, private readonly gitService: GitService) { }

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
    constructor(private readonly extensionUri: vscode.Uri, private readonly gitService: GitService) { }

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
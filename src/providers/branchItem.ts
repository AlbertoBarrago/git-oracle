import * as vscode from 'vscode';
import { GitService } from '../services/gitService';

export class BranchViewProvider implements vscode.WebviewViewProvider {
    constructor(private readonly extensionUri: vscode.Uri, private readonly gitService: GitService) {  }

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
        const groupedLocalBranches = this.groupBranchesByPrefix(localBranches);

        const localBranchesHtml = Object.entries(groupedLocalBranches).map(([prefix, branches]) => {
            const groupId = `local-${prefix.replace(/[^a-zA-Z0-9]/g, '-')}`;
            return `
                <div class="branch-group">
                    <div class="group-header" onclick="toggleGroup('${groupId}')">
                        <span class="toggle-icon">▶</span>
                        <span class="group-name">
                            ${prefix.includes('feature') ? '✨' :
                    prefix.includes('bugfix') ? '🐛' :
                        prefix.includes('hotfix') ? '🚨' :
                            prefix.includes('release') ? '🚀' :
                                prefix.includes('develop') ? '🛠️' : '📁'} 
                            ${prefix.replace('/', '')}
                        </span>
                        <span class="branch-count">${branches.length}</span>
                    </div>
                    <div id="${groupId}" class="group-content">
                        ${branches.map(branch => `
                            <div class="branch-item">
                                <span class="branch-icon">
                                    ${branch.includes('feature') ? '✨' :
                                        branch.includes('bugfix') ? '🐛' :
                                            branch.includes('hotfix') ? '🚨' :
                                                branch.includes('release') ? '🚀' :
                                                    branch.includes('develop') ? '🛠️' : '📁'}
                                </span>
                                <span>${this.escapeHtml(branch)}</span>
                                <div class="branch-actions">
                                    <button onclick="switchBranch('${this.escapeHtml(branch)}')" class="action-button">
                                        🔄 Switch
                                    </button>
                                    ${branch !== 'develop' ?
                                        `<button onclick="confirmDelete('${this.escapeHtml(branch)}')" class="action-button danger">
                                            🗑️ Delete
                                        </button>` :
                                        '<button disabled title="Cannot delete develop branch" class="action-button" style="opacity: 0.5">🗑️ Delete</button>'
                                    }
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }).join('');

        // Generate HTML for remote branches
        const remoteBranchesHtml = Array.from(remoteBranches.entries()).map(([remote, branches]) => {
            const remoteId = `remote-${remote.replace(/[^a-zA-Z0-9]/g, '-')}`;
            const groupedRemoteBranches = this.groupBranchesByPrefix(branches);

            return `
                <div class="remote-group">
                    <div class="group-header" onclick="toggleGroup('${remoteId}')">
                        <span class="toggle-icon">▶</span>
                        <span class="group-name">${remote}</span>
                        <span class="branch-count">${branches.length}</span>
                    </div>
                    <div id="${remoteId}" class="group-content">
                        ${Object.entries(groupedRemoteBranches).map(([prefix, prefixBranches]) => {
                const subGroupId = `${remoteId}-${prefix.replace(/[^a-zA-Z0-9]/g, '-')}`;
                return `
                                <div class="branch-subgroup">
                                    <div class="subgroup-header" onclick="toggleGroup('${subGroupId}')">
                                        <span class="toggle-icon">▶</span>
                                        <span class="group-name">${prefix.replace('/', ' ')}</span>
                                        <span class="branch-count"> ${prefixBranches.length}</span>
                                    </div>
                                    <div id="${subGroupId}" class="group-content">
                                        ${prefixBranches.map(branch => `
                                            <div class="branch-item" oncontextmenu="event.preventDefault(); showRemoteBranchMenu(event, '${this.escapeHtml(branch)}')">
                                                <span class="branch-icon">🔹</span>
                                                <span>${this.escapeHtml(branch)}</span>
                                            </div>
                                        `).join('')}
                                    </div>
                                </div>
                            `;
            }).join('')}
                    </div>
                </div>
            `;
        }).join('');


        const additionalStyles = `
            .group-content {
                display: none;
                margin-left: 20px;
                padding-left: 10px;
                border-left: 1px solid var(--vscode-panel-border);
            }
            .toggle-icon {
                display: inline-block;
                width: 16px;
                transition: transform 0.2s ease;
            }
            .toggle-icon.rotated {
                transform: rotate(90deg);
            }
            .remote-group {
                margin-bottom: 8px;
            }
            .branch-subgroup {
                margin-left: 16px;
            }
            .subgroup-header {
                display: flex;
                align-items: center;
                padding: 6px;
                cursor: pointer;
                opacity: 0.8;
            }
            .subgroup-header:hover {
                opacity: 1;
                background: var(--vscode-list-hoverBackground);
            }
        `;

        const updatedToggleScript = `
            function toggleGroup(groupId) {
                const element = document.getElementById(groupId);
                const header = element.previousElementSibling;
                const icon = header.querySelector('.toggle-icon');
                
                if (element.style.display === 'block') {
                    element.style.display = 'none';
                    icon.classList.remove('rotated');
                } else {
                    element.style.display = 'block';
                    icon.classList.add('rotated');
                }
            }
        `;

        return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>🚇 Branches</title>
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
                        ${additionalStyles}

                        .context-menu-item {
                            display: flex;
                            padding: 6px 12px;
                            cursor: pointer;
                            border-radius: 4px;
                            transition: background-color 0.2s ease;
                        }
                </style>
            </head>
            <body>
                <h2>🚇 Branches</h2>
                <p>Here you can manage your Git branches: create new ones, switch between branches, and delete existing branches.</p>

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
                    <h3>🪄 Create New Branch</h3>
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
                    
                    ${updatedToggleScript} 
                    
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

                     function showRemoteBranchMenu(event, branch) {
                        event.preventDefault();
                        const menu = document.getElementById('remoteBranchMenu');
                        menu.style.display = 'block';
                        menu.style.left = event.pageX + 'px';
                        menu.style.top = event.pageY + 'px';
                        
                        // Store the selected branch for use in menu actions
                        window.selectedBranch = branch;
                        
                        // Close menu when clicking outside
                        document.addEventListener('click', closeContextMenu);
                        return false;
                    }

                    function closeContextMenu() {
                        document.getElementById('remoteBranchMenu').style.display = 'none';
                        document.removeEventListener('click', closeContextMenu);
                    }

                    function mergeWithDevelop() {
                        vscode.postMessage({ 
                            command: 'merge',
                            source: window.selectedBranch,
                            target: 'develop'
                        });
                        closeContextMenu();
                    }

                    function rebaseWithDevelop() {
                        vscode.postMessage({ 
                            command: 'rebase',
                            source: window.selectedBranch,
                            target: 'develop'
                        });
                        closeContextMenu();
                    }

                    function cherryPickBranch() {
                        vscode.postMessage({ 
                            command: 'cherryPick',
                            branch: window.selectedBranch
                        });
                        closeContextMenu();
                    }
                        
                </script>
                <div id="remoteBranchMenu" class="context-menu" style="display: none;">
                    <div class="context-menu-item" onclick="mergeWithDevelop()">
                        🔄 Merge with develop
                    </div>
                    <div class="context-menu-item" onclick="rebaseWithDevelop()">
                        📥 Rebase with develop
                    </div>
                    <div class="context-menu-item" onclick="cherryPickBranch()">
                        🍒 Cherry-pick
                    </div>
                </div>
            </body>
            </html>
        `;
    }

    private groupBranchesByPrefix(branches: string[]): Record<string, string[]> {
        const groups: Record<string, string[]> = {};

        branches.forEach(branch => {
            const match = branch.match(/^([^/]+\/)?(.+)$/);
            if (match) {
                const prefix = match[1] || match[0] || '/'; //before we search for shortcut then longone
                if (!groups[prefix]) {
                    groups[prefix] = [];
                }
                groups[prefix].push(branch);
            }
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
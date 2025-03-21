import * as vscode from 'vscode';
import { GitService } from '../services/gitService';
import { gitChangeEmitter } from '../extension';

export class BranchViewProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;
    private updateTimeout: NodeJS.Timeout | undefined;
    private lastUpdate: number = 0;
    private readonly UPDATE_DEBOUNCE = 1000;
    private cachedHtml: string | undefined;
    private branchesCache: {
        local: string[];
        remote: Map<string, string[]>;
        timestamp: number;
    } | null = null;
    private readonly CACHE_TTL = 2000;
    
    constructor(private readonly extensionUri: vscode.Uri, private readonly gitService: GitService) {
        gitChangeEmitter.event(() => {
            this.debouncedRefresh();
        });
    }

    async resolveWebviewView(webviewView: vscode.WebviewView): Promise<void> {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.extensionUri]
        };

        webviewView.webview.onDidReceiveMessage(async (message) => {
            switch (message.command) {
                case 'switch':
                    await this.gitService.switchBranch(message.branch);
                    gitChangeEmitter.fire();
                    break;
                case 'delete':
                    await this.gitService.deleteBranch(message.branch);
                    gitChangeEmitter.fire();
                    break;
                case 'merge':
                    await this.gitService.mergeBranch(message.source, message.target);
                    gitChangeEmitter.fire();
                    break;
                case 'rebase':
                    await this.gitService.rebaseBranch(message.source, message.target);
                    gitChangeEmitter.fire();
                    break;
                case 'cherryPick':
                    await this.gitService.cherryPick(message.branch);
                    gitChangeEmitter.fire();
                    break;
                case 'refresh':
                    await this.refresh();
                    break;
            }
        });

        await this.refresh();
    }

    private async debouncedRefresh(): Promise<void> {
        if (this.updateTimeout) {
            clearTimeout(this.updateTimeout);
        }

        const now = Date.now();
        if (now - this.lastUpdate < this.UPDATE_DEBOUNCE) {
            this.updateTimeout = setTimeout(() => this.refresh(), this.UPDATE_DEBOUNCE);
            return;
        }

        try {
            const html = await this.refresh();
            if (this._view && this.cachedHtml !== html) {
                this._view.webview.html = html;
                this.cachedHtml = html;
            }
            this.lastUpdate = now;
        } catch (error) {
            console.error('Failed to refresh view:', error);
            if (this._view) {
                this._view.webview.html = this.generateErrorHtml(error as Error);
            }
        }
    }

    async refresh(): Promise<string> {
        if (this.branchesCache && 
            (Date.now() - this.branchesCache.timestamp) < this.CACHE_TTL) {
            return this.generateBranchesHtml(
                this.branchesCache.local,
                this.branchesCache.remote
            );
        }

        try {
            const [localBranches, remoteBranches] = await Promise.all([
                this.gitService.getLocalBranches(),
                this.gitService.getRemoteBranches()
            ]);

            this.branchesCache = {
                local: localBranches,
                remote: remoteBranches,
                timestamp: Date.now()
            };

            return this.generateBranchesHtml(localBranches, remoteBranches);
        } catch (error) {
            console.error('Error fetching branches:', error);
            throw error;
        }
    }

    private generateBranchesHtml(
        localBranches: string[],
        remoteBranches: Map<string, string[]>
    ): string {
        const groupedLocalBranches = this.groupBranchesByPrefix(localBranches);

        const localBranchesHtml = `
            <div class="branch-group">
                <div class="group-header" onclick="toggleGroup('local-branches')">
                    <span class="toggle-icon rotated">→</span>
                    <span class="group-name">📁 Local</span>
                    <span class="branch-count">(${Object.values(groupedLocalBranches).reduce((acc, curr) => acc + curr.length, 0)})</span>
                </div>
                <div id="local-branches" class="group-content" style="display: block;">
                    ${Object.entries(groupedLocalBranches)
                .map(([prefix, branches]) => {
                    const groupId = `local-${prefix.replace(/[^a-zA-Z0-9]/g, '-')}`;
                    return `
                            <div class="branch-subgroup">
                                <div class="subgroup-header" onclick="toggleGroup('${groupId}')">
                                    <span class="toggle-icon">→</span>
                                    <span class="group-name">
                                        ${prefix.includes('feature')
                            ? '✨'
                            : prefix.includes('bugfix') || prefix.includes('Bugfix')
                                ? '🐛'
                                : prefix.includes('hotfix') || prefix.includes('Hotfix')
                                    ? '🚨'
                                    : prefix.includes('release') || prefix.includes('Release')
                                        ? '🚀'
                                        : prefix.includes('main') || prefix.includes('Main')
                                            ? '⭐️'
                                            : prefix.includes('develop') || prefix.includes('Develop')
                                                ? '🛠️'
                                                : '📁'
                        } 
                                        ${prefix.replace('/', '')}
                                    </span>
                                    <span class="branch-count">(${branches.length})</span>
                                </div>
                                <div id="${groupId}" class="group-content">
                                    ${branches
                            .map(branch => `
                                            <div class="branch-item" oncontextmenu="event.preventDefault(); showBranchMenu(event, '${this.escapeHtml(branch)}')">
                                                <span class="branch-icon">
                                                    ${branch.includes('feature') || branch.includes('Feature')
                                    ? '✨'
                                    : branch.includes('bugfix') || branch.includes('Bugfix')
                                        ? '🐛'
                                        : branch.includes('hotfix') || branch.includes('Hotfix')
                                            ? '🚨'
                                            : branch.includes('release') || branch.includes('Release')
                                                ? '🚀'
                                                : prefix.includes('main') || prefix.includes('Main')
                                                    ? '⭐️'
                                                    : branch.includes('develop') || branch.includes('Develop')
                                                        ? '🛠️'
                                                        : '📁'
                                }
                                                </span>
                                                <span>${this.escapeHtml(branch)}</span>
                                            </div>
                                        `).join('')}
                                </div>
                            </div>
                        `}).join('')}
                </div>
            </div>`;

        const remoteBranchesHtml = Array.from(remoteBranches.entries())
            .map(([remote, branches]) => {
                const remoteId = `remote-${remote.replace(/[^a-zA-Z0-9]/g, '-')}`;
                const groupedRemoteBranches = this.groupBranchesByPrefix(branches);

                return `<div class="remote-group">
                    <div class="group-header" onclick="toggleGroup('${remoteId}')">
                        <span class="toggle-icon">→</span>
                        <span class="group-name">
                            ${remote === 'origin' ? `🥚 ${remote}` : remote}
                        </span>
                        <span class="branch-count">(${branches.length})</span>
                    </div>
                    <div id="${remoteId}" class="group-content">
                        ${Object.entries(groupedRemoteBranches)
                        .map(([prefix, prefixBranches]) => {
                            const subGroupId = `${remoteId}-${prefix.replace(
                                /[^a-zA-Z0-9]/g,
                                '-'
                            )}`;
                            return `<div class="branch-subgroup">
                                    <div class="subgroup-header" onclick="toggleGroup('${subGroupId}')">
                                        <span class="toggle-icon">→</span>
                                        <span class="group-name">${prefix.replace('/', ' ')}  </span>
                                        <span class="branch-count"> (${prefixBranches.length})</span>
                                    </div>
                                    <div id="${subGroupId}" class="group-content">
                                        ${prefixBranches
                                    .map(
                                        branch => `
                                            <div class="branch-item" oncontextmenu="event.preventDefault(); showRemoteBranchMenu(event, '${this.escapeHtml(
                                            branch
                                        )}', '${this.escapeHtml(remoteId)}')">
                                                 <span class="branch-icon">
                                    ${branch.includes('feature') || branch.includes('Feature')
                                                ? '✨'
                                                : branch.includes('origin')
                                                    ? '🥚'
                                                    : branch.includes('bugfix') || branch.includes('Bugfix')
                                                        ? '🐛'
                                                        : branch.includes('hotfix') || branch.includes('Hotfix')
                                                            ? '🚨'
                                                            : branch.includes('release') || branch.includes('Release')
                                                                ? '🚀'
                                                                : prefix.includes('main') || prefix.includes('Main')
                                                                    ? '⭐️'
                                                                    : branch.includes('develop') || branch.includes('Develop')
                                                                        ? '🛠️'
                                                                        : '📁'
                                            }
                                </span>
                                                <span>${this.escapeHtml(branch)}</span>
                                            </div>
                                        `
                                    )
                                    .join('')}
                                    </div>
                                </div>
                            `;
                        })
                        .join('')}
                    </div>
                </div>
            `;
            })
            .join('');

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
                margin-left: 8px;
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
            .context-menu {
                position: fixed;
                background: var(--vscode-menu-background);
                border: 1px solid var(--vscode-menu-border);
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
                padding: 4px 0;
                z-index: 1000;
                border-radius: 4px;
            }
            .context-menu-item {
                padding: 6px 12px;
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 8px;
                color: var(--vscode-menu-foreground);
            }
            .context-menu-item:hover {
                background: var(--vscode-menu-selectionBackground);
                color: var(--vscode-menu-selectionForeground);
            }
            .context-menu-item.danger {
                color: var(--vscode-errorForeground);
            }
            .context-menu-item.danger:hover {
                background: var(--vscode-errorForeground);
                color: var(--vscode-menu-selectionForeground);
            }
        `;

        const scripts = `
            const vscode = acquireVsCodeApi();
            
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
    
            let activeContextMenu = null;
    
            function showContextMenu(event, branch, isRemote = false) {
                event.preventDefault();
                hideContextMenu();
    
                const menu = document.createElement('div');
                menu.className = 'context-menu';
    
                if (!isRemote) {
                    const switchItem = document.createElement('div');
                    switchItem.className = 'context-menu-item';
                    switchItem.innerHTML = '🔄 Switch to Branch';
                    switchItem.onclick = () => {
                        console.log(branch)
                        switchBranch(branch);
                        hideContextMenu();
                    };
                    menu.appendChild(switchItem);
    
                    if (branch !== 'develop' || branch !== 'main') {
                        const deleteItem = document.createElement('div');
                        deleteItem.className = 'context-menu-item danger';
                        deleteItem.innerHTML = '🗑️ Delete Branch';
                        deleteItem.onclick = () => {
                            confirmDelete(branch);
                            hideContextMenu();
                        };
                        menu.appendChild(deleteItem);
                    }
                }
    
                document.body.appendChild(menu);
                activeContextMenu = menu;
    
                const rect = menu.getBoundingClientRect();
                const x = event.clientX;
                const y = event.clientY;
    
                const adjustedX = x + rect.width > window.innerWidth ? window.innerWidth - rect.width : x;
                const adjustedY = y + rect.height > window.innerHeight ? window.innerHeight - rect.height : y;
    
                menu.style.left = adjustedX + 'px';
                menu.style.top = adjustedY + 'px';
    
                document.addEventListener('click', hideContextMenu);
            }
    
            function hideContextMenu() {
                if (activeContextMenu) {
                    activeContextMenu.remove();
                    activeContextMenu = null;
                }
            }
    
            function showBranchMenu(event, branch) {
                showContextMenu(event, branch, false);
            }
    
            function showRemoteBranchMenu(event, branch) {
                showContextMenu(event, branch, true);
            }

            function switchBranch(branch) {
                vscode.postMessage({ command: 'switch', branch });
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
                function refresh() {
                        vscode.postMessage({ command: 'refresh' });
                    }
    
                    function deleteBranch(branch) {
                        if (confirm('Are you sure you want to delete this branch?')) {
                            vscode.postMessage({ command: 'delete', branch });
                        }
                    }
                  
                    let currentBranch = '';
                    
                   function confirmDelete(branch, isRemote = false) {
                        currentBranch = branch;
                        document.getElementById('branchToDelete').textContent = branch;
                        document.getElementById('deleteModal').style.display = 'block';
                        document.getElementById('overlay').style.display = 'block';
                        window.isRemoteBranch = isRemote;
                    }
                    
                    function cancelDelete() {
                        document.getElementById('deleteModal').style.display = 'none';
                        document.getElementById('overlay').style.display = 'none';
                        currentBranch = '';
                    }
                    
                   function proceedDelete() {
                        if (currentBranch) {
                            const command = window.isRemoteBranch ? 'delete-remote' : 'delete';
                            const branch = window.remoteId ? window.remoteId + '/' + currentBranch : currentBranch;
                            vscode.postMessage({ command, branch });
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
                            document.getElementById('nameError').textContent = 'Branch name can only contain lowercase letters, numbers, and hyphens';
                            document.getElementById('nameError').style.display = 'block';
                            return;
                        }

                        vscode.postMessage({ command: 'createBranch', branch: \`\${type}/\${name}\` });
                    }

                     function showRemoteBranchMenu(event, branch, remoteId) {
                        event.preventDefault();
                        const menu = document.getElementById('remoteBranchMenu');
                        menu.style.display = 'block';
                        menu.style.left = event.pageX + 'px';
                        menu.style.top = event.pageY + 'px';
                        
                        // Store the selected branch for use in menu actions
                        window.selectedBranch = branch;
                        window.remoteId = remoteId
                        
                        // Close menu when clicking outside
                        document.addEventListener('click', closeContextMenu);
                        return false;
                    }

                    function closeContextMenu() {
                        document.getElementById('remoteBranchMenu').style.display = 'none';
                        document.removeEventListener('click', closeContextMenu);
                    }

                    function switchBranchRemote() {
                        vscode.postMessage({ 
                            command: 'switch',
                            branch: window.selectedBranch
                        });
                        closeContextMenu();
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

                     function removeRemoteBranch() {
                        confirmDelete(window.selectedBranch, true);
                        closeContextMenu();
                    }
        `;

        const contextMenu = ` <div id="remoteBranchMenu" class="context-menu" style="display: none;">
                    <div class="context-menu-item" onclick="switchBranchRemote()">
                        🔄 Switch Branch
                    </div>
                    <hr /> 
                    <div class="context-menu-item" onclick="mergeWithDevelop()">
                        🔄 Merge with develop
                    </div>
                    <div class="context-menu-item" onclick="rebaseWithDevelop()">
                        📥 Rebase with develop
                    </div>
                    <div class="context-menu-item" onclick="cherryPickBranch()">
                        🍒 Cherry-pick
                    </div>
                    <div class="context-menu-item danger" onclick="removeRemoteBranch()"> 
                        🗑️ Delete Branch
                    </div>
                </div>`

        const styles = `body {
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
                            padding: 8px 5px;
                            cursor: pointer;
                            border-radius: 4px;
                        }
                        .branch-item:hover {
                            background-color: var(--vscode-list-hoverBackground);
                        }
                        .branch-icon {
                            margin-right: 8px;
                            width: 16px;
                            text-align: center;
                        }
                        .group-header {
                            display: flex;
                            align-items: center;
                            padding: 6px;
                            cursor: pointer;
                            border-radius: 4px;
                        }
                        .group-header:hover {
                            background-color: var(--vscode-list-hoverBackground);
                        }
                        .group-name {
                            margin-right: 8px;
                        }
                        .branch-count {
                            opacity: 0.7;
                            font-size: 0.9em;
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
                        padding: 8px 12px;
                        cursor: pointer;
                        border-radius: 4px;
                        transition: background-color 0.2s ease;
                        align-items: center;
                        gap: 8px;
                    }`;

        const body = `

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
                <div id="overlay" class="overlay"></div>`;

        return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>🚇 Branches</title>
                <style>
                    ${styles}
                </style>
            </head>
            <body>
                ${body}
                <script>
                    
                    ${scripts} 
                </script>
                ${contextMenu}
            </body>
            </html>
        `;
    }

    private groupBranchesByPrefix(branches: string[]): Record<string, string[]> {
        const groups: Record<string, string[]> = {};

        branches.forEach(branch => {
            const match = branch.match(/^([^/]+\/)?(.+)$/);
            if (match) {
                const prefix = match[1] || match[0] || '/';
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
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
}

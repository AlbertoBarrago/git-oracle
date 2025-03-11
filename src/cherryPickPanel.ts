import * as vscode from 'vscode';
import { GitService } from './gitService';

export class CherryPickPanel {
    public static currentPanel: CherryPickPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private readonly _gitService: GitService;
    private _disposables: vscode.Disposable[] = [];

    public static createOrShow(extensionUri: vscode.Uri, gitService: GitService) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        // If we already have a panel, show it
        if (CherryPickPanel.currentPanel) {
            CherryPickPanel.currentPanel._panel.reveal(column);
            return;
        }

        // Otherwise, create a new panel
        const panel = vscode.window.createWebviewPanel(
            'gitOracleCherryPick',
            'Git Cherry Pick',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')]
            }
        );

        CherryPickPanel.currentPanel = new CherryPickPanel(panel, extensionUri, gitService);
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, gitService: GitService) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._gitService = gitService;

        // Set the webview's initial html content
        this._update();

        // Listen for when the panel is disposed
        // This happens when the user closes the panel or when the panel is closed programmatically
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Update the content based on view changes
        this._panel.onDidChangeViewState(
            _ => {
                if (this._panel.visible) {
                    this._update();
                }
            },
            null,
            this._disposables
        );

        // Handle messages from the webview
        this._panel.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'refresh':
                        this._update();
                        return;
                    case 'cherryPick':
                        this._cherryPick(message.commitHash);
                        return;
                }
            },
            null,
            this._disposables
        );
    }

    private async _update() {
        this._panel.title = 'Git Cherry Pick';
        this._panel.webview.html = await this._getHtmlForWebview();
    }

    private async _getHtmlForWebview() {
        try {
            const branches = await this._gitService.getBranches();
            const commits = await this._gitService.getCommitHistory();
            return this._generateCherryPickHtml(branches, commits);
        } catch (error) {
            return this._generateErrorHtml(error as Error);
        }
    }

    private _generateCherryPickHtml(branches: string[], commits: any[]) {
        const branchOptions = branches.map(branch => 
            `<option value="${this._escapeHtml(branch)}">${this._escapeHtml(branch)}</option>`
        ).join('');

        const commitOptions = commits.map(commit => 
            `<option value="${this._escapeHtml(commit.hash)}">${this._escapeHtml(commit.hash.substring(0, 7))} - ${this._escapeHtml(commit.message)}</option>`
        ).join('');

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
                    select, input {
                        background-color: var(--vscode-input-background);
                        color: var(--vscode-input-foreground);
                        border: 1px solid var(--vscode-input-border);
                        padding: 5px;
                        width: 100%;
                        margin-bottom: 10px;
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
                    .form-group {
                        margin-bottom: 15px;
                    }
                    label {
                        display: block;
                        margin-bottom: 5px;
                    }
                    .error {
                        color: var(--vscode-errorForeground);
                        padding: 20px;
                    }
                </style>
            </head>
            <body>
                <h1>Git Cherry Pick</h1>
                <div style="margin-top: 10px; margin-bottom: 10px;">
                    <div class="form-group">
                        <label for="commitSelect">Select a recent commit:</label>
                        <select id="commitSelect" onchange="updateCommitInput()">
                            <option value="">-- Select a commit --</option>
                            ${commitOptions}
                        </select>
                    </div>
                    
                    <div class="form-group">
                        <label for="commitHash">Or enter commit hash:</label>
                        <input type="text" id="commitHash" placeholder="Enter commit hash">
                    </div>
                    
                    <div class="form-group">
                        <button onclick="cherryPick()">Cherry Pick</button>
                    </div>
                </div>
                <script>
                    const vscode = acquireVsCodeApi();
                    
                    function refresh() {
                        vscode.postMessage({
                            command: 'refresh'
                        });
                    }
                    
                    function updateCommitInput() {
                        const commitSelect = document.getElementById('commitSelect');
                        const commitHash = document.getElementById('commitHash');
                        if (commitSelect.value) {
                            commitHash.value = commitSelect.value;
                        }
                    }
                    
                    function cherryPick() {
                        const commitHash = document.getElementById('commitHash').value.trim();
                        if (!commitHash) {
                            alert('Please enter or select a commit hash');
                            return;
                        }
                        
                        vscode.postMessage({
                            command: 'cherryPick',
                            commitHash: commitHash
                        });
                    }
                </script>
            </body>
            </html>
        `;
    }

    private _generateErrorHtml(error: Error) {
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
                <h1>Git Cherry Pick</h1>
                <div class="error">
                    <h2>Error</h2>
                    <p>${this._escapeHtml(error.message)}</p>
                </div>
                <script>
                    const vscode = acquireVsCodeApi();
                    
                    function refresh() {
                        vscode.postMessage({
                            command: 'refresh'
                        });
                    }
                </script>
            </body>
            </html>
        `;
    }

    private async _cherryPick(commitHash: string) {
        try {
            const result = await this._gitService.cherryPick(commitHash);
            if (result) {
                vscode.window.showInformationMessage(`Successfully cherry-picked commit ${commitHash}`);
            } else {
                vscode.window.showErrorMessage(`Failed to cherry-pick commit ${commitHash}`);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Cherry-pick error: ${(error as Error).message}`);
        }
    }

    private _escapeHtml(unsafe: string): string {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    public dispose() {
        CherryPickPanel.currentPanel = undefined;

        // Clean up our resources
        this._panel.dispose();

        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }
}
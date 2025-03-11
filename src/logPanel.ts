import * as vscode from 'vscode';
import { GitService } from './gitService';

export class LogPanel {
    public static currentPanel: LogPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private readonly _gitService: GitService;
    private _disposables: vscode.Disposable[] = [];

    public static createOrShow(extensionUri: vscode.Uri, gitService: GitService) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        // If we already have a panel, show it
        if (LogPanel.currentPanel) {
            LogPanel.currentPanel._panel.reveal(column);
            return;
        }

        // Otherwise, create a new panel
        const panel = vscode.window.createWebviewPanel(
            'gitOracleLog',
            'Git Log',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')]
            }
        );

        LogPanel.currentPanel = new LogPanel(panel, extensionUri, gitService);
    }

    public static reload(extensionUri: vscode.Uri, gitService: GitService) {
        // Force dispose the current panel if it exists
        if (LogPanel.currentPanel) {
            LogPanel.currentPanel.dispose();
            LogPanel.currentPanel = undefined;
        }
        
        // Create a new panel
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;
            
        const panel = vscode.window.createWebviewPanel(
            'gitOracleLog',
            'Git Log',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: false, // Don't keep the webview content when hidden
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')]
            }
        );

        LogPanel.currentPanel = new LogPanel(panel, extensionUri, gitService);
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
                }
            },
            null,
            this._disposables
        );
    }

    private async _update() {
        this._panel.title = 'Git Log';
        
        // Generate a unique timestamp for cache busting
        const timestamp = new Date().getTime();
        
        // Add cache-busting headers
        const html = await this._getHtmlForWebview();
        this._panel.webview.html = html.replace('<head>', `<head>
            <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
            <meta http-equiv="Pragma" content="no-cache" />
            <meta http-equiv="Expires" content="0" />
            <script>window.cacheBuster = "${timestamp}";</script>`);
    }

    private async _getHtmlForWebview() {
        try {
            const log = await this._gitService.getLog();
            return this._generateLogHtml(log);
        } catch (error) {
            return this._generateErrorHtml(error as Error);
        }
    }

    private _generateLogHtml(log: string) {
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
                        padding: 10px;
                    }
                    pre {
                        font-family: 'Consolas', 'Courier New', monospace;
                        white-space: pre;
                        overflow-x: auto;
                        margin: 0;
                        padding: 10px;
                        background-color: var(--vscode-editor-background);
                        border-radius: 4px;
                        line-height: 1.4;
                    }
                    .commit-graph {
                        font-family: 'Consolas', 'Courier New', monospace;
                        font-size: 14px;
                    }
                    .commit-hash {
                        color: #4ec9b0; /* Bright teal */
                        font-weight: bold;
                    }
                    .commit-author {
                        color: #569cd6; /* Bright blue */
                        opacity: 0.8;
                    }
                    .commit-date {
                        color: #ce9178; /* Orange */
                        font-style: italic;
                    }
                    .commit-message {
                        color: #dcdcaa; /* Light yellow */
                        font-weight: bold;
                    }
                    .graph-symbol {
                        color: #3794ff; /* VS Code blue */
                        font-weight: bold;
                    }
                    .graph-branch {
                        color: #569cd6; /* Blue */
                    }
                    .graph-merge {
                        color: #c586c0; /* Purple */
                    }
                    .branch-tag {
                        display: inline-block;
                        background-color: #3794ff;
                        color: white;
                        border-radius: 12px;
                        padding: 2px 8px;
                        font-size: 12px;
                        margin-left: 8px;
                    }
                    .commit-line {
                        display: flex;
                        align-items: center;
                        margin-bottom: 4px;
                        padding: 4px 0;
                        border-radius: 4px;
                    }
                    .commit-line:hover {
                        background-color: rgba(255, 255, 255, 0.1);
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
                <h1>Git Log</h1>
                <button onclick="refresh()">Refresh</button>
                <div style="margin-top: 10px; margin-bottom: 10px; overflow: auto; max-height: 500px;">
                    <pre class="commit-graph">${this._formatLogWithGraph(log)}</pre>
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

    private _generateErrorHtml(error: Error) {
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
                    pre {
                        font-family: 'Consolas', 'Courier New', monospace;
                        white-space: pre;
                        overflow-x: auto;
                        margin: 0;
                        padding: 10px;
                        background-color: var(--vscode-editor-background);
                        border-radius: 4px;
                    }
                    .commit-graph {
                        line-height: 1.5;
                        font-size: 14px;
                    }
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
                <h1>Git Log</h1>
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

    private _formatLogWithGraph(log: string): string {
        // Split the log into lines and process each line
        return log.split('\n').map(line => {
            // For simple log format without graph (matches your actual output format)
            if (line.startsWith('*')) {
                // Format: * hash - (time ago) message - author
                const hashMatch = line.match(/\* ([a-f0-9]+) -/);
                const dateMatch = line.match(/\(([^)]+)\)/);
                const authorMatch = line.match(/- ([^(]+)$/);
                
                if (hashMatch) {
                    const hash = hashMatch[1];
                    const dateText = dateMatch ? dateMatch[0] : '';
                    const author = authorMatch ? authorMatch[1].trim() : '';
                    
                    // Extract message by removing hash, date and author parts
                    let message = line
                        .replace(/\* [a-f0-9]+ -/, '')
                        .replace(/\([^)]+\)/, '')
                        .replace(/- [^(]+$/, '')
                        .trim();
                    
                    // Use inline styles instead of classes
                    return `<div style="display: flex; align-items: center; margin-bottom: 4px; padding: 4px 0; border-radius: 4px;">
                        <span style="color: #3794ff; font-weight: bold;">●</span> 
                        <span style="color: #4ec9b0; font-weight: bold;">${this._escapeHtml(hash)}</span> 
                        <span style="color: #ce9178; font-style: italic;">${this._escapeHtml(dateText)}</span> 
                        <span style="color: #dcdcaa; font-weight: bold;">${this._escapeHtml(message)}</span> 
                        <span style="color: #569cd6; opacity: 0.8;">- ${this._escapeHtml(author)}</span>
                    </div>`;
                }
            }
            
            // Simplified handling for other formats
            return `<div style="margin-bottom: 4px;">${this._escapeHtml(line)}</div>`;
        }).join('\n');
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
        LogPanel.currentPanel = undefined;

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
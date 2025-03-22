export class GenerateHelperHtml {
    constructor() { }
    public html = `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    body {
                        font-family: var(--vscode-font-family);
                        color: var(--vscode-foreground);
                        padding: 20px;
                        text-align: center;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        min-height: calc(100vh - 40px);
                    }
                    .message-container {
                        max-width: 400px;
                        padding: 24px;
                        background: var(--vscode-editor-background);
                        border: 1px solid var(--vscode-panel-border);
                        border-radius: 6px;
                    }
                    .icon {
                        font-size: 48px;
                        margin-bottom: 16px;
                        opacity: 0.8;
                    }
                    h3 {
                        margin: 0 0 16px 0;
                        font-weight: normal;
                        font-size: 16px;
                        color: var(--vscode-foreground);
                    }
                    .message {
                        margin: 0 0 24px 0;
                        font-size: 13px;
                        line-height: 1.6;
                        color: var(--vscode-descriptionForeground);
                    }
                    .action-button {
                        background: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                        border: none;
                        padding: 8px 16px;
                        border-radius: 2px;
                        cursor: pointer;
                        font-size: 13px;
                        display: inline-flex;
                        align-items: center;
                        gap: 6px;
                        transition: background-color 0.2s;
                    }
                    .action-button:hover {
                        background: var(--vscode-button-hoverBackground);
                    }
                    .action-button:active {
                        background: var(--vscode-button-background);
                        transform: translateY(1px);
                    }
                </style>
            </head>
            <body>
                <div class="message-container">
                    <div class="icon">📂</div>
                    <h3>No Git Repository</h3>
                    <p class="message">
                        Open a folder containing a Git repository to start managing your branches.
                    </p>
                    <button class="action-button" onclick="openFolder()">
                        <span>📁</span>
                        <span>Open Folder</span>
                    </button>
                </div>
                <script>
                    const vscode = acquireVsCodeApi();
                    function openFolder() {
                        vscode.postMessage({ command: 'openFolder' });
                    }
                </script>
            </body>
            </html>
        `
}
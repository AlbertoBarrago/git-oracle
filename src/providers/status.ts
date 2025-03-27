import * as vscode from 'vscode';
import { GitService } from '../services/gitService';
import { gitChangeEmitter } from '../extension';
import { Views } from './helper';
import { GenerateStatusHtml } from '../utils/status';

export class LogViewProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;
    private terminal: vscode.Terminal | undefined;
    private updateTimeout: NodeJS.Timeout | undefined;
    private lastUpdate: number = 0;
    private readonly UPDATE_DEBOUNCE = 1000;
    private cachedHtml: string | undefined;
    private generateStatusHtml: GenerateStatusHtml = new GenerateStatusHtml();

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
                webviewView.webview.html = this.generateStatusHtml.generateLogHtml(status);
                this.cachedHtml = this.generateStatusHtml.generateLogHtml(status);
            } catch (error) {
                console.error('Failed to initialize status view:', error);
                webviewView.webview.html = this.generateStatusHtml.generateErrorHtml(error as Error);
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

       /* if (this.updateTimeout) {
            clearTimeout(this.updateTimeout);
        }

        const now = Date.now();
        if (now - this.lastUpdate < this.UPDATE_DEBOUNCE) {
            this.updateTimeout = setTimeout(() => this.updateView(), this.UPDATE_DEBOUNCE);
            return;
        }*/

        try {
            const status = await this.gitService.getGitStatus();
            const newHtml = this.generateStatusHtml.generateLogHtml(status);

            if (this.cachedHtml !== newHtml) {
                this._view.webview.html = newHtml;
                this.cachedHtml = newHtml;
            }

            // this.lastUpdate = now;
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
            const html = this.generateStatusHtml.generateLogHtml(status);

            if (this._view) {
                this._view.webview.html = html;
                this.cachedHtml = html;
            }

            vscode.window.showInformationMessage('Status Updated 🫡');
            return html;
        } catch (error) {
            console.error('Error updating status:', error);
            throw error;
        }
    }

    dispose() {
        if (this.updateTimeout) {
            clearTimeout(this.updateTimeout);
        }
        this.terminal?.dispose();
    }
}
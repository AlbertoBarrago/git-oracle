import * as vscode from 'vscode';
import { GitService } from '../services/gitService';
import { gitChangeEmitter } from '../extension';
import { Views } from './helper';
import { BranchHtmlGenerator } from '../utils/branches';
import { getGitOracleConfig } from '../utils/config';

export class BranchViewProvider implements vscode.WebviewViewProvider {
    private config = getGitOracleConfig();
    private _view?: vscode.WebviewView;
    private updateTimeout: NodeJS.Timeout | undefined;
    private lastUpdate: number = 0;
    private readonly UPDATE_DEBOUNCE = this.config.fetchTimer;
    private cachedHtml: string | undefined;
    private branchesCache: {
        local: string[];
        remote: Map<string, string[]>;
        timestamp: number;
    } | null = null;
    private readonly CACHE_TTL = 2000;
    private branchHtmlGenerator = new BranchHtmlGenerator();


    constructor(private readonly extensionUri: vscode.Uri, private readonly gitService: GitService) {
        gitChangeEmitter.event(() => {
            this.debouncedRefresh();
        });
    }

    async resolveWebviewView(webviewView: vscode.WebviewView): Promise<void> {
        this._view = webviewView;
        const views = new Views();

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.extensionUri]
        };

        webviewView.webview.onDidReceiveMessage(async (message) => {
            switch (message.command) {
                case 'openFolder':
                    await vscode.commands.executeCommand('vscode.openFolder');
                    break;
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
                case 'createBranch':
                    await this.gitService.createBranch(message.branch);
                    gitChangeEmitter.fire();
                    break;
            }
        });

        if (!views.isWorkspaceAvailable(vscode.workspace)) {
            webviewView.webview.html = views.generateNoRepoHtml();
            views.addProviders([this]);
        } else {
            try {
                const html = await this.refresh();
                webviewView.webview.html = html;
                this.cachedHtml = html;
            } catch (error) {
                console.error('Failed to initialize branch view:', error);
                webviewView.webview.html = this.branchHtmlGenerator.generateErrorHtml(error as Error);
            }
        }
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
            vscode.window.showErrorMessage('Failed to refresh view');
            console.error('Failed to refresh view:', error);
            if (this._view) {
                this._view.webview.html = this.branchHtmlGenerator.generateErrorHtml(error as Error);
            }
        }
    }

    async refresh(): Promise<string> {
        try {
            if (this.branchesCache &&
                (Date.now() - this.branchesCache.timestamp) < this.CACHE_TTL) {
                return this.branchHtmlGenerator.generateBranchesHtml(
                    this.branchesCache.local,
                    this.branchesCache.remote
                );
            }

            const [localBranches, remoteBranches] = await Promise.all([
                this.gitService.getLocalBranches(),
                this.gitService.getRemoteBranches()
            ]);

            this.branchesCache = {
                local: localBranches,
                remote: remoteBranches,
                timestamp: Date.now()
            };

            const html = this.branchHtmlGenerator.generateBranchesHtml(localBranches, remoteBranches);

            if (this._view?.visible) {
                try {
                    this.cachedHtml = html;
                    this._view.webview.html = html;
                } catch (viewError) {
                    console.error('Error updating webview:', viewError);
                }
            }

            vscode.window.showInformationMessage('Branches Updated 🫡');

            return html;
        } catch (error) {
            console.error('Error fetching branches:', error);
            throw error;
        }
    }
}

import * as vscode from 'vscode';
import { GitService } from '../services/gitService';
import { BranchViewProvider, CherryPickViewProvider, LogViewProvider } from './_index';

export class Views {
    private logViewProvider: LogViewProvider;
    private branchViewProvider: BranchViewProvider;
    private cherryPickViewProvider: CherryPickViewProvider;

    constructor(extensionUri: vscode.Uri, gitService: GitService) {
        this.logViewProvider = new LogViewProvider(extensionUri, gitService);
        this.branchViewProvider = new BranchViewProvider(extensionUri, gitService);
        this.cherryPickViewProvider = new CherryPickViewProvider(extensionUri, gitService);
    }

    public registerViews(context: vscode.ExtensionContext): void {
        context.subscriptions.push(
            vscode.window.registerWebviewViewProvider('gitOracleLog', this.logViewProvider),
            vscode.window.registerWebviewViewProvider('gitOracleBranches', this.branchViewProvider),
            vscode.window.registerWebviewViewProvider('gitOracleCherryPick', this.cherryPickViewProvider)
        );
    }

    public refresh(): void {
        this.logViewProvider.refresh();
        this.branchViewProvider.refresh();
        this.cherryPickViewProvider.refresh();
    }
}
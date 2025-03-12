import * as vscode from 'vscode';

export class BranchItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly type: 'local' | 'remote' | 'branch' | 'remoteBranch',
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(label, collapsibleState);
        this.contextValue = type;
    }
}
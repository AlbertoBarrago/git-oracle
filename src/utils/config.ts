import * as vscode from 'vscode';

export function getGitOracleConfig() {
    const config = vscode.workspace.getConfiguration('gitOracle');
    return {
        gitpath: config.get<string>('gitpath')?? 'git',
        maxCommitHistory: config.get<number>('maxCommitHistory') ?? 25,
        showRelativeDates: config.get<boolean>('showRelativeDates') ?? true,
        fetchTimer: config.get<number>('fetchTimer')?? 300000, // 5 minutes
    };
}
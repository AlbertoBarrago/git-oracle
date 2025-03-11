import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface CommitInfo {
    hash: string;
    author: string;
    date: string;
    message: string;
}

export interface BlameInfo {
    hash: string;
    author: string;
    date: string;
    line: number;
    content: string;
}

export class GitService {

    private getWorkspaceRoot(): string {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            throw new Error('No workspace folder found');
        }
        return workspaceFolders[0].uri.fsPath;
    }

    async getCommitHistory(): Promise<CommitInfo[]> {
        try {
            const { stdout } = await execAsync(
                'git log --pretty=format:"%H|%an|%ad|%s" --date=relative',
                { cwd: this.getWorkspaceRoot() }
            );

            return stdout.split('\n').map(line => {
                const [hash, author, date, ...messageParts] = line.split('|');
                return {
                    hash,
                    author,
                    date,
                    message: messageParts.join('|')
                };
            });
        } catch (error) {
            console.error('Error fetching git history:', error);
            throw new Error('Failed to fetch git history');
        }
    }

    async getLog(): Promise<string> {
        try {
            const { stdout } = await execAsync(
                'git log --graph --abbrev-commit --decorate --format=format:"%C(bold blue)%h%C(reset) - %C(bold green)(%ar)%C(reset) %C(white)%s%C(reset) %C(dim white)- %an%C(reset)%C(auto)%d%C(reset)" --all',
                { cwd: this.getWorkspaceRoot() }
            );
            return stdout;
        } catch (error) {
            console.error('Error fetching git log:', error);
            throw new Error('Failed to fetch git log');
        }
    }

    async getBlameInfo(filePath: string): Promise<BlameInfo[]> {
        try {
            const { stdout } = await execAsync(
                `git blame --line-porcelain ${filePath}`,
                { cwd: this.getWorkspaceRoot() }
            );

            const lines = stdout.split('\n');
            const blameInfo: BlameInfo[] = [];
            let currentInfo: Partial<BlameInfo> = {};
            let lineNumber = 1;

            for (const line of lines) {
                if (line.startsWith('author ')) {
                    currentInfo.author = line.substring(7);
                } else if (line.startsWith('author-time ')) {
                    const timestamp = parseInt(line.substring(12));
                    currentInfo.date = new Date(timestamp * 1000).toLocaleString();
                } else if (line.startsWith(currentInfo.hash || '')) {
                    currentInfo.content = line.substring(line.indexOf(')') + 1);
                    currentInfo.line = lineNumber++;
                    blameInfo.push(currentInfo as BlameInfo);
                    currentInfo = {};
                } else if (line.match(/^[0-9a-f]{40}/)) {
                    currentInfo.hash = line.substring(0, 40);
                }
            }

            return blameInfo;
        } catch (error) {
            console.error('Error fetching blame info:', error);
            throw new Error('Failed to fetch blame information');
        }
    }

    async getCommitDetails(commitHash: string): Promise<string> {
        try {
            const { stdout } = await execAsync(
                `git show --pretty=format:"%h %s%n%b" --patch ${commitHash}`,
                { cwd: this.getWorkspaceRoot() }
            );
            return stdout;
        } catch (error) {
            console.error('Error fetching commit details:', error);
            throw new Error('Failed to fetch commit details');
        }
    }

    async cherryPick(commitHash: string): Promise<boolean> {
        try {
            await execAsync(
                `git cherry-pick ${commitHash}`,
                { cwd: this.getWorkspaceRoot() }
            );
            return true;
        } catch (error) {
            console.error('Error during cherry-pick:', error);
            return false;
        }
    }

    async getLocalBranches(): Promise<string[]> {
        try {
            const { stdout } = await execAsync(
                'git branch --format="%(refname:short)"',
                { cwd: this.getWorkspaceRoot() }
            );
            return stdout.split('\n').filter(branch => branch.trim() !== '');
        } catch (error) {
            console.error('Error fetching local git branches:', error);
            throw new Error('Failed to fetch local git branches');
        }
    }

    async getRemoteBranches(): Promise<Map<string, string[]>> {
        try {
            const { stdout } = await execAsync(
                'git branch -r --format="%(refname:short)"',
                { cwd: this.getWorkspaceRoot() }
            );
            
            const remoteMap = new Map<string, string[]>();
            
            stdout.split('\n')
                .filter(branch => branch.trim() !== '')
                .forEach(branch => {
                    const parts = branch.split('/');
                    if (parts.length >= 2) {
                        const remoteName = parts[0];
                        const branchName = parts.slice(1).join('/');
                        
                        if (!remoteMap.has(remoteName)) {
                            remoteMap.set(remoteName, []);
                        }
                        remoteMap.get(remoteName)?.push(branchName);
                    }
                });
                
            return remoteMap;
        } catch (error) {
            console.error('Error fetching remote git branches:', error);
            throw new Error('Failed to fetch remote git branches');
        }
    }

    async checkoutBranch(branch: string): Promise<void> {
        try {
            await execAsync(
                `git checkout ${branch}`,
                { cwd: this.getWorkspaceRoot() }
            );
        } catch (error) {
            console.error('Error checking out branch:', error);
            throw new Error(`Failed to checkout branch '${branch}'`);
        }
    }

    async deleteBranch(branch: string): Promise<void> {
        try {
            await execAsync(
                `git branch -D ${branch}`,
                { cwd: this.getWorkspaceRoot() }
            );
        } catch (error) {
            console.error('Error deleting branch:', error);
            throw new Error(`Failed to delete branch '${branch}'`);
        }
    }

    async getBranches(): Promise<string[]> {
        try {
            const localBranches: string[] = await this.getLocalBranches();
            const remoteMap = await this.getRemoteBranches();
            const remoteBranches: string[] = Array.from(remoteMap.values()).flat();
            return [...localBranches, ...remoteBranches] as string[];
        } catch (error) 
        {
            console.error('Error fetching git branches:', error);
            throw new Error('Failed to fetch git branches');
        }
    }
}
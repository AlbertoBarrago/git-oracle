import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';
import { CommitInfo } from '../types/global';
import { getGitOracleConfig } from '../utils/config';


const execAsync = promisify(exec);

export class GitService {
    private config = getGitOracleConfig();
    private fetchInterval: NodeJS.Timer | undefined;
    /**
     * Executes a git command and returns its output
     * @param command - The git command to execute
     * @returns Promise containing the command output
     * @private
     */
    private async executeGitCommand(command: string): Promise<string> {
        try {
            const { stdout } = await execAsync(
                `${this.config.gitpath} ${command}`,
                { cwd: this.getWorkspaceRoot() }
            );
            return stdout;
        } catch (error) {
            console.error(`Error executing git command: ${command}`, error);
            throw error;
        }
    }

    public startAutoFetch() {
        this.fetch();
        
        // Set up 5-minute interval for auto-fetch
        this.fetchInterval = setInterval(async () => {
            try {
                await this.fetch();
            } catch (error) {
                console.error('Auto-fetch failed:', error);
            }
        }, this.config.fetchTimer);
    }

    /**
     * Fetches the latest changes from the remote repository
     */
    private async fetch(): Promise<void> {
        try {
            await execAsync('git fetch', { cwd: this.getWorkspaceRoot() });
        } catch (error) {
            console.error('Error fetching:', error);
            throw error;
        }
    }

    /**
     * Gets the root path of the current workspace
     * @returns The workspace root path
     * @private
     */
    getWorkspaceRoot(): string {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            throw new Error('No workspace folder found');
        }
        return workspaceFolders[0].uri.fsPath;
    }

    // Branch Operations

    /**
     * Creates a new branch
     * @param branch - Name of the branch to create
     */
    async showCreateBranchDialog(): Promise<string | undefined> {
        const branchType = await vscode.window.showQuickPick(
            ['feature', 'bugfix', 'hotfix', 'release'],
            {
                placeHolder: 'Select branch type'
            }
        );

        if (!branchType) {
            return undefined;
        }

        const branchName = await vscode.window.showInputBox({
            placeHolder: 'e.g., add-user-authentication',
            prompt: 'Enter branch name (lowercase letters, numbers, and hyphens only)',
            validateInput: (value) => {
                if (!value) {
                    return 'Branch name is required';
                }
                if (!/^[a-z0-9-]+$/.test(value)) {
                    return 'Branch name can only contain lowercase letters, numbers, and hyphens';
                }
                return null;
            }
        });

        if (!branchName) {
            return undefined;
        }

        const fullBranchName = `${branchType}/${branchName}`;
        await this.createBranch(fullBranchName);
        return fullBranchName;
    }

    async createBranch(branchName: string): Promise<void> {
        try {
            await this.executeGitCommand(`checkout -b ${branchName}`);
        } catch (error) {
            throw new Error(`Failed to create branch: ${error}`);
        }
    }

    /**
     * Switches to a specified branch
     * @param branch - Name of the branch to switch to
     */
    async switchBranch(branch: string): Promise<void> {
        try {
            await execAsync(
                `git switch ${branch}`,
                { cwd: this.getWorkspaceRoot() }
            );
        } catch (error) {
            console.error('Error switching branch:', error);
            throw new Error(`Failed to switch branch '${branch}'`);
        }
    }

    /**
     * Deletes a specified branch
     * @param branch - Name of the branch to delete
     */
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

    /**
     * Deletes a remote branch
     * @param branch - Name of the branch to delete
     */
    async deleteRemoteBranch(fullBranch: string): Promise<void> {
        try {
            // Split the full branch name into remote and branch parts
            const [remote, ...branchParts] = fullBranch.split('/');
            const branchName = branchParts.join('/');
            const originName = remote.split('-')[1];
    
            if (!originName || !branchName) {
                throw new Error('Invalid remote branch format. Expected: remote/branch');
            }
    
            await execAsync(
                `git push -d ${originName} ${branchName}`,
                { cwd: this.getWorkspaceRoot() }
            );
        } catch (error) {
            console.error('Error deleting remote branch:', error);
            throw new Error(`Failed to delete remote branch '${fullBranch}': ${error}`);
        }
    }

    /**
     * Gets all local branches
     * @returns Array of local branch names
     */
    async getLocalBranches(): Promise<string[]> {
        try {
            this.fetch();
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

    /**
     * Gets all remote branches grouped by remote
     * @returns Map of remote names to their branches
     */
    async getRemoteBranches(): Promise<Map<string, string[]>> {
        this.fetch();
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

    /**
     * Gets all branches (both local and remote)
     * @returns Array of all branch names
     */
    async getBranches(): Promise<string[]> {
        try {
            this.fetch();
            const localBranches: string[] = await this.getLocalBranches();
            const remoteMap = await this.getRemoteBranches();
            const remoteBranches: string[] = Array.from(remoteMap.values()).flat();
            return [...localBranches, ...remoteBranches] as string[];
        } catch (error) {
            console.error('Error fetching git branches:', error);
            throw new Error('Failed to fetch git branches');
        }
    }

    // Commit Operations

    /**
     * Gets the commit history
     * @returns Array of commit information
     */
    async getCommitHistory(): Promise<CommitInfo[]> {
        try {
            this.fetch();
            const dateFormat = this.config.showRelativeDates ? '--date=relative' : '--date=format:%Y-%m-%d %H:%M:%S';
            const command = `log -n ${this.config.maxCommitHistory} --pretty=format:"%H|%an|%ad|%s" ${dateFormat}`;
            const stdout = await this.executeGitCommand(command);

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

    /**
     * Gets the git log with graph visualization
     * @returns Formatted git log string
     */
    async getLog(): Promise<string> {
        try {
            this.fetch();
            const command = 'log --graph --pretty=format:"%h -%d %s (%cr) <%an>" --abbrev-commit --date=relative --all';
            return await this.executeGitCommand(command);
        } catch (error) {
            throw new Error(`Failed to get git log: ${error}`);
        }
    }

    /**
     * Cherry-picks a commit to the current branch
     * @param commitHash - Hash of the commit to cherry-pick
     * @returns Boolean indicating success
     */
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

    // Repository Status Operations

    /**
     * Gets the current git status including branch, user and timestamp
     * @returns Object containing status information
     */
    async getGitStatus(): Promise<{ branch: string; user: string; timestamp: string }> {
        try {
            const { stdout: branch } = await execAsync('git rev-parse --abbrev-ref HEAD', { cwd: this.getWorkspaceRoot() });
            let user = '';
            try {
                const { stdout: gitUser } = await execAsync('git config user.name', { cwd: this.getWorkspaceRoot() });
                user = gitUser.trim();
            } catch {
                user = 'Unknown User';
                vscode.window.showWarningMessage('No user setted in repository');
            }
            const timestamp = new Date().toLocaleString('en-US', { 
                dateStyle: 'medium', 
                timeStyle: 'medium' 
            });

            return {
                branch: branch.trim(),
                user: user.trim(),
                timestamp
            };
        } catch (error) {
            console.error('Error getting git status:', error);
            throw error;
        }
    }

    // Branch Integration Operations

    /**
     * Merges two branches
     * @param label - Source branch label
     * @param branch - Target branch name
     */
    async mergeBranches(label: string, branch: string): Promise<void> {
        try {
            await execAsync(
                `git merge ${label} ${branch}`,
                { cwd: this.getWorkspaceRoot() }
            );
        } catch (error) {
            console.error('Error merging branches:', error);
            throw new Error(`Failed to merge branches '${label} ${branch}'`);
        }
    }

    /**
     * Rebases two branches
     * @param label - Source branch label
     * @param branch - Target branch name
     */
    async rebaseBranches(label: string, branch: string): Promise<void> {
        try {
            await execAsync(
                `git rebase ${label} ${branch}`,
                { cwd: this.getWorkspaceRoot() }
            );
        } catch (error) {
            console.error('Error rebasing branches:', error);
            throw new Error(`Failed to rebase branches '${label} ${branch}'`);
        }
    }

    dispose() {
        if (this.fetchInterval) {
            clearInterval(this.fetchInterval);
        }
    }
}
import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';
import { getGitOracleConfig } from '../utils/config';


export const execAsync = promisify(exec);

export class GitService {
    private config = getGitOracleConfig();
    private fetchInterval: NodeJS.Timer | undefined;
    private currentDirectory: string | undefined;
    private statusCache: {
        data: any;
        timestamp: number;
    } | null = null;
    private branchesCache: {
        data: Map<string, string[]>;
        timestamp: number;
    } | null = null;
    
    private readonly CACHE_TTL = 2000;

    /**
     * Executes a git command and returns its output
     * @param command - The git command to execute (string or array of arguments)
     * @param throwOnError - Whether to throw an error if the command fails (default: true)
     * @returns Promise containing the command output
     * @private
     */
    private async executeGitCommand(command: string | string[], throwOnError = true): Promise<string> {
        try {
            const workspaceRoot = this.getWorkspaceRoot();
            if (!workspaceRoot) {
                throw new Error('No workspace folder found');
            }
            this.fetch()
            const commandStr = Array.isArray(command) ? command.join(' ') : command;
            const { stdout } = await execAsync(
                `${this.config.gitpath} ${commandStr}`,
                { cwd: workspaceRoot }
            );
            return stdout;
        } catch (error) {
            console.error(`Error executing git command: ${Array.isArray(command) ? command.join(' ') : command}`, error);
            if (throwOnError) {
                throw error;
            }
            return '';
        }
    }

    /**
     * Is the current workspace a git repository
     * @returns 
     */
    private async isGitRepository(): Promise<boolean> {
        try {
            const workspaceRoot = this.getWorkspaceRoot();
            if (!workspaceRoot) {
                vscode.window.showErrorMessage('No workspace folder found');
                return false;
            }
    
            try {
                await execAsync('git rev-parse --git-dir', { 
                    cwd: workspaceRoot 
                });
                return true;
            } catch {
                const initRepo = await vscode.window.showInformationMessage(
                    'No Git repository found. Would you like to initialize one?',
                    'Yes',
                    'No'
                );
    
                if (initRepo === 'Yes') {
                    try {
                        await execAsync('git init', { cwd: workspaceRoot });
                        vscode.window.showInformationMessage('Git repository initialized successfully');
                        return true;
                    } catch (error) {
                        vscode.window.showErrorMessage('Failed to initialize Git repository');
                        return false;
                    }
                }
                return false;
            }
        } catch (error) {
            console.error('Error checking git repository:', error);
            return false;
        }
    }

    /**
     * Chacks if the cache is valid
     * @param cache - The cache to check
     * @returns Boolean indicating if the cache is valid
     * @private
     * @returns 
     */
    async changeWorkingDirectory(): Promise<boolean> {
        try {
            const workspaceRoot = this.getWorkspaceRoot();
            if (!workspaceRoot) {
                vscode.window.showErrorMessage('No workspace folder found');
                return false;
            }

            const uri = await vscode.window.showOpenDialog({
                canSelectFiles: false,
                canSelectFolders: true,
                canSelectMany: false,
                defaultUri: vscode.Uri.file(workspaceRoot),
                openLabel: 'Select Git Repository'
            });

            if (uri && uri[0]) {
                this.currentDirectory = uri[0].fsPath;
                const isGitRepo = await this.isGitRepository();
                if (!isGitRepo) {
                    this.currentDirectory = undefined;
                    vscode.window.showErrorMessage('Selected directory is not a git repository');
                    return false;
                }
                vscode.window.showInformationMessage(`Working directory changed to: ${this.currentDirectory}`);
                return true;
            }
            return false;
        } catch (error) {
            console.error('Error changing working directory:', error);
            return false;
        }
    }

    getWorkspaceRoot(): string | undefined {
        if (this.currentDirectory) {
            return this.currentDirectory;
        }

        if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
            return undefined;
        }

        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor) {
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(activeEditor.document.uri);
            if (workspaceFolder) {
                return workspaceFolder.uri.fsPath;
            }
        }

        return vscode.workspace.workspaceFolders[0].uri.fsPath;
    }

    /**
     * Starts the auto-fetch process
     * @returns 
     */
    public async startAutoFetch() {
        try {
            const isGitRepo = await this.isGitRepository();
            if (!isGitRepo) {
                vscode.window.showErrorMessage('Not a git repository');
                console.log('Not a git repository, auto-fetch disabled');
                return;
            }

            try {
                await this.fetch();
            } catch (error) {
                if (error instanceof Error && error.message.includes('Authentication required')) {
                    vscode.window.showErrorMessage('Authentication required');
                    console.log('Authentication required, auto-fetch disabled');
                    return;
                }
                throw error;
            }
            
            this.fetchInterval = setInterval(async () => {
                try {
                    await this.fetch();
                } catch (error) {
                    console.error('Auto-fetch failed:', error);
                    if (error instanceof Error && error.message.includes('Authentication required')) {
                        if (this.fetchInterval) {
                            clearInterval(this.fetchInterval);
                            this.fetchInterval = undefined;
                        }
                    }
                }
            }, this.config.fetchTimer);
        } catch (error) {
            console.error('Failed to start auto-fetch:', error);
        }
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
        // Return cached data if valid
        if (this.isCacheValid(this.branchesCache)) {
            return this.branchesCache!.data;
        }

        try {
            const result = await this.fetchRemoteBranches();
            
            // Update cache
            this.branchesCache = {
                data: result,
                timestamp: Date.now()
            };

            return result;
        } catch (error) {
            console.error('Error fetching remote git branches:', error);
            throw new Error('Failed to fetch remote git branches');
        }
    }

    private async fetchRemoteBranches(): Promise<Map<string, string[]>> {
        this.fetch();
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


    /**
     * Gets the current git status including branch, user and timestamp
     * @returns Object containing status information
     */
    async getGitStatus(): Promise<{ 
        branch: string; 
        user: string; 
        timestamp: string;
        added: number;
        modified: number;
        deleted: number;
        remote: string;
        commitHash: string;
    }> {
        if (this.isCacheValid(this.statusCache)) {
            return this.statusCache!.data;
        }

        const isGitRepo = await this.isGitRepository();
        if(!isGitRepo) {
            const changed = await this.changeWorkingDirectory();
            
            if (changed) {
                return this.getGitStatus();
            }
            
            return { 
                branch: 'No repository', 
                user: 'Unknown', 
                timestamp: new Date().toLocaleString(),
                added: 0,
                modified: 0,
                deleted: 0,
                remote: 'None',
                commitHash: 'None'
            };
        }

        try {       
            const workspaceRoot = this.getWorkspaceRoot();
            if (!workspaceRoot) {
                return { 
                    branch: 'No repository', 
                    user: 'Unknown', 
                    timestamp: new Date().toLocaleString(),
                    added: 0,
                    modified: 0,
                    deleted: 0,
                    remote: 'None',
                    commitHash: 'None'
                };
            }
    
            const branchOutput = await this.executeGitCommand(['rev-parse', '--abbrev-ref', 'HEAD']);
            const branch = branchOutput.trim();
    
            const userOutput = await this.executeGitCommand(['config', 'user.name']);
            const user = userOutput.trim() || 'Unknown';
    
            const timestampOutput = await this.executeGitCommand(['log', '-1', '--format=%cd', '--date=local']);
            const timestamp = timestampOutput.trim() || new Date().toLocaleString();
    
            const statusOutput = await this.executeGitCommand(['status', '--porcelain']);
            const statusLines = statusOutput.split('\n').filter(line => line.trim().length > 0);
            
            let added = 0, modified = 0, deleted = 0;
            statusLines.forEach(line => {
                const status = line.substring(0, 2);
                if (status.includes('A')) added++;
                if (status.includes('M')) modified++;
                if (status.includes('D')) deleted++;
            });
    
            const remoteOutput = await this.executeGitCommand(['rev-parse', '--abbrev-ref', '@{upstream}'], false);
            const remote = remoteOutput.trim() || 'Not tracking';
    
            const hashOutput = await this.executeGitCommand(['rev-parse', '--short', 'HEAD'], false);
            const commitHash = hashOutput.trim() || 'No commits';
    
            return { branch, user, timestamp, added, modified, deleted, remote, commitHash };
        } catch (error) {
            console.error('Error getting Git status:', error);
            return { 
                branch: 'Error', 
                user: 'Unknown', 
                timestamp: new Date().toLocaleString(),
                added: 0,
                modified: 0,
                deleted: 0,
                remote: 'Error',
                commitHash: 'Error'
            };
        }
    }

    // Branch Integration Operations

    /**
     * Merges two branches
     * @param label - Source branch label
     * @param branch - Target branch name
     */
    async mergeBranch(label: string, branch: string): Promise<void> {
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
    async rebaseBranch(label: string, branch: string): Promise<void> {
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

    private isCacheValid(cache: { timestamp: number } | null): boolean {
        return cache !== null && (Date.now() - cache.timestamp) < this.CACHE_TTL;
    }
}
import { GitService } from '../src/services/gitService';
import { expect, jest, describe, it, beforeEach } from '@jest/globals';

// Setup mocks
jest.mock('vscode', () => ({
    window: {
        showInformationMessage: jest.fn(),
        showErrorMessage: jest.fn(),
        showOpenDialog: jest.fn()
    },
    workspace: {
        workspaceFolders: [{ uri: { fsPath: '/test/workspace' } }]
    },
    Uri: { file: (path: string) => ({ fsPath: path }) }
}));

const mockExecAsync = jest.fn();
jest.mock('../src/services/gitService', () => {
    return {
        execAsync: mockExecAsync
    };
});

describe('GitService', () => {
    let gitService: GitService;

    beforeEach(() => {
        jest.clearAllMocks();
        gitService = new GitService();
    });

    it('should get workspace root', () => {
        expect(gitService.getWorkspaceRoot()).toBe('/test/workspace');
    });
   
});
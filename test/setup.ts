import { jest, beforeEach } from '@jest/globals';
import { execAsync } from '../src/services/gitService';


jest.mock('vscode', () => ({
  window: {
    showInformationMessage: jest.fn(),
    showErrorMessage: jest.fn(),
    showOpenDialog: jest.fn(),
    createTerminal: jest.fn(() => ({
      show: jest.fn(),
      sendText: jest.fn(),
    })),
  },
  workspace: {
    workspaceFolders: [{ uri: { fsPath: '/test/workspace' } }],
    getWorkspaceFolder: jest.fn(),
    createFileSystemWatcher: jest.fn(() => ({
      onDidChange: jest.fn(),
      onDidCreate: jest.fn(),
      onDidDelete: jest.fn(),
    })),
  },
  EventEmitter: jest.fn(() => ({
    fire: jest.fn(),
  })),
  commands: {
    registerCommand: jest.fn(),
    executeCommand: jest.fn(),
  },
  Uri: {
    file: jest.fn(path => ({ fsPath: path })),
  },
}));

jest.mock('../src/utils/exec', () => ({
  execAsync: jest.fn(),
}));

beforeEach(() => {
  jest.clearAllMocks();
  (execAsync as jest.Mock).mockReset();
});
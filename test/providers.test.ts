import * as vscode from 'vscode';
import { BranchViewProvider, LogViewProvider } from '../src/providers/_index';
import { GitService } from '../src/services/gitService';
import { expect, jest, describe, it, beforeEach } from '@jest/globals';


describe('View Providers', () => {
    let gitService: GitService;
    let branchViewProvider: BranchViewProvider;
    let logViewProvider: LogViewProvider;

    beforeEach(() => {
        gitService = new GitService();
        branchViewProvider = new BranchViewProvider(vscode.Uri.file('/test'), gitService);
        logViewProvider = new LogViewProvider(vscode.Uri.file('/test'), gitService);
    });

    describe('BranchViewProvider', () => {
        it('should initialize with correct properties', () => {
            expect(branchViewProvider).toBeDefined();
            expect(branchViewProvider['_gitService']).toBe(gitService);
        });

        it('should generate webview HTML content', async () => {
            const webview = {
                asWebviewUri: jest.fn(uri => uri),
                cspSource: 'test-source'
            };

            const html = await branchViewProvider['_getHtmlForWebview'](webview as any);
            expect(html).toContain('<!DOCTYPE html>');
            expect(html).toContain('<title>Git Oracle Branches</title>');
        });
    });

    describe('LogViewProvider', () => {
        it('should initialize with correct properties', () => {
            expect(logViewProvider).toBeDefined();
            expect(logViewProvider['_gitService']).toBe(gitService);
        });

        it('should generate webview HTML content', async () => {
            const webview = {
                asWebviewUri: jest.fn(uri => uri),
                cspSource: 'test-source'
            };

            const html = await logViewProvider['_getHtmlForWebview'](webview as any);
            expect(html).toContain('<!DOCTYPE html>');
            expect(html).toContain('<title>Git Oracle Status</title>');
        });

        it('should handle message posts', () => {
            const message = { command: 'refresh' };
            const webviewView = {
                webview: {
                    postMessage: jest.fn()
                }
            };
            logViewProvider['_view'] = webviewView as any;

            logViewProvider['_handleMessage'](message);
            expect(webviewView.webview.postMessage).toHaveBeenCalled();
        });
    });
});
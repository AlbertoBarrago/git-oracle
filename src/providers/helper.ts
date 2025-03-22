import { GenerateHelperHtml } from "../utils/helper";
export interface Refreshable<T = void> {
    refresh(): Promise<T> | T;
}

export class Views {
    private providers: Refreshable<any>[] = [];
    private generateHelperHtml = new GenerateHelperHtml();

    public addProviders(providers: Refreshable<any>[]): void {
        this.providers.push(...providers);
    }

    public refresh(): void {
        this.providers.forEach(provider => provider.refresh());
    }

    public isWorkspaceAvailable(workspace: { workspaceFolders: unknown }): boolean {
        return workspace.workspaceFolders !== undefined;
    }

    public generateNoRepoHtml(): string {
        return this.generateHelperHtml.html;
    }
}
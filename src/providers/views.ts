
export interface Refreshable<T = void> {
    refresh(): Promise<T> | T;
}

export class Views {
    private providers: Refreshable<any>[] = [];

    public addProviders(providers: Refreshable<any>[]): void {
        this.providers.push(...providers);
    }

    public refresh(): void {
        this.providers.forEach(provider => provider.refresh());
    }
}
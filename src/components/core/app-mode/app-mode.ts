export type AppMode = 'full' | 'showcase';

export function detectAppMode(_appName: string): AppMode {
    return 'full';
}

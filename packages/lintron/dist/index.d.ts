import { LintronConfig, InterceptedRequest, BreakpointResolution, RequestLogEntry } from './types';
export * from './types';
export { networkEngine } from './throttler/network-engine';
export declare class LintronClient {
    private config;
    private ws;
    private isConnected;
    private isBreakpointEnabled;
    private breakpointRule;
    private pendingBreakpoints;
    constructor(config?: LintronConfig);
    connect(): void;
    private sendHandshake;
    send(message: {
        type: string;
        payload: any;
    }): void;
    private handleMessage;
    onStorageQuery?: () => void;
    onStorageClear?: () => void;
    getIsBreakpointEnabled(): boolean;
    shouldIntercept(method: string, url: string): boolean;
    requestBreakpointResolution(req: InterceptedRequest): Promise<BreakpointResolution>;
    sendLogRequest(entry: RequestLogEntry): void;
}
/**
 * Initializes Lintron in your React Native / Expo application.
 *
 * Example:
 * ```ts
 * import { initLintron } from 'lintron';
 *
 * if (__DEV__) {
 *   initLintron({ appName: 'My Awesome App' });
 * }
 * ```
 */
export declare function initLintron(config?: LintronConfig): LintronClient;
declare const _default: {
    initLintron: typeof initLintron;
    LintronClient: typeof LintronClient;
    networkEngine: import("./throttler/network-engine").NetworkEngine;
};
export default _default;
//# sourceMappingURL=index.d.ts.map
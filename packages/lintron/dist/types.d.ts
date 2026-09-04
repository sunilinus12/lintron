export interface LintronConfig {
    host?: string;
    port?: number;
    appName?: string;
    enabled?: boolean;
    captureLogs?: boolean;
}
export interface NetworkProfile {
    name: string;
    speed: number;
    latency: number;
}
export interface BreakpointRule {
    enabled: boolean;
    urlPattern?: string;
    method?: string;
}
export interface InterceptedRequest {
    id: string;
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: string;
    time: string;
}
export interface BreakpointResolution {
    id: string;
    action: 'forward' | 'abort' | 'mock';
    modifiedBody?: string;
    mockStatus?: number;
    mockBody?: string;
}
export interface RequestLogEntry {
    id: string;
    time: string;
    method: string;
    url: string;
    host: string;
    port: number;
    status: string;
    statusCode?: number;
    headers: Record<string, string>;
    body?: string;
    responseHeaders?: Record<string, string>;
    responseBody?: string;
    curl: string;
    durationMs: number;
    sizeBytes: number;
}
//# sourceMappingURL=types.d.ts.map
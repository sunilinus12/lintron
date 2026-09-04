import { LintronConfig, NetworkProfile, InterceptedRequest, BreakpointResolution, RequestLogEntry } from './types';
import { networkEngine } from './throttler/network-engine';
import { setupFetchInterceptor } from './interceptors/fetch';

export * from './types';
export { networkEngine } from './throttler/network-engine';

export class LintronClient {
  private config: LintronConfig;
  private ws: any = null;
  private isConnected: boolean = false;
  private isBreakpointEnabled: boolean = false;
  private pendingBreakpoints = new Map<string, (res: BreakpointResolution) => void>();

  constructor(config: LintronConfig = {}) {
    this.config = {
      host: config.host || 'localhost',
      port: config.port || 9090,
      appName: config.appName || 'React Native App',
      enabled: config.enabled !== undefined ? config.enabled : true,
      captureLogs: config.captureLogs !== undefined ? config.captureLogs : true,
    };
  }

  public connect(): void {
    if (!this.config.enabled) return;

    const url = `ws://${this.config.host}:${this.config.port}`;
    console.log(`[Lintron] Connecting to Lintron Desktop at ${url}...`);

    try {
      const globalScope = typeof global !== 'undefined' ? (global as any) : (window as any);
      const SocketConstructor = globalScope.WebSocket;

      if (!SocketConstructor) {
        console.warn('[Lintron] WebSocket constructor not found in environment.');
        return;
      }

      this.ws = new SocketConstructor(url);

      this.ws.onopen = () => {
        this.isConnected = true;
        console.log('[Lintron] ⚡ Connected to Lintron Desktop Dashboard');
        this.sendHandshake();
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        console.log('[Lintron] Disconnected from Desktop. Reconnecting in 3s...');
        setTimeout(() => this.connect(), 3000);
      };

      this.ws.onerror = (err: any) => {
        // Silent or debug log
      };

      this.ws.onmessage = (event: any) => {
        this.handleMessage(event.data);
      };
    } catch (e) {
      console.warn('[Lintron] Failed to establish connection:', e);
    }
  }

  private sendHandshake(): void {
    let platform = 'React Native';
    try {
      const globalScope = typeof global !== 'undefined' ? (global as any) : (window as any);
      if (globalScope.expo) platform = 'Expo';
      else if (globalScope.navigator?.product === 'ReactNative') platform = 'React Native Bare';
    } catch (e) {}

    this.send({
      type: 'HANDSHAKE',
      payload: {
        appName: this.config.appName,
        platform,
        clientVersion: '1.0.0',
        timestamp: Date.now(),
      },
    });
  }

  public send(message: { type: string; payload: any }): void {
    if (this.ws && this.isConnected) {
      try {
        this.ws.send(JSON.stringify(message));
      } catch (e) {
        console.warn('[Lintron] Send failed:', e);
      }
    }
  }

  private handleMessage(raw: string): void {
    try {
      const data = JSON.parse(raw);
      switch (data.type) {
        case 'INIT_STATE': {
          if (data.payload?.profile) {
            networkEngine.setProfile(data.payload.profile);
          }
          if (data.payload?.isBreakpointEnabled !== undefined) {
            this.isBreakpointEnabled = data.payload.isBreakpointEnabled;
          }
          if (data.payload?.isOfflineMode !== undefined) {
            networkEngine.setOffline(data.payload.isOfflineMode);
          }
          break;
        }

        case 'SET_PROFILE': {
          networkEngine.setProfile(data.payload);
          break;
        }

        case 'SET_OFFLINE': {
          networkEngine.setOffline(data.payload.isOffline);
          break;
        }

        case 'SET_BREAKPOINT_ENABLED': {
          this.isBreakpointEnabled = data.payload.isBreakpointEnabled;
          break;
        }

        case 'BREAKPOINT_RESOLVED': {
          const { id, action, modifiedBody } = data.payload;
          const resolver = this.pendingBreakpoints.get(id);
          if (resolver) {
            resolver({ id, action, modifiedBody });
            this.pendingBreakpoints.delete(id);
          }
          break;
        }
      }
    } catch (e) {
      console.warn('[Lintron] Could not parse message:', raw);
    }
  }

  public getIsBreakpointEnabled(): boolean {
    return this.isBreakpointEnabled;
  }

  public requestBreakpointResolution(req: InterceptedRequest): Promise<BreakpointResolution> {
    return new Promise((resolve) => {
      this.pendingBreakpoints.set(req.id, resolve);
      this.send({
        type: 'BREAKPOINT_INTERCEPT',
        payload: req,
      });
    });
  }

  public sendLogRequest(entry: RequestLogEntry): void {
    this.send({
      type: 'LOG_REQUEST',
      payload: entry,
    });
  }
}

let defaultInstance: LintronClient | null = null;

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
export function initLintron(config?: LintronConfig): LintronClient {
  if (!defaultInstance) {
    defaultInstance = new LintronClient(config);
    defaultInstance.connect();
    setupFetchInterceptor(defaultInstance);
  }
  return defaultInstance;
}

export default {
  initLintron,
  LintronClient,
  networkEngine,
};

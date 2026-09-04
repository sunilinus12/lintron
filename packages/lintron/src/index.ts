/**
 * Lintron Client SDK
 * Next-Gen Network Debugger & Chaos Engineering Tool for React Native and Expo
 */

export interface LintronConfig {
  /**
   * Host address where Lintron Desktop is running.
   * Defaults to 'localhost' (or '10.0.2.2' on Android Emulator).
   */
  host?: string;

  /**
   * WebSocket port used by Lintron Desktop.
   * Defaults to 9090.
   */
  port?: number;

  /**
   * Application name to display in the Lintron dashboard.
   */
  appName?: string;

  /**
   * Whether to auto-connect on initialization.
   * Defaults to true in __DEV__.
   */
  enabled?: boolean;
}

export interface NetworkProfile {
  name: string;
  speed: number; // in bytes per second
  latency: number; // in milliseconds
}

export class LintronClient {
  private config: LintronConfig;
  private ws: any = null;
  private isConnected: boolean = false;

  constructor(config: LintronConfig = {}) {
    this.config = {
      host: config.host || 'localhost',
      port: config.port || 9090,
      appName: config.appName || 'React Native App',
      enabled: config.enabled !== undefined ? config.enabled : true,
    };
  }

  public connect(): void {
    if (!this.config.enabled) return;

    const url = `ws://${this.config.host}:${this.config.port}`;
    console.log(`[Lintron] Connecting to Desktop Dashboard at ${url}...`);

    try {
      // Standard WebSocket in React Native environment
      const SocketConstructor = (global as any).WebSocket;
      if (!SocketConstructor) {
        console.warn('[Lintron] WebSocket is not available in this environment.');
        return;
      }

      this.ws = new SocketConstructor(url);

      this.ws.onopen = () => {
        this.isConnected = true;
        console.log('[Lintron] ⚡ Connected to Lintron Desktop');
        this.sendHandshake();
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        console.log('[Lintron] Disconnected from Lintron Desktop. Reconnecting in 3s...');
        setTimeout(() => this.connect(), 3000);
      };

      this.ws.onerror = (err: any) => {
        console.warn('[Lintron] Connection error:', err?.message || err);
      };

      this.ws.onmessage = (event: any) => {
        this.handleMessage(event.data);
      };
    } catch (e) {
      console.warn('[Lintron] Failed to establish connection:', e);
    }
  }

  private sendHandshake(): void {
    this.send({
      type: 'HANDSHAKE',
      payload: {
        appName: this.config.appName,
        timestamp: Date.now(),
        clientVersion: '1.0.0',
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
      console.log('[Lintron] Received event:', data.type);
    } catch (e) {
      console.warn('[Lintron] Could not parse message:', raw);
    }
  }
}

let defaultInstance: LintronClient | null = null;

/**
 * Initializes Lintron in your React Native / Expo application.
 *
 * Usage:
 * ```ts
 * import { initLintron } from 'lintron';
 *
 * if (__DEV__) {
 *   initLintron();
 * }
 * ```
 */
export function initLintron(config?: LintronConfig): LintronClient {
  if (!defaultInstance) {
    defaultInstance = new LintronClient(config);
    defaultInstance.connect();
  }
  return defaultInstance;
}

export default {
  initLintron,
  LintronClient,
};

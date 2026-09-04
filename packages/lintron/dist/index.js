"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LintronClient = exports.networkEngine = void 0;
exports.initLintron = initLintron;
const network_engine_1 = require("./throttler/network-engine");
const fetch_1 = require("./interceptors/fetch");
const xhr_1 = require("./interceptors/xhr");
const console_1 = require("./interceptors/console");
const storage_explorer_1 = require("./storage/storage-explorer");
__exportStar(require("./types"), exports);
var network_engine_2 = require("./throttler/network-engine");
Object.defineProperty(exports, "networkEngine", { enumerable: true, get: function () { return network_engine_2.networkEngine; } });
class LintronClient {
    constructor(config = {}) {
        this.ws = null;
        this.isConnected = false;
        this.isBreakpointEnabled = false;
        this.breakpointRule = { enabled: false, urlPattern: '', method: 'ALL' };
        this.pendingBreakpoints = new Map();
        this.config = {
            host: config.host || 'localhost',
            port: config.port || 9090,
            appName: config.appName || 'React Native App',
            enabled: config.enabled !== undefined ? config.enabled : true,
            captureLogs: config.captureLogs !== undefined ? config.captureLogs : true,
        };
    }
    connect() {
        if (!this.config.enabled)
            return;
        const url = `ws://${this.config.host}:${this.config.port}`;
        console.log(`[Lintron] Connecting to Lintron Desktop at ${url}...`);
        try {
            const globalScope = typeof global !== 'undefined' ? global : window;
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
            this.ws.onerror = (err) => {
                // Silent or debug log
            };
            this.ws.onmessage = (event) => {
                this.handleMessage(event.data);
            };
        }
        catch (e) {
            console.warn('[Lintron] Failed to establish connection:', e);
        }
    }
    sendHandshake() {
        let platform = 'React Native';
        try {
            const globalScope = typeof global !== 'undefined' ? global : window;
            if (globalScope.expo)
                platform = 'Expo';
            else if (globalScope.navigator?.product === 'ReactNative')
                platform = 'React Native Bare';
        }
        catch (e) { }
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
    send(message) {
        if (this.ws && this.isConnected) {
            try {
                this.ws.send(JSON.stringify(message));
            }
            catch (e) {
                console.warn('[Lintron] Send failed:', e);
            }
        }
    }
    handleMessage(raw) {
        try {
            const data = JSON.parse(raw);
            switch (data.type) {
                case 'INIT_STATE': {
                    if (data.payload?.profile) {
                        network_engine_1.networkEngine.setProfile(data.payload.profile);
                    }
                    if (data.payload?.isBreakpointEnabled !== undefined) {
                        this.isBreakpointEnabled = data.payload.isBreakpointEnabled;
                    }
                    if (data.payload?.isOfflineMode !== undefined) {
                        network_engine_1.networkEngine.setOffline(data.payload.isOfflineMode);
                    }
                    break;
                }
                case 'SET_PROFILE': {
                    network_engine_1.networkEngine.setProfile(data.payload);
                    break;
                }
                case 'SET_OFFLINE': {
                    network_engine_1.networkEngine.setOffline(data.payload.isOffline);
                    break;
                }
                case 'SET_BREAKPOINT_ENABLED': {
                    this.isBreakpointEnabled = !!data.payload?.isBreakpointEnabled;
                    if (data.payload?.rule) {
                        this.breakpointRule = data.payload.rule;
                    }
                    break;
                }
                case 'SET_BREAKPOINT_RULE': {
                    if (data.payload) {
                        this.breakpointRule = {
                            enabled: data.payload.enabled !== undefined ? data.payload.enabled : true,
                            urlPattern: data.payload.urlPattern || '',
                            method: data.payload.method || 'ALL',
                        };
                        this.isBreakpointEnabled = this.breakpointRule.enabled;
                    }
                    break;
                }
                case 'BREAKPOINT_RESOLVED': {
                    const { id, action, modifiedBody, mockStatus, mockBody } = data.payload;
                    const resolver = this.pendingBreakpoints.get(id);
                    if (resolver) {
                        resolver({ id, action, modifiedBody, mockStatus, mockBody });
                        this.pendingBreakpoints.delete(id);
                    }
                    break;
                }
                case 'SET_PACKET_LOSS': {
                    if (data.payload?.rate !== undefined) {
                        network_engine_1.networkEngine.setPacketLoss(data.payload.rate);
                    }
                    break;
                }
                case 'STORAGE_FETCH': {
                    if (this.onStorageQuery)
                        this.onStorageQuery();
                    break;
                }
                case 'STORAGE_CLEAR': {
                    if (this.onStorageClear)
                        this.onStorageClear();
                    break;
                }
            }
        }
        catch (e) {
            console.warn('[Lintron] Could not parse message:', raw);
        }
    }
    getIsBreakpointEnabled() {
        return this.isBreakpointEnabled;
    }
    shouldIntercept(method, url) {
        if (!this.isBreakpointEnabled && !this.breakpointRule.enabled)
            return false;
        if (this.breakpointRule.method && this.breakpointRule.method !== 'ALL' && this.breakpointRule.method.toUpperCase() !== method.toUpperCase()) {
            return false;
        }
        if (this.breakpointRule.urlPattern && this.breakpointRule.urlPattern.trim() !== '') {
            return url.toLowerCase().includes(this.breakpointRule.urlPattern.trim().toLowerCase());
        }
        return true;
    }
    requestBreakpointResolution(req) {
        return new Promise((resolve) => {
            this.pendingBreakpoints.set(req.id, resolve);
            this.send({
                type: 'BREAKPOINT_INTERCEPT',
                payload: req,
            });
        });
    }
    sendLogRequest(entry) {
        this.send({
            type: 'LOG_REQUEST',
            payload: entry,
        });
    }
}
exports.LintronClient = LintronClient;
let defaultInstance = null;
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
function initLintron(config) {
    if (!defaultInstance) {
        defaultInstance = new LintronClient(config);
        defaultInstance.connect();
        (0, fetch_1.setupFetchInterceptor)(defaultInstance);
        (0, xhr_1.setupXhrInterceptor)(defaultInstance);
        (0, console_1.setupConsoleInterceptor)(defaultInstance);
        (0, storage_explorer_1.setupStorageExplorer)(defaultInstance);
    }
    return defaultInstance;
}
exports.default = {
    initLintron,
    LintronClient,
    networkEngine: network_engine_1.networkEngine,
};
//# sourceMappingURL=index.js.map
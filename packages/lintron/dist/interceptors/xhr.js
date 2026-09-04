"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupXhrInterceptor = setupXhrInterceptor;
const network_engine_1 = require("../throttler/network-engine");
let isXhrInterceptorActive = false;
function setupXhrInterceptor(client) {
    if (isXhrInterceptorActive)
        return;
    const globalScope = typeof global !== 'undefined' ? global : window;
    if (!globalScope.XMLHttpRequest) {
        return;
    }
    const OriginalXHR = globalScope.XMLHttpRequest;
    isXhrInterceptorActive = true;
    class LintronXHR extends OriginalXHR {
        constructor() {
            super(...arguments);
            this._lintronMeta = {
                id: '',
                method: 'GET',
                url: '',
                headers: {},
                startTime: 0,
            };
        }
        open(method, url, async = true, user, password) {
            this._lintronMeta.id = `xhr_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
            this._lintronMeta.method = (method || 'GET').toUpperCase();
            this._lintronMeta.url = typeof url === 'string' ? url : url.toString();
            this._lintronMeta.headers = {};
            return super.open(method, url, async, user, password);
        }
        setRequestHeader(name, value) {
            if (this._lintronMeta) {
                this._lintronMeta.headers[name] = value;
            }
            return super.setRequestHeader(name, value);
        }
        send(body) {
            this._lintronMeta.startTime = Date.now();
            this._lintronMeta.body = body;
            const { method, url, headers } = this._lintronMeta;
            let bodyStr = undefined;
            if (body) {
                if (typeof body === 'string') {
                    bodyStr = body;
                }
                else {
                    try {
                        bodyStr = JSON.stringify(body);
                    }
                    catch (e) {
                        bodyStr = '[FormData / Binary]';
                    }
                }
            }
            // Generate cURL
            let curl = `curl -X ${method} "${url}"`;
            for (const [k, v] of Object.entries(headers)) {
                curl += ` \\\n  -H "${k}: ${v}"`;
            }
            if (bodyStr) {
                const escaped = bodyStr.replace(/'/g, "'\\''");
                curl += ` \\\n  --data-raw '${escaped}'`;
            }
            // Check Offline Mode Simulation
            if (network_engine_1.networkEngine.getIsOffline()) {
                setTimeout(() => {
                    try {
                        const errorEvent = new Event('error');
                        this.dispatchEvent(errorEvent);
                    }
                    catch (e) { }
                    const logEntry = {
                        id: this._lintronMeta.id,
                        time: new Date().toLocaleTimeString(),
                        method,
                        url,
                        host: 'offline',
                        port: 0,
                        status: 'ERR_INTERNET_DISCONNECTED',
                        statusCode: 0,
                        headers,
                        body: bodyStr,
                        curl,
                        durationMs: 5,
                        sizeBytes: 0,
                    };
                    client.sendLogRequest(logEntry);
                }, 10);
                return;
            }
            // Setup response completion listener
            this.addEventListener('loadend', () => {
                const durationMs = Date.now() - this._lintronMeta.startTime;
                let responseBodyStr = '';
                let sizeBytes = 0;
                try {
                    if (typeof this.responseText === 'string') {
                        responseBodyStr = this.responseText;
                        sizeBytes = this.responseText.length;
                    }
                }
                catch (e) { }
                let host = '';
                let port = 443;
                try {
                    const parsed = new URL(url);
                    host = parsed.hostname;
                    port = parseInt(parsed.port) || (parsed.protocol === 'https:' ? 443 : 80);
                }
                catch (e) {
                    host = 'unknown-host';
                }
                const logEntry = {
                    id: this._lintronMeta.id,
                    time: new Date().toLocaleTimeString(),
                    method,
                    url,
                    host,
                    port,
                    status: `${this.status} ${this.statusText || 'OK'}`,
                    statusCode: this.status,
                    headers,
                    body: bodyStr,
                    responseBody: responseBodyStr.length < 5000 ? responseBodyStr : '[Large Response Truncated]',
                    curl,
                    durationMs,
                    sizeBytes,
                };
                client.sendLogRequest(logEntry);
            });
            // Check Breakpoint
            if (client.shouldIntercept(method, url)) {
                client.requestBreakpointResolution({
                    id: this._lintronMeta.id,
                    method,
                    url,
                    headers,
                    body: bodyStr,
                    time: new Date().toLocaleTimeString(),
                }).then((res) => {
                    if (res.action === 'abort') {
                        try {
                            super.abort();
                        }
                        catch (e) { }
                        return;
                    }
                    if (res.action === 'mock') {
                        const mockStatus = res.mockStatus || 200;
                        const mockBody = res.mockBody || '{}';
                        try {
                            Object.defineProperty(this, 'status', { value: mockStatus, writable: true });
                            Object.defineProperty(this, 'statusText', { value: mockStatus === 200 ? 'OK' : 'Mocked', writable: true });
                            Object.defineProperty(this, 'responseText', { value: mockBody, writable: true });
                            Object.defineProperty(this, 'response', { value: mockBody, writable: true });
                            Object.defineProperty(this, 'readyState', { value: 4, writable: true });
                            this.dispatchEvent(new Event('readystatechange'));
                            this.dispatchEvent(new Event('load'));
                            this.dispatchEvent(new Event('loadend'));
                        }
                        catch (e) { }
                        return;
                    }
                    const sendBody = res.action === 'forward' && res.modifiedBody !== undefined ? res.modifiedBody : body;
                    super.send(sendBody);
                }).catch(() => {
                    super.send(body);
                });
                return;
            }
            // Apply initial latency delay if profile specifies it
            const profile = network_engine_1.networkEngine.getProfile();
            if (profile && profile.latency > 15) {
                setTimeout(() => {
                    super.send(body);
                }, profile.latency);
            }
            else {
                super.send(body);
            }
        }
    }
    globalScope.XMLHttpRequest = LintronXHR;
    console.log('[Lintron] 🚀 XMLHttpRequest / Axios Interceptor initialized');
}
//# sourceMappingURL=xhr.js.map
const { WebSocketServer } = require('ws');

class LintronWsServer {
    constructor(options = {}) {
        this.port = options.port || 9090;
        this.wss = null;
        this.clients = new Map(); // ws -> clientMetadata
        this.callbacks = {
            onClientConnected: options.onClientConnected || (() => {}),
            onClientDisconnected: options.onClientDisconnected || (() => {}),
            onBreakpointIntercept: options.onBreakpointIntercept || (() => {}),
            onLogRequest: options.onLogRequest || (() => {}),
            onClientMessage: options.onClientMessage || (() => {})
        };
        this.pendingBreakpoints = new Map(); // bpId -> { ws, resolve }
    }

    start() {
        try {
            this.wss = new WebSocketServer({ port: this.port, host: '0.0.0.0' }, () => {
                console.log(`[Lintron WS] ⚡ WebSocket server listening on 0.0.0.0:${this.port}`);
            });

            this.wss.on('connection', (ws, req) => {
                const clientIp = req.socket.remoteAddress;
                const clientId = `client_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
                
                const clientInfo = {
                    id: clientId,
                    ip: clientIp,
                    appName: 'Unknown App',
                    platform: 'React Native / Expo',
                    connectedAt: new Date().toLocaleTimeString()
                };

                this.clients.set(ws, clientInfo);
                console.log(`[Lintron WS] Client connected from ${clientIp} (${clientId})`);

                ws.on('message', (raw) => {
                    this.handleMessage(ws, raw);
                });

                ws.on('close', () => {
                    const info = this.clients.get(ws);
                    this.clients.delete(ws);
                    console.log(`[Lintron WS] Client disconnected: ${info?.id || clientId}`);
                    this.callbacks.onClientDisconnected(info);
                });

                ws.on('error', (err) => {
                    console.warn(`[Lintron WS] Client error:`, err.message);
                });
            });

            this.wss.on('error', (err) => {
                console.error(`[Lintron WS] Server error:`, err);
            });
        } catch (err) {
            console.error('[Lintron WS] Failed to start WebSocket server:', err);
        }
    }

    handleMessage(ws, raw) {
        try {
            const data = JSON.parse(raw.toString());
            const clientInfo = this.clients.get(ws);

            switch (data.type) {
                case 'HANDSHAKE': {
                    if (clientInfo && data.payload) {
                        clientInfo.appName = data.payload.appName || clientInfo.appName;
                        clientInfo.platform = data.payload.platform || clientInfo.platform;
                        clientInfo.clientVersion = data.payload.clientVersion || '1.0.0';
                    }
                    console.log(`[Lintron WS] 🤝 Handshake from ${clientInfo.appName} (${clientInfo.platform})`);
                    this.callbacks.onClientConnected(clientInfo, ws);
                    break;
                }

                case 'LOG_REQUEST': {
                    this.callbacks.onLogRequest(data.payload, clientInfo);
                    break;
                }

                case 'BREAKPOINT_INTERCEPT': {
                    const bpPayload = data.payload;
                    this.pendingBreakpoints.set(bpPayload.id, { ws });
                    this.callbacks.onBreakpointIntercept(bpPayload, clientInfo);
                    break;
                }

                default: {
                    this.callbacks.onClientMessage(data, clientInfo, ws);
                }
            }
        } catch (e) {
            console.warn('[Lintron WS] Invalid JSON message received:', e);
        }
    }

    resolveBreakpoint(id, action, modifiedBody) {
        const entry = this.pendingBreakpoints.get(id);
        if (entry && entry.ws) {
            this.send(entry.ws, {
                type: 'BREAKPOINT_RESOLVED',
                payload: { id, action, modifiedBody }
            });
            this.pendingBreakpoints.delete(id);
            return true;
        }
        return false;
    }

    broadcast(data) {
        if (!this.wss) return;
        const messageStr = typeof data === 'string' ? data : JSON.stringify(data);
        for (const [ws] of this.clients.entries()) {
            if (ws.readyState === 1) { // OPEN
                ws.send(messageStr);
            }
        }
    }

    send(ws, data) {
        if (ws && ws.readyState === 1) {
            const messageStr = typeof data === 'string' ? data : JSON.stringify(data);
            ws.send(messageStr);
        }
    }

    getConnectedClients() {
        return Array.from(this.clients.values());
    }
}

module.exports = LintronWsServer;

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { exec } = require('child_process');
const net = require('net');
const { Transform } = require('stream');

const ADB_PATH = '/Users/linus/Library/Android/sdk/platform-tools/adb';
const PROXY_PORT = 8080;
const WS_PORT = 9090;
const LintronWsServer = require('./ws-server');

let mainWindow = null;
let isBreakpointEnabled = false;
let pendingBreakpoints = new Map();

let currentProfile = {
    speed: 10000000, 
    latency: 0,     
    mode: 'Good'
};

const PROFILES = {
    '1G': { speed: 1200, latency: 1000 },
    '2G': { speed: 31250, latency: 400 },
    '3G': { speed: 187500, latency: 150 },
    '4G': { speed: 3125000, latency: 40 },
    '5G': { speed: 18750000, latency: 15 },
    'Good': { speed: 10000000, latency: 0 },
    'Bad': { speed: 5000, latency: 800 },
};

// Telemetry state
let telemetry = {
    activeSockets: 0,
    totalRequests: 0,
    totalBytes: 0,
    recentLogs: []
};

function logRequest(method, host, port, status = '200 OK') {
    const time = new Date().toLocaleTimeString();
    const entry = { time, method, host, port, status };
    telemetry.recentLogs.unshift(entry);
    if (telemetry.recentLogs.length > 50) telemetry.recentLogs.pop();
    console.log(`[Proxy] ${time} - ${method} ${host}:${port} [${status}]`);
}

class ThrottleStream extends Transform {
    constructor(options) {
        super(options);
        this.bytesTransferred = 0;
        this.startTime = Date.now();
        this.initialLatencyApplied = false;
    }

    _transform(chunk, encoding, callback) {
        const { speed, latency } = currentProfile;
        
        telemetry.totalBytes += chunk.length;

        if (latency === 0 && speed >= 10000000) {
            this.push(chunk);
            return callback();
        }

        let delay = 0;
        if (!this.initialLatencyApplied) {
            this.initialLatencyApplied = true;
            delay += latency;
        }

        this.bytesTransferred += chunk.length;
        const expectedTimeMs = (this.bytesTransferred / speed) * 1000;
        const actualTimeMs = Date.now() - this.startTime;
        const bandwidthDelay = Math.max(0, expectedTimeMs - actualTimeMs);

        const totalDelay = Math.min(10000, delay + bandwidthDelay);

        if (totalDelay <= 5) {
            this.push(chunk);
            return callback();
        }

        setTimeout(() => {
            this.push(chunk);
            callback();
        }, totalDelay);
    }
}

let requestCounter = 0;

function parseHttpRequest(data) {
    const raw = data.toString('utf-8');
    const parts = raw.split('\r\n\r\n');
    const headerLines = (parts[0] || '').split('\r\n');
    const firstLine = headerLines[0] || '';
    const firstLineParts = firstLine.split(' ');
    
    const method = firstLineParts[0] || 'GET';
    const target = firstLineParts[1] || '/';
    const httpVersion = firstLineParts[2] || 'HTTP/1.1';
    
    const headers = {};
    for (let i = 1; i < headerLines.length; i++) {
        const line = headerLines[i];
        const colonIdx = line.indexOf(':');
        if (colonIdx !== -1) {
            const key = line.substring(0, colonIdx).trim();
            const val = line.substring(colonIdx + 1).trim();
            headers[key] = val;
        }
    }

    let host = headers['Host'] || headers['host'] || '';
    let port = 80;
    
    if (method === 'CONNECT') {
        const hostParts = target.split(':');
        host = hostParts[0];
        port = parseInt(hostParts[1]) || 443;
    } else if (target.startsWith('http')) {
        try {
            const u = new URL(target);
            host = u.hostname;
            port = parseInt(u.port) || (u.protocol === 'https:' ? 443 : 80);
        } catch (e) {}
    } else if (host) {
        const hostParts = host.split(':');
        host = hostParts[0];
        port = parseInt(hostParts[1]) || 80;
    }

    let url = target;
    if (!url.startsWith('http')) {
        const scheme = port === 443 ? 'https' : 'http';
        url = `${scheme}://${host}${target.startsWith('/') ? '' : '/'}${target}`;
    }

    const body = parts.slice(1).join('\r\n\r\n').trim();

    let curl = `curl -X ${method} "${url}"`;
    for (const [k, v] of Object.entries(headers)) {
        curl += ` \\\n  -H "${k}: ${v}"`;
    }
    if (body) {
        const escapedBody = body.replace(/'/g, "'\\''");
        curl += ` \\\n  --data-raw '${escapedBody}'`;
    }

    return {
        method,
        target,
        host,
        port,
        url,
        httpVersion,
        headers,
        body,
        curl
    };
}

function logDetailedRequest(parsed, status = '200 OK') {
    requestCounter++;
    const id = `req_${Date.now()}_${requestCounter}`;
    const time = new Date().toLocaleTimeString();
    
    const entry = {
        id,
        time,
        method: parsed.method,
        host: parsed.host,
        port: parsed.port,
        url: parsed.url,
        status,
        headers: parsed.headers,
        body: parsed.body,
        curl: parsed.curl
    };

    telemetry.recentLogs.unshift(entry);
    if (telemetry.recentLogs.length > 50) telemetry.recentLogs.pop();
    console.log(`[Proxy] ${time} - ${parsed.method} ${parsed.host}:${parsed.port} [${status}]`);
}

let isOfflineMode = false;
let isSystemInternetOff = false;

const server = net.createServer((socket) => {
    socket.setNoDelay(true);

    if (isOfflineMode || isSystemInternetOff) {
        logRequest('OFFLINE', 'DROPPED', '0.0.0.0', 'ERR_INTERNET_DISCONNECTED');
        socket.destroy();
        return;
    }

    telemetry.activeSockets++;

    socket.on('close', () => {
        telemetry.activeSockets = Math.max(0, telemetry.activeSockets - 1);
    });

    let remote = null;

    socket.once('data', async (data) => {
        socket.pause();
        telemetry.totalRequests++;
        
        let parsed = parseHttpRequest(data);
        if (!parsed.method || !parsed.host) {
            socket.resume();
            return socket.destroy();
        }

        // Breakpoint Interception Check
        if (isBreakpointEnabled && (parsed.method === 'POST' || parsed.method === 'PUT' || parsed.method === 'PATCH' || parsed.body)) {
            const bpId = `bp_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
            
            let resolveBp;
            const bpPromise = new Promise((res) => { resolveBp = res; });
            pendingBreakpoints.set(bpId, { resolve: resolveBp });

            if (mainWindow) {
                mainWindow.webContents.send('breakpoint-intercepted', {
                    id: bpId,
                    method: parsed.method,
                    url: parsed.url,
                    host: parsed.host,
                    headers: parsed.headers,
                    body: parsed.body
                });
            }

            logDetailedRequest(parsed, 'PAUSED (Breakpoint)');

            const resAction = await bpPromise;
            pendingBreakpoints.delete(bpId);

            if (resAction.action === 'abort') {
                logDetailedRequest(parsed, 'ABORTED');
                socket.resume();
                return socket.destroy();
            }

            if (resAction.action === 'forward' && resAction.modifiedBody !== undefined) {
                const newBody = resAction.modifiedBody;
                const newHeaders = { ...parsed.headers };
                const bodyBuffer = Buffer.from(newBody, 'utf-8');
                newHeaders['Content-Length'] = bodyBuffer.length.toString();

                let reqLines = [`${parsed.method} ${parsed.target} ${parsed.httpVersion}`];
                for (const [k, v] of Object.entries(newHeaders)) {
                    reqLines.push(`${k}: ${v}`);
                }
                const headerBlock = reqLines.join('\r\n') + '\r\n\r\n';
                data = Buffer.concat([Buffer.from(headerBlock, 'utf-8'), bodyBuffer]);

                parsed = parseHttpRequest(data);
                logDetailedRequest(parsed, 'FORWARDED (Modified)');
            }
        } else {
            logDetailedRequest(parsed, '200 OK');
        }

        const method = parsed.method;
        const host = parsed.host;
        const port = parsed.port;

        remote = net.connect({ port, host }, () => {
            remote.setNoDelay(true);
            if (method === 'CONNECT') {
                socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
            } else {
                remote.write(data);
            }

            const clientToRemote = new ThrottleStream();
            const remoteToClient = new ThrottleStream();

            socket.pipe(clientToRemote).pipe(remote);
            remote.pipe(remoteToClient).pipe(socket);

            socket.resume();
        });

        remote.on('error', (err) => {
            socket.destroy();
        });

        socket.on('error', (err) => {
            if (remote) remote.destroy();
        });
    });
});

server.listen(PROXY_PORT, '0.0.0.0', () => {
    console.log(`[Proxy] Proxy server listening on 0.0.0.0:${PROXY_PORT}`);
});

const wsServer = new LintronWsServer({
    port: WS_PORT,
    onClientConnected: (clientInfo, ws) => {
        wsServer.send(ws, {
            type: 'INIT_STATE',
            payload: {
                profile: currentProfile,
                isBreakpointEnabled,
                isOfflineMode: isOfflineMode || isSystemInternetOff
            }
        });
        if (mainWindow) {
            mainWindow.webContents.send('ws-clients-updated', wsServer.getConnectedClients());
        }
    },
    onClientDisconnected: (clientInfo) => {
        if (mainWindow) {
            mainWindow.webContents.send('ws-clients-updated', wsServer.getConnectedClients());
        }
    },
    onBreakpointIntercept: (bpPayload, clientInfo) => {
        if (mainWindow) {
            mainWindow.webContents.send('breakpoint-intercepted', bpPayload);
        }
        logDetailedRequest(bpPayload, 'PAUSED (Breakpoint - App)');
    },
    onLogRequest: (logEntry, clientInfo) => {
        logDetailedRequest(logEntry, logEntry.status || '200 OK');
    }
});

wsServer.start();

function broadcastProfile() {
    if (wsServer) {
        wsServer.broadcast({
            type: 'SET_PROFILE',
            payload: currentProfile
        });
    }
}

let fluctuationInterval = null;

function setSystemNetworkState(online, deviceId = null) {
    const targetFlag = deviceId && deviceId !== 'all' ? `-s ${deviceId}` : '';
    if (!online) {
        const cmd = `${ADB_PATH} ${targetFlag} shell "cmd connectivity airplane-mode enable; svc wifi disable; svc data disable"`;
        exec(cmd);
    } else {
        const cmd = `${ADB_PATH} ${targetFlag} shell "cmd connectivity airplane-mode disable; svc wifi enable; svc data enable"`;
        exec(cmd);
    }
}

function stopFluctuation(deviceId = null) {
    isOfflineMode = false;
    if (fluctuationInterval) {
        clearInterval(fluctuationInterval);
        fluctuationInterval = null;
    }
    if (!isSystemInternetOff) {
        setSystemNetworkState(true, deviceId);
    }
}

function startMetroFluctuation() {
    stopFluctuation();
    const phases = [
        { name: 'Metro (Station - Good)', speed: 10000000, latency: 35 },
        { name: 'Metro (Tunnel Entry)', speed: 250000, latency: 400 },
        { name: 'Metro (Dead Zone)', speed: 5000, latency: 1800 },
        { name: 'Metro (Tunnel Exit)', speed: 1500000, latency: 120 }
    ];

    let phaseIndex = 0;
    const runPhase = () => {
        const p = phases[phaseIndex];
        currentProfile = {
            speed: p.speed,
            latency: p.latency,
            mode: p.name
        };
        logRequest('SUBWAY', p.name, `${Math.round(p.speed / 1024)}KB/s`, `${p.latency}ms`);
        broadcastProfile();
        phaseIndex = (phaseIndex + 1) % phases.length;
    };

    runPhase();
    fluctuationInterval = setInterval(runPhase, 3500);
}

function startIntermittentBlackout(deviceId = null) {
    stopFluctuation(deviceId);
    let online = false;

    const cycle = () => {
        online = !online;
        isOfflineMode = !online;
        setSystemNetworkState(online, deviceId);

        if (online) {
            currentProfile = { speed: 10000000, latency: 40, mode: 'OS Reconnected 🟢' };
            logRequest('NETWORK', 'OS_ONLINE', 'Android NetworkCallback', 'RECONNECTED');
        } else {
            currentProfile = { speed: 0, latency: 9999, mode: 'OS Disconnected 🔴' };
            logRequest('NETWORK', 'OS_OFFLINE', 'Android NetworkCallback', 'AIRPLANE_MODE_ON');
        }
        broadcastProfile();
    };

    online = false;
    isOfflineMode = true;
    setSystemNetworkState(false, deviceId);
    currentProfile = { speed: 0, latency: 9999, mode: 'OS Disconnected 🔴' };
    logRequest('NETWORK', 'OS_OFFLINE', 'Android NetworkCallback', 'AIRPLANE_MODE_ON');
    broadcastProfile();
    
    fluctuationInterval = setInterval(cycle, 6000);
}

function startRandomFluctuation() {
    stopFluctuation();
    const runRandom = () => {
        const speed = Math.floor(Math.random() * (2000000 - 5000) + 5000);
        const latency = Math.floor(Math.random() * (900 - 40) + 40);
        currentProfile = {
            speed,
            latency,
            mode: 'Fluctuating'
        };
        broadcastProfile();
    };
    runRandom();
    fluctuationInterval = setInterval(runRandom, 3000);
}

if (ipcMain) {
    // Return structured device array
    ipcMain.handle('get-devices', async () => {
        return new Promise((resolve) => {
            exec(`${ADB_PATH} devices -l`, (error, stdout) => {
                if (error || !stdout) return resolve([]);
                const lines = stdout.trim().split('\n').slice(1);
                const devices = [];
                for (const line of lines) {
                    if (!line.trim()) continue;
                    const parts = line.trim().split(/\s+/);
                    if (parts.length >= 2 && parts[1] === 'device') {
                        const id = parts[0];
                        let model = id;
                        const modelMatch = line.match(/model:([^\s]+)/);
                        if (modelMatch) model = modelMatch[1];
                        const isEmulator = id.startsWith('emulator-');
                        devices.push({
                            id,
                            model,
                            name: `${id} (${model})`,
                            type: isEmulator ? 'Emulator' : 'Physical Device'
                        });
                    }
                }
                resolve(devices);
            });
        });
    });

    ipcMain.handle('check-connection', async (event, deviceId) => {
        const serverAlive = await new Promise((resolve) => {
            const client = net.connect({ port: PROXY_PORT, host: '127.0.0.1' }, () => {
                client.destroy();
                resolve(true);
            });
            client.on('error', () => resolve(false));
            setTimeout(() => resolve(false), 2000);
        });

        const targetFlag = deviceId && deviceId !== 'all' ? `-s ${deviceId}` : '';
        const adbProxyEnabled = await new Promise((resolve) => {
            exec(`${ADB_PATH} ${targetFlag} shell settings get global http_proxy`, (error, stdout) => {
                if (error || !stdout) return resolve(false);
                const val = stdout.trim();
                resolve(val.includes('10.0.2.2') || val.includes(`${PROXY_PORT}`));
            });
        });

        const isAirplaneOn = await new Promise((resolve) => {
            exec(`${ADB_PATH} ${targetFlag} shell settings get global airplane_mode_on`, (error, stdout) => {
                if (error || !stdout) return resolve(false);
                resolve(stdout.trim() === '1');
            });
        });

        const isInternetEnabled = !isAirplaneOn && !isSystemInternetOff;

        return { serverAlive, adbProxyEnabled, isInternetEnabled, isBreakpointEnabled };
    });

    ipcMain.handle('set-internet-state', async (event, payload) => {
        const { enabled, deviceId } = typeof payload === 'object' ? payload : { enabled: payload, deviceId: null };
        const targetFlag = deviceId && deviceId !== 'all' ? `-s ${deviceId}` : '';
        
        isSystemInternetOff = !enabled;

        if (!enabled) {
            stopFluctuation(deviceId);
            isOfflineMode = true;
            currentProfile = { speed: 0, latency: 9999, mode: 'Internet OFF' };
            broadcastProfile();
            const cmd = `${ADB_PATH} ${targetFlag} shell "cmd connectivity airplane-mode enable; svc wifi disable; svc data disable"`;
            return new Promise((resolve) => {
                exec(cmd, (error) => {
                    resolve(!error);
                });
            });
        } else {
            isOfflineMode = false;
            currentProfile = { speed: 10000000, latency: 0, mode: 'Good' };
            broadcastProfile();
            const cmd = `${ADB_PATH} ${targetFlag} shell "cmd connectivity airplane-mode disable; svc wifi enable; svc data enable"`;
            return new Promise((resolve) => {
                exec(cmd, (error) => {
                    resolve(!error);
                });
            });
        }
    });

    ipcMain.handle('set-proxy', async (event, payload) => {
        const { enabled, deviceId } = typeof payload === 'object' ? payload : { enabled: payload, deviceId: null };
        const targetFlag = deviceId && deviceId !== 'all' ? `-s ${deviceId}` : '';
        
        if (!enabled) {
            stopFluctuation(deviceId);
        }

        const enableCmd = `${ADB_PATH} ${targetFlag} shell "settings put global http_proxy 10.0.2.2:${PROXY_PORT}; settings put global global_http_proxy_host 10.0.2.2; settings put global global_http_proxy_port ${PROXY_PORT}"`;
        const disableCmd = `${ADB_PATH} ${targetFlag} shell "settings put global http_proxy :0; settings delete global global_http_proxy_host; settings delete global global_http_proxy_port; cmd connectivity airplane-mode disable; svc wifi enable; svc data enable"`;

        const cmd = enabled ? enableCmd : disableCmd;

        return new Promise((resolve) => {
            exec(cmd, (error) => {
                resolve(!error);
            });
        });
    });

    ipcMain.handle('set-breakpoint-state', (event, enabled) => {
        isBreakpointEnabled = enabled;
        if (wsServer) {
            wsServer.broadcast({
                type: 'SET_BREAKPOINT_ENABLED',
                payload: { isBreakpointEnabled: enabled }
            });
        }
        return { success: true, isBreakpointEnabled };
    });

    ipcMain.handle('set-breakpoint-rule', (event, rule) => {
        if (wsServer) {
            wsServer.broadcast({
                type: 'SET_BREAKPOINT_RULE',
                payload: rule
            });
        }
        return { success: true, rule };
    });

    ipcMain.handle('resolve-breakpoint', (event, payload) => {
        const { id, action, modifiedBody, mockStatus, mockBody } = payload || {};
        const pending = pendingBreakpoints.get(id);
        if (pending) {
            pending.resolve({ action, modifiedBody, mockStatus, mockBody });
            return { success: true };
        }
        if (wsServer && wsServer.resolveBreakpoint(id, action, modifiedBody, mockStatus, mockBody)) {
            return { success: true };
        }
        return { success: false, reason: 'Breakpoint not found' };
    });

    ipcMain.handle('update-profile', (event, payload) => {
        if (isSystemInternetOff) {
            return { success: false, reason: 'Internet is switched OFF', profile: currentProfile };
        }

        let profileName = typeof payload === 'string' ? payload : (payload.profileName || payload.name || payload.mode);
        let deviceId = typeof payload === 'object' ? payload.deviceId : null;

        if (profileName === 'Metro' || profileName === 'Subway') {
            startMetroFluctuation();
            broadcastProfile();
            return { success: true, profile: currentProfile };
        } else if (profileName === 'Blackout' || profileName === 'Offline') {
            startIntermittentBlackout(deviceId);
            broadcastProfile();
            return { success: true, profile: currentProfile };
        } else if (profileName === 'Fluctuating' || profileName === 'Fluctuation') {
            startRandomFluctuation();
            broadcastProfile();
            return { success: true, profile: currentProfile };
        } else {
            stopFluctuation(deviceId);
            const p = PROFILES[payload];
            if (p) currentProfile = { ...p, mode: profileName };
            broadcastProfile();
        }
        return { success: true, profile: currentProfile };
    });

    ipcMain.handle('set-packet-loss', (event, rate) => {
        if (wsServer) {
            wsServer.broadcast({
                type: 'SET_PACKET_LOSS',
                payload: { rate: Number(rate) || 0 }
            });
        }
        return { success: true, rate: Number(rate) || 0 };
    });

    ipcMain.handle('get-telemetry', async () => {
        return {
            ...telemetry,
            currentProfile,
            isBreakpointEnabled,
            pendingBreakpointsCount: pendingBreakpoints.size + (wsServer ? wsServer.pendingBreakpoints.size : 0),
            connectedWsClients: wsServer ? wsServer.getConnectedClients() : []
        };
    });
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 650,
        height: 820,
        resizable: true,
        webPreferences: { nodeIntegration: true, contextIsolation: false }
    });
    mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

if (app) {
    app.whenReady().then(createWindow);
}

const http = require('http');
const net = require('net');
const url = require('url');
const { Transform } = require('stream');
const EventEmitter = require('events');

class ThrottleStream extends Transform {
    constructor(profileGetter, onByteTransferred) {
        super();
        this.getProfile = profileGetter;
        this.onByteTransferred = onByteTransferred;
        this.bytesTransferred = 0;
        this.startTime = Date.now();
        this.initialLatencyApplied = false;
    }

    _transform(chunk, encoding, callback) {
        const profile = this.getProfile();

        // 1. Offline Mode Check
        if (profile.mode === 'Offline' || profile.speed === 0) {
            // Drop chunk completely
            return callback(new Error('LinTron: Offline Mode Active'));
        }

        // 2. Subway / Tunnel Mode (5s online, 3s blackout cycle)
        if (profile.mode === 'Subway') {
            const cycleTime = Date.now() % 8000;
            if (cycleTime > 5000) {
                // In blackout window
                return callback(new Error('LinTron: Subway Blackout Window'));
            }
        }

        // 3. Packet Loss Simulation
        if (profile.packetLoss > 0) {
            const roll = Math.random() * 100;
            if (roll < profile.packetLoss) {
                // Drop packet
                return callback(new Error('LinTron: Simulated Packet Loss'));
            }
        }

        this.bytesTransferred += chunk.length;
        if (this.onByteTransferred) {
            this.onByteTransferred(chunk.length);
        }

        // 4. Latency Calculation (Base Latency + Jitter)
        let latencyDelay = 0;
        if (!this.initialLatencyApplied && profile.latency > 0) {
            this.initialLatencyApplied = true;
            const jitterDelay = profile.jitter > 0 ? (Math.random() * profile.jitter) : 0;
            latencyDelay = profile.latency + jitterDelay;
        }

        // 5. Bandwidth Throttling Calculation
        const expectedDurationSec = this.bytesTransferred / profile.speed;
        const actualDurationSec = (Date.now() - this.startTime) / 1000;
        const bandwidthDelayMs = Math.max(0, (expectedDurationSec - actualDurationSec) * 1000);

        const totalDelay = latencyDelay + bandwidthDelayMs;

        if (totalDelay > 5) {
            setTimeout(() => {
                this.push(chunk);
                callback();
            }, Math.min(totalDelay, 10000));
        } else {
            this.push(chunk);
            callback();
        }
    }
}

class LinTronProxyServer extends EventEmitter {
    constructor(port = 8080) {
        super();
        this.port = port;
        this.server = null;
        
        // Active Profile
        this.currentProfile = {
            mode: 'Good',
            speed: 10000000,    // 10 MB/s (effectively unthrottled)
            latency: 0,         // ms
            jitter: 0,          // ms
            packetLoss: 0       // 0%
        };

        // Active Sockets Set for hard severance
        this.activeSockets = new Set();

        // Telemetry
        this.telemetry = {
            activeConnections: 0,
            totalRequests: 0,
            bytesIn: 0,
            bytesOut: 0,
            currentDownloadRate: 0, // KB/s
            currentUploadRate: 0,   // KB/s
            recentRequests: []
        };

        this.lastSampleTime = Date.now();
        this.lastSampleBytesIn = 0;
        this.lastSampleBytesOut = 0;

        // Bandwidth calculation timer
        setInterval(() => this.calculateBandwidthRates(), 1000);
    }

    setProfile(profile) {
        this.currentProfile = { ...this.currentProfile, ...profile };

        // Instant Hard Severance on Offline Mode
        if (this.currentProfile.mode === 'Offline' || this.currentProfile.speed === 0) {
            console.log(`[LinTron Proxy] 🛑 OFFLINE MODE ACTIVE: Dropping ${this.activeSockets.size} active socket(s)`);
            for (const socket of this.activeSockets) {
                try {
                    socket.destroy();
                } catch (e) {}
            }
            this.activeSockets.clear();
            this.telemetry.activeConnections = 0;
        }

        this.emit('profile-changed', this.currentProfile);
    }

    calculateBandwidthRates() {
        const now = Date.now();
        const elapsedSec = (now - this.lastSampleTime) / 1000;
        if (elapsedSec > 0) {
            const inDiff = this.telemetry.bytesIn - this.lastSampleBytesIn;
            const outDiff = this.telemetry.bytesOut - this.lastSampleBytesOut;
            this.telemetry.currentDownloadRate = Math.round((inDiff / 1024) / elapsedSec);
            this.telemetry.currentUploadRate = Math.round((outDiff / 1024) / elapsedSec);

            this.lastSampleTime = now;
            this.lastSampleBytesIn = this.telemetry.bytesIn;
            this.lastSampleBytesOut = this.telemetry.bytesOut;

            this.emit('telemetry-tick', {
                ...this.telemetry,
                currentProfile: this.currentProfile
            });
        }
    }

    logRequest(method, host, port, protocol = 'HTTP', status = '200') {
        const time = new Date().toLocaleTimeString();
        const entry = {
            id: `req_${Date.now()}_${Math.floor(Math.random()*1000)}`,
            time,
            method,
            host,
            port,
            protocol,
            status,
            latency: this.currentProfile.latency
        };

        this.telemetry.totalRequests++;
        this.telemetry.recentRequests.unshift(entry);
        if (this.telemetry.recentRequests.length > 100) {
            this.telemetry.recentRequests.pop();
        }

        this.emit('request-logged', entry);
    }

    start() {
        return new Promise((resolve, reject) => {
            this.server = http.createServer((clientReq, clientRes) => {
                this.handleHttpRequest(clientReq, clientRes);
            });

            // Track incoming TCP sockets and instantly drop if offline
            this.server.on('connection', (socket) => {
                this.activeSockets.add(socket);
                socket.on('close', () => {
                    this.activeSockets.delete(socket);
                });

                if (this.currentProfile.mode === 'Offline' || this.currentProfile.speed === 0) {
                    this.logRequest('TCP', 'CLIENT', this.port, 'TCP', '🛑 DROPPED (No Internet)');
                    socket.destroy();
                }
            });

            // Handle HTTPS CONNECT tunnel
            this.server.on('connect', (req, clientSocket, head) => {
                this.handleHttpsConnect(req, clientSocket, head);
            });

            this.server.on('error', (err) => {
                this.emit('error', err);
                reject(err);
            });

            this.server.listen(this.port, '0.0.0.0', () => {
                this.emit('listening', { port: this.port });
                resolve({ port: this.port });
            });
        });
    }

    handleHttpRequest(clientReq, clientRes) {
        const parsedUrl = url.parse(clientReq.url);
        const host = parsedUrl.hostname || clientReq.headers.host || 'unknown';
        const port = parsedUrl.port || 80;

        // Hard Drop on Offline Mode: No response, immediate socket destruction
        if (this.currentProfile.mode === 'Offline' || this.currentProfile.speed === 0) {
            this.logRequest(clientReq.method, host, port, 'HTTP', '🛑 DROPPED (No Internet)');
            clientReq.socket.destroy();
            return;
        }

        this.telemetry.activeConnections++;
        this.logRequest(clientReq.method, host, port, 'HTTP', 'Streaming');

        const options = {
            hostname: host,
            port: port,
            path: parsedUrl.path,
            method: clientReq.method,
            headers: clientReq.headers
        };

        const throttleStream = new ThrottleStream(
            () => this.currentProfile,
            (bytes) => { this.telemetry.bytesIn += bytes; }
        );

        throttleStream.on('error', (err) => {
            clientRes.writeHead(504, { 'Content-Type': 'text/plain' });
            clientRes.end(`LinTron Throttler: ${err.message}`);
        });

        const proxyReq = http.request(options, (proxyRes) => {
            clientRes.writeHead(proxyRes.statusCode, proxyRes.headers);
            proxyRes.pipe(throttleStream).pipe(clientRes);
        });

        proxyReq.on('error', (err) => {
            clientRes.writeHead(502, { 'Content-Type': 'text/plain' });
            clientRes.end(`LinTron Proxy Error: ${err.message}`);
        });

        clientReq.on('data', (chunk) => {
            this.telemetry.bytesOut += chunk.length;
        });

        clientReq.on('close', () => {
            this.telemetry.activeConnections = Math.max(0, this.telemetry.activeConnections - 1);
        });

        clientReq.pipe(proxyReq);
    }

    handleHttpsConnect(req, clientSocket, head) {
        const [host, port] = req.url.split(':');
        const targetPort = parseInt(port, 10) || 443;

        // Hard Drop on Offline Mode: No response, immediate socket destruction
        if (this.currentProfile.mode === 'Offline' || this.currentProfile.speed === 0) {
            this.logRequest('CONNECT', host, targetPort, 'HTTPS', '🛑 DROPPED (No Internet)');
            clientSocket.destroy();
            return;
        }

        this.telemetry.activeConnections++;
        this.logRequest('CONNECT', host, targetPort, 'HTTPS', 'Tunneling');

        const serverSocket = net.connect(targetPort, host, () => {
            clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
            serverSocket.write(head);

            const clientToTargetThrottle = new ThrottleStream(
                () => this.currentProfile,
                (bytes) => { this.telemetry.bytesOut += bytes; }
            );

            const targetToClientThrottle = new ThrottleStream(
                () => this.currentProfile,
                (bytes) => { this.telemetry.bytesIn += bytes; }
            );

            clientToTargetThrottle.on('error', () => {
                clientSocket.destroy();
                serverSocket.destroy();
            });

            targetToClientThrottle.on('error', () => {
                clientSocket.destroy();
                serverSocket.destroy();
            });

            clientSocket.pipe(clientToTargetThrottle).pipe(serverSocket);
            serverSocket.pipe(targetToClientThrottle).pipe(clientSocket);
        });

        const cleanup = () => {
            this.telemetry.activeConnections = Math.max(0, this.telemetry.activeConnections - 1);
            clientSocket.destroy();
            serverSocket.destroy();
        };

        clientSocket.on('error', cleanup);
        serverSocket.on('error', cleanup);
        clientSocket.on('close', () => {
            this.telemetry.activeConnections = Math.max(0, this.telemetry.activeConnections - 1);
        });
    }

    stop() {
        if (this.server) {
            this.server.close();
            this.server = null;
        }
    }
}

module.exports = LinTronProxyServer;

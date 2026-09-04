const { exec } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

class AdbManager {
    constructor() {
        this.adbPath = this.resolveAdbPath();
        this.connectedDevice = null;
        this.isProxyActiveOnDevice = false;
    }

    resolveAdbPath() {
        const homeDir = os.homedir();
        const candidatePaths = [
            path.join(homeDir, 'Library/Android/sdk/platform-tools/adb'),
            '/usr/local/bin/adb',
            '/opt/homebrew/bin/adb'
        ];

        for (const p of candidatePaths) {
            if (fs.existsSync(p)) {
                return p;
            }
        }
        return 'adb'; // fallback to PATH
    }

    getLocalIpAddress() {
        const interfaces = os.networkInterfaces();
        for (const name of Object.keys(interfaces)) {
            for (const iface of interfaces[name]) {
                if (iface.family === 'IPv4' && !iface.internal) {
                    return iface.address;
                }
            }
        }
        return '127.0.0.1';
    }

    execCommand(command) {
        return new Promise((resolve, reject) => {
            exec(`"${this.adbPath}" ${command}`, (error, stdout, stderr) => {
                if (error) {
                    return resolve({ success: false, error: stderr || error.message });
                }
                resolve({ success: true, output: stdout.trim() });
            });
        });
    }

    async getConnectedDevices() {
        const res = await this.execCommand('devices -l');
        if (!res.success) return [];

        const lines = res.output.split('\n').slice(1);
        const devices = [];

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            const parts = trimmed.split(/\s+/);
            const id = parts[0];
            const state = parts[1];
            if (state === 'device') {
                const modelMatch = trimmed.match(/model:(\S+)/);
                const model = modelMatch ? modelMatch[1] : id;
                devices.push({ id, model, raw: trimmed });
            }
        }

        this.connectedDevice = devices.length > 0 ? devices[0] : null;
        return devices;
    }

    async setAndroidProxy(port = 8080) {
        const localIp = this.getLocalIpAddress();
        const device = this.connectedDevice;
        const target = device ? `-s ${device.id}` : '';

        // 1. Set global HTTP proxy
        const resProxy = await this.execCommand(`${target} shell settings put global http_proxy ${localIp}:${port}`);
        
        // 2. Also reverse port so localhost:8080 works inside emulator/device
        await this.execCommand(`${target} reverse tcp:${port} tcp:${port}`);

        if (resProxy.success) {
            this.isProxyActiveOnDevice = true;
            return {
                success: true,
                message: `Proxy set to ${localIp}:${port} on Android (${device ? device.model : 'default device'})`,
                ip: localIp,
                port
            };
        }

        return {
            success: false,
            error: resProxy.error || 'Failed to set proxy via ADB'
        };
    }

    async clearAndroidProxy(port = 8080) {
        const device = this.connectedDevice;
        const target = device ? `-s ${device.id}` : '';

        const resProxy = await this.execCommand(`${target} shell settings put global http_proxy :0`);
        await this.execCommand(`${target} reverse --remove tcp:${port}`);

        this.isProxyActiveOnDevice = false;
        return {
            success: true,
            message: 'Android global proxy cleared'
        };
    }

    async getProxyStatus() {
        const device = this.connectedDevice;
        const target = device ? `-s ${device.id}` : '';
        const res = await this.execCommand(`${target} shell settings get global http_proxy`);
        if (res.success && res.output && res.output !== 'null' && res.output !== ':0') {
            this.isProxyActiveOnDevice = true;
            return { active: true, value: res.output };
        }
        this.isProxyActiveOnDevice = false;
        return { active: false, value: null };
    }

    async setDeviceOffline(enable) {
        const device = this.connectedDevice;
        const target = device ? `-s ${device.id}` : '';
        if (enable) {
            await this.execCommand(`${target} shell "cmd connectivity airplane-mode enable; svc wifi disable; svc data disable"`);
            return { success: true, message: 'Android Wi-Fi & Data disabled' };
        } else {
            await this.execCommand(`${target} shell "cmd connectivity airplane-mode disable; svc wifi enable; svc data enable"`);
            return { success: true, message: 'Android Wi-Fi & Data restored' };
        }
    }
}

module.exports = AdbManager;

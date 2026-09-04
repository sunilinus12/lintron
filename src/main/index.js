const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const LinTronProxyServer = require('./proxy-server');
const AdbManager = require('./adb-manager');

let mainWindow = null;
const proxyServer = new LinTronProxyServer(8080);
const adbManager = new AdbManager();

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1040,
        height: 760,
        minWidth: 860,
        minHeight: 620,
        backgroundColor: '#0a0d14',
        title: 'LinTron Throttler - Precision Network Conditioner',
        titleBarStyle: 'hiddenInset',
        trafficLightPosition: { x: 16, y: 16 },
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// App lifecycle
app.whenReady().then(async () => {
    createWindow();

    // Start proxy server
    try {
        await proxyServer.start();
        console.log('[LinTron Throttler] Proxy server listening on 0.0.0.0:8080');
    } catch (err) {
        console.error('[LinTron Throttler] Failed to start proxy server:', err);
    }

    // Proxy telemetry events forward to UI
    proxyServer.on('telemetry-tick', (data) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('telemetry-tick', data);
        }
    });

    proxyServer.on('request-logged', (req) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('request-logged', req);
        }
    });

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    proxyServer.stop();
    if (process.platform !== 'darwin') app.quit();
});

// IPC Handlers
ipcMain.handle('get-local-ip', () => {
    return adbManager.getLocalIpAddress();
});

ipcMain.handle('get-adb-devices', async () => {
    return await adbManager.getConnectedDevices();
});

ipcMain.handle('set-adb-proxy', async (event, port) => {
    return await adbManager.setAndroidProxy(port || 8080);
});

ipcMain.handle('clear-adb-proxy', async (event, port) => {
    return await adbManager.clearAndroidProxy(port || 8080);
});

ipcMain.handle('get-adb-proxy-status', async () => {
    return await adbManager.getProxyStatus();
});

ipcMain.handle('set-profile', (event, profile) => {
    proxyServer.setProfile(profile);
    return { success: true, profile: proxyServer.currentProfile };
});

ipcMain.handle('get-profile', () => {
    return proxyServer.currentProfile;
});

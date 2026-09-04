const { ipcRenderer } = require('electron');

// Presets Definition
const PRESETS = {
    'good': {
        name: '⚡ No Throttling',
        speed: 10000000,    // Unlimited (10 MB/s)
        latency: 0,
        packetLoss: 0,
        jitter: 0,
        mode: 'Good'
    },
    '5g': {
        name: '🚀 5G Ultra',
        speed: 18750000,    // 150 Mbps
        latency: 15,
        packetLoss: 0,
        jitter: 5,
        mode: '5G'
    },
    '4g': {
        name: '📶 4G LTE',
        speed: 3125000,     // 25 Mbps
        latency: 40,
        packetLoss: 0,
        jitter: 10,
        mode: '4G'
    },
    '3g': {
        name: '📉 3G HSPA',
        speed: 187500,      // 1.5 Mbps
        latency: 150,
        packetLoss: 1,
        jitter: 25,
        mode: '3G'
    },
    '2g': {
        name: '🐢 2G Edge',
        speed: 31250,       // 250 Kbps
        latency: 400,
        packetLoss: 3,
        jitter: 50,
        mode: '2G'
    },
    '1g': {
        name: '🐌 1G GPRS',
        speed: 1200,        // 10 Kbps
        latency: 1000,
        packetLoss: 5,
        jitter: 150,
        mode: '1G'
    },
    'subway': {
        name: '🚇 Subway / Tunnel',
        speed: 25000,
        latency: 600,
        packetLoss: 15,
        jitter: 200,
        mode: 'Subway'
    },
    'packet-loss': {
        name: '⚠️ High Packet Loss',
        speed: 500000,
        latency: 100,
        packetLoss: 25,
        jitter: 200,
        mode: 'Chaos'
    },
    'offline': {
        name: '🛑 Offline Mode',
        speed: 0,
        latency: 0,
        packetLoss: 100,
        jitter: 0,
        mode: 'Offline'
    }
};

let activePresetKey = 'good';
let currentProfile = { ...PRESETS['good'] };

// DOM Elements
const activeProfileBadge = document.getElementById('active-profile-name');
const lanIpEl = document.getElementById('lan-ip');
const proxyAddressEl = document.getElementById('proxy-address');
const adbDeviceBadge = document.getElementById('adb-device-badge');
const adbStatusMsg = document.getElementById('adb-status-msg');

// Sliders & Value Displays
const sliderSpeed = document.getElementById('slider-speed');
const valSpeed = document.getElementById('val-speed');
const sliderLatency = document.getElementById('slider-latency');
const valLatency = document.getElementById('val-latency');
const sliderPacketLoss = document.getElementById('slider-packet-loss');
const valPacketLoss = document.getElementById('val-packet-loss');
const sliderJitter = document.getElementById('slider-jitter');
const valJitter = document.getElementById('val-jitter');
const btnResetSliders = document.getElementById('btn-reset-sliders');

// ADB Buttons
const btnEnableAdb = document.getElementById('btn-enable-adb');
const btnDisableAdb = document.getElementById('btn-disable-adb');
const btnRefreshAdb = document.getElementById('btn-refresh-adb');

// Telemetry Elements
const statDown = document.getElementById('stat-down');
const statUp = document.getElementById('stat-up');
const statSockets = document.getElementById('stat-sockets');
const statTotalReq = document.getElementById('stat-total-req');

// Traffic Table
const trafficTbody = document.getElementById('traffic-tbody');
const btnClearTraffic = document.getElementById('btn-clear-traffic');

// Initialize UI
async function init() {
    // 1. Get LAN IP
    try {
        const ip = await ipcRenderer.invoke('get-local-ip');
        lanIpEl.textContent = ip;
        proxyAddressEl.textContent = `${ip}:8080`;
    } catch (e) {
        lanIpEl.textContent = '127.0.0.1';
    }

    // 2. Setup Presets Click Listeners
    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const key = btn.getAttribute('data-preset');
            selectPreset(key);
        });
    });

    // 3. Setup Sliders
    setupSliders();

    // 4. Setup ADB Controls
    setupAdb();

    // 5. Setup Telemetry IPC Listeners
    setupTelemetry();

    // 6. Refresh ADB Devices
    refreshAdbDevices();
}

function selectPreset(key) {
    if (!PRESETS[key]) return;
    activePresetKey = key;
    currentProfile = { ...PRESETS[key] };

    // Update preset buttons active state
    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-preset') === key);
    });

    // Update active badge
    activeProfileBadge.textContent = currentProfile.name;

    // Update sliders to reflect preset
    updateSlidersFromProfile(currentProfile);

    // Send profile to main process proxy
    ipcRenderer.invoke('set-profile', currentProfile);

    if (key === 'offline') {
        adbStatusMsg.textContent = '🛑 OFFLINE MODE: All connections severed (ERR_INTERNET_DISCONNECTED)';
        adbStatusMsg.style.color = '#ff3366';
    } else {
        adbStatusMsg.textContent = `🟢 Active Preset: ${currentProfile.name}`;
        adbStatusMsg.style.color = '#00e676';
    }
}

function updateSlidersFromProfile(profile) {
    // Speed slider (scale: KB/s)
    const speedKb = Math.round(profile.speed / 1024);
    sliderSpeed.value = Math.min(10000, speedKb);
    valSpeed.textContent = profile.speed >= 10000000 ? 'Unlimited' : `${speedKb} KB/s`;

    // Latency
    sliderLatency.value = profile.latency;
    valLatency.textContent = `${profile.latency} ms`;

    // Packet loss
    sliderPacketLoss.value = profile.packetLoss;
    valPacketLoss.textContent = `${profile.packetLoss} %`;

    // Jitter
    sliderJitter.value = profile.jitter;
    valJitter.textContent = `${profile.jitter} ms`;
}

function setupSliders() {
    sliderSpeed.addEventListener('input', (e) => {
        const kb = parseInt(e.target.value, 10);
        if (kb >= 10000) {
            currentProfile.speed = 10000000;
            valSpeed.textContent = 'Unlimited';
        } else {
            currentProfile.speed = kb * 1024;
            valSpeed.textContent = `${kb} KB/s`;
        }
        applyCustomProfile();
    });

    sliderLatency.addEventListener('input', (e) => {
        const ms = parseInt(e.target.value, 10);
        currentProfile.latency = ms;
        valLatency.textContent = `${ms} ms`;
        applyCustomProfile();
    });

    sliderPacketLoss.addEventListener('input', (e) => {
        const pct = parseInt(e.target.value, 10);
        currentProfile.packetLoss = pct;
        valPacketLoss.textContent = `${pct} %`;
        applyCustomProfile();
    });

    sliderJitter.addEventListener('input', (e) => {
        const ms = parseInt(e.target.value, 10);
        currentProfile.jitter = ms;
        valJitter.textContent = `${ms} ms`;
        applyCustomProfile();
    });

    btnResetSliders.addEventListener('click', () => {
        selectPreset('good');
    });
}

function applyCustomProfile() {
    currentProfile.mode = 'Custom';
    activeProfileBadge.textContent = '🎛️ Custom Sliders';
    document.querySelectorAll('.preset-btn').forEach(btn => btn.classList.remove('active'));
    ipcRenderer.invoke('set-profile', currentProfile);
}

function setupAdb() {
    btnEnableAdb.addEventListener('click', async () => {
        adbStatusMsg.textContent = 'Applying proxy on Android via ADB...';
        const res = await ipcRenderer.invoke('set-adb-proxy', 8080);
        if (res.success) {
            adbStatusMsg.textContent = `🟢 ${res.message}`;
            adbStatusMsg.style.color = '#00e676';
        } else {
            adbStatusMsg.textContent = `❌ ${res.error}`;
            adbStatusMsg.style.color = '#ff3366';
        }
    });

    btnDisableAdb.addEventListener('click', async () => {
        adbStatusMsg.textContent = 'Clearing proxy on Android...';
        const res = await ipcRenderer.invoke('clear-adb-proxy', 8080);
        if (res.success) {
            adbStatusMsg.textContent = '⚪ Android global proxy disabled';
            adbStatusMsg.style.color = '#94a3b8';
        } else {
            adbStatusMsg.textContent = `❌ ${res.error}`;
            adbStatusMsg.style.color = '#ff3366';
        }
    });

    btnRefreshAdb.addEventListener('click', () => {
        refreshAdbDevices();
    });
}

async function refreshAdbDevices() {
    adbDeviceBadge.textContent = 'Scanning...';
    try {
        const devices = await ipcRenderer.invoke('get-adb-devices');
        if (devices.length > 0) {
            const dev = devices[0];
            adbDeviceBadge.textContent = `🟢 ${dev.model || dev.id}`;
            adbDeviceBadge.style.color = '#00e676';
            adbDeviceBadge.style.borderColor = 'rgba(0, 230, 118, 0.3)';
        } else {
            adbDeviceBadge.textContent = '⚪ No ADB Device';
            adbDeviceBadge.style.color = '#94a3b8';
            adbDeviceBadge.style.borderColor = 'rgba(255, 255, 255, 0.1)';
        }

        // Check if proxy currently active
        const status = await ipcRenderer.invoke('get-adb-proxy-status');
        if (status.active) {
            adbStatusMsg.textContent = `🟢 Active Device Proxy: ${status.value}`;
            adbStatusMsg.style.color = '#00e676';
        }
    } catch (e) {
        adbDeviceBadge.textContent = 'ADB Offline';
    }
}

function setupTelemetry() {
    ipcRenderer.on('telemetry-tick', (event, data) => {
        statDown.textContent = data.currentDownloadRate || 0;
        statUp.textContent = data.currentUploadRate || 0;
        statSockets.textContent = data.activeConnections || 0;
        statTotalReq.textContent = data.totalRequests || 0;
    });

    ipcRenderer.on('request-logged', (event, req) => {
        addTrafficRow(req);
    });

    btnClearTraffic.addEventListener('click', () => {
        trafficTbody.innerHTML = `
            <tr class="empty-row">
                <td colspan="7">Traffic log cleared. Active listening on port 8080.</td>
            </tr>
        `;
    });
}

function addTrafficRow(req) {
    const emptyRow = trafficTbody.querySelector('.empty-row');
    if (emptyRow) emptyRow.remove();

    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td>${req.time}</td>
        <td><span class="method-badge method-${req.method}">${req.method}</span></td>
        <td title="${req.host}">${req.host}</td>
        <td>${req.port}</td>
        <td>${req.protocol}</td>
        <td>${req.latency > 0 ? `+${req.latency}ms` : '0ms'}</td>
        <td><span style="color: ${req.status === 'Streaming' || req.status === 'Tunneling' ? '#00e676' : '#94a3b8'}">${req.status}</span></td>
    `;

    trafficTbody.insertBefore(tr, trafficTbody.firstChild);

    // Limit to 100 rows in DOM
    if (trafficTbody.children.length > 100) {
        trafficTbody.removeChild(trafficTbody.lastChild);
    }
}

// Start app
init();

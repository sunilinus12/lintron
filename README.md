# ⚡ LinTron Throttler

> **Zero-Config, Precision Network Conditioning & Chaos Simulation Desktop Tool for Mobile & Web Developers.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Platform](https://img.shields.io/badge/Platform-macOS%20%7C%20Windows%20%7C%20Linux-blue.svg)](#)
[![Built With](https://img.shields.io/badge/Built%20With-Electron%20%7C%20Node.js-green.svg)](#)

Unlike heavy devtools suites that try to do everything, **LinTron Throttler** is a lightweight, dedicated standalone desktop application built with a single mission: **flawless, hyper-precise network simulation and chaos engineering**.

---

## 🌟 Key Features

* 🚀 **Zero-Code Routing**: Built-in HTTP & HTTPS (CONNECT tunnel) streaming proxy on port `8080`. Works with any physical phone (iOS / Android), simulator, emulator, or browser with zero SDK changes.
* 🤖 **1-Click Android ADB Bridge**: Automatically detects connected Android phones and sets/clears the global HTTP proxy in a single click (`adb shell settings put global http_proxy`).
* 📡 **Instant Network Presets**:
  * ⚡ **Direct / Good**: Unlimited bandwidth, 0ms latency.
  * 🚀 **5G Ultra**: 150 Mbps, 15ms latency.
  * 📶 **4G LTE**: 25 Mbps, 40ms latency.
  * 📉 **3G HSPA**: 1.5 Mbps, 150ms latency.
  * 🐢 **2G Edge**: 250 Kbps, 400ms latency.
  * 🐌 **1G GPRS**: 10 Kbps, 1000ms latency.
  * 🚇 **Subway / Tunnel Mode**: Simulates underground intermittent blackouts (5s connected, 3s drop).
  * ⚠️ **High Packet Loss**: 25% random dropped packets + 200ms jitter.
  * 🛑 **Offline Killswitch**: 100% blackout drop for offline testing.
* 🎛️ **Precision Fine-Tuning Sliders**:
  * Download / Upload Speed Limit (KB/s)
  * Added Round-Trip Latency (0 - 3000 ms)
  * Random Packet Drop Rate (0 - 100%)
  * Latency Jitter (0 - 500 ms)
* 📊 **Live Telemetry & Traffic Stream**:
  * Real-time Download & Upload speedometers.
  * Active socket connections counter.
  * Live request stream table displaying host, port, protocol, delay, and status.

---

## 🚀 Quick Start

### 1. Installation

```bash
git clone https://github.com/sunilinus12/lintron-throttler.git
cd lintron-throttler
npm install
```

### 2. Launch Desktop App

```bash
npm start
```

---

## 📱 How to Route Device Traffic

### Method A: Android (1-Click via ADB)
1. Connect your Android phone via USB with USB Debugging enabled.
2. In LinTron Throttler, click **"⚡ Set Android Proxy"**.
3. All network requests from your phone will instantly route through LinTron Throttler!
4. When done testing, click **"❌ Clear Proxy"**.

### Method B: iOS Physical Device / Emulators
1. Ensure your Mac and iPhone are on the same Wi-Fi network.
2. Note the **LAN IP** shown in the LinTron Throttler header (e.g. `192.168.1.5`).
3. On iPhone: Go to **Settings > Wi-Fi > (i) > Configure Proxy > Manual**:
   * **Server**: `<LAN IP>`
   * **Port**: `8080`

---

## 🏗️ Architecture

```
┌────────────────────────────────────────────────────────┐
│               LinTron Throttler Desktop                │
│             (Electron + Dark Cyberpunk UI)             │
└──────────────┬──────────────────────────┬──────────────┘
               │                          │
        HTTP/HTTPS Proxy              ADB Bridge
          (Port 8080)              (Android Control)
               │                          │
               ▼                          ▼
      [ Any Mobile App ]           adb shell settings
      (iOS / Android)              put global http_proxy
```

---

## 📄 License
MIT © Linus

# ⚡ Lintron

<div align="center">

**Next-Gen Network Debugger, Breakpoint Interceptor & Chaos Engineering Tool for React Native & Expo**

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](https://github.com/sunilinus12/lintron/releases/tag/v1.0.0)
[![React Native](https://img.shields.io/badge/React%20Native-0.65+-61DAFB.svg?logo=react&logoColor=black)](https://reactnative.dev)
[![Expo](https://img.shields.io/badge/Expo-SDK%2048+-000020.svg?logo=expo&logoColor=white)](https://expo.dev)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)

</div>

---

## 🚀 Why Lintron?

Reactotron only passively monitors JavaScript logs. Meta's Flipper was officially **deprecated**. Setting up proxy tools like Charles or Proxyman in Expo Go requires complicated SSL certificates and root access.

**Lintron is built differently:**
- **Zero Native Configuration:** Works in **Expo Go**, Bare React Native, iOS Simulator, Android Emulator, and physical phones over WiFi.
- **In-App Network Throttling:** 1G, 2G, 3G, 4G, 5G, and realistic **Metro / Subway tunnels** with packet loss simulation.
- **Live Breakpoints & Tampering:** Pause API requests before they leave the phone. Modify JSON payloads on the fly, or **return mock responses** (200, 401, 500) without touching the backend!
- **Reactotron Parity:** Real-time console logs streamer and AsyncStorage viewer/clearer.

---

## ⚡ Quick Start Guide (Testing in Your React Native / Expo Project)

### Step 1: Launch the Lintron Desktop Dashboard

In the root of this project:
```bash
npm run start:desktop
```
Lintron Desktop will open and start listening on `ws://0.0.0.0:9090` and proxy port `8080`.

---

### Step 2: Install Lintron in Your React Native / Expo App

#### Option A: Install via Local File (Fastest for testing)
In your other React Native / Expo project terminal:
```bash
npm install /Users/linus/Documents/net-threshold-app/packages/lintron
# OR using Yarn:
yarn add file:/Users/linus/Documents/net-threshold-app/packages/lintron
```

#### Option B: Once Published to NPM
```bash
npm install --save-dev lintron
# OR
npx expo install lintron
```

---

### Step 3: Initialize in `App.js` or `index.js`

Add these 3 lines at the top of your `App.js`, `index.js`, or entry file:

```javascript
import { initLintron } from 'lintron';

if (__DEV__) {
  initLintron({
    appName: 'My Awesome Mobile App',
    // host: 'localhost' // Defaults to localhost (iOS Simulator / Web)
    // host: '10.0.2.2' // Use '10.0.2.2' if testing on Android Emulator
    // host: '192.168.1.XX' // Use your laptop's Wi-Fi IP if testing on a physical iPhone / Android
  });
}
```

That's it! 🚀 Start your app with `npx expo start` or `npx react-native run-ios` / `run-android`.

---

## 📱 How to Verify & Test Features

Once your mobile app launches:

1. **Check Connection**:
   - In Lintron Desktop header, you will see `App: My Awesome Mobile App` turn **Green** 🟢.
2. **Test Network Throttling**:
   - In your app, trigger any API call (`fetch` or `axios`).
   - In Lintron Desktop, click **3G** or **Metro Mode**.
   - Notice the API response time instantly matches real-world cellular latency!
3. **Test Live Breakpoints**:
   - In Lintron Desktop, click **Breakpoints: OFF** ➡️ turns **ON** 🎯.
   - Set URL filter (e.g. `/api/` or leave blank).
   - In your app, submit a form or trigger a POST request.
   - The desktop pops up with the **Intercept Modal** showing the exact payload.
   - Edit the JSON body and click **Forward**, or choose **Mock 500 Error** to test your app's error screens!
4. **Test Console Logs**:
   - Open the **App Console** tab in Lintron Desktop.
   - Any `console.log()` or `console.error()` in your mobile app streams live into your desktop screen!
5. **Test AsyncStorage**:
   - Open the **AsyncStorage** tab in Lintron Desktop.
   - Click **Refresh** to inspect saved tokens and state, or click **Clear** to reset storage.

---

## ⚙️ Configuration Reference

```typescript
initLintron({
  /**
   * Address where Lintron Desktop is running.
   * - 'localhost' for iOS Simulator / macOS / Web
   * - '10.0.2.2' for standard Android Emulator
   * - '192.168.X.X' for physical device over local WiFi
   * Defaults to 'localhost'.
   */
  host?: string;

  /**
   * WebSocket port. Defaults to 9090.
   */
  port?: number;

  /**
   * Name displayed in the Lintron Dashboard.
   */
  appName?: string;

  /**
   * Enable/disable connection. Defaults to true in __DEV__.
   */
  enabled?: boolean;
});
```

---

## 🛠️ Monorepo Structure

```
lintron/
├── apps/
│   └── desktop/                  # Electron Dashboard & Controller (ws://0.0.0.0:9090)
├── packages/
│   └── lintron/                  # NPM package client library for React Native & Expo
│       ├── dist/                 # Compiled JavaScript output
│       └── src/                  # TypeScript source
└── package.json                  # Workspaces configuration
```

---

## 🚢 Publishing to NPM

When you are ready to publish the package to the official npm registry:
```bash
cd packages/lintron
npm login
npm publish --access public
```

---

## 📄 License

MIT © [Sunil Linus](https://github.com/sunilinus12)

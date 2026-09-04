"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.networkEngine = exports.NetworkEngine = void 0;
class NetworkEngine {
    constructor() {
        this.currentProfile = {
            name: 'Good',
            speed: 10000000,
            latency: 0,
        };
        this.isOffline = false;
        this.packetLossRate = 0; // percentage 0 - 100
    }
    setProfile(profile) {
        this.currentProfile = profile;
        console.log(`[Lintron Engine] 🌐 Profile: ${profile.name} (${Math.round(profile.speed / 1024)} KB/s, ${profile.latency}ms)`);
    }
    setOffline(offline) {
        this.isOffline = offline;
        console.log(`[Lintron Engine] 🔴 Offline Mode: ${offline ? 'ACTIVE' : 'INACTIVE'}`);
    }
    setPacketLoss(rate) {
        this.packetLossRate = Math.max(0, Math.min(100, rate));
        console.log(`[Lintron Engine] ⚠️ Packet Loss Simulation: ${this.packetLossRate}%`);
    }
    getProfile() {
        return this.currentProfile;
    }
    getIsOffline() {
        return this.isOffline;
    }
    /**
     * Applies artificial network delay based on current profile and payload size.
     * Throws TypeError('Network request failed') if offline or packet dropped.
     */
    async applyThrottling(payloadBytes = 1024) {
        if (this.isOffline || this.currentProfile.speed === 0) {
            throw new TypeError('Network request failed');
        }
        // Packet Loss Simulation
        if (this.packetLossRate > 0 && Math.random() * 100 < this.packetLossRate) {
            console.warn('[Lintron Engine] 💥 Simulated Packet Drop');
            throw new TypeError('Network request failed');
        }
        const { speed, latency } = this.currentProfile;
        // Fast connection: no artificial throttling
        if (latency === 0 && speed >= 10000000) {
            return;
        }
        // Bandwidth delay calculation
        const bandwidthDelayMs = (payloadBytes / speed) * 1000;
        const totalDelayMs = Math.min(15000, latency + bandwidthDelayMs);
        if (totalDelayMs > 10) {
            await new Promise((resolve) => setTimeout(resolve, totalDelayMs));
        }
    }
}
exports.NetworkEngine = NetworkEngine;
exports.networkEngine = new NetworkEngine();
//# sourceMappingURL=network-engine.js.map
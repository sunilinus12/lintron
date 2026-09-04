import { NetworkProfile } from '../types';

export class NetworkEngine {
  private currentProfile: NetworkProfile = {
    name: 'Good',
    speed: 10000000,
    latency: 0,
  };
  private isOffline: boolean = false;
  private packetLossRate: number = 0; // percentage 0 - 100

  public setProfile(profile: NetworkProfile): void {
    this.currentProfile = profile;
    const modeName = (profile as any).mode || profile.name;
    this.isOffline = modeName === 'Offline' || profile.speed === 0;
    console.log(`[Lintron Engine] 🌐 Profile: ${profile.name} (${Math.round(profile.speed / 1024)} KB/s, ${profile.latency}ms) [Offline: ${this.isOffline}]`);
  }

  public setOffline(offline: boolean): void {
    this.isOffline = offline;
    console.log(`[Lintron Engine] 🔴 Offline Mode: ${offline ? 'ACTIVE' : 'INACTIVE'}`);
  }

  public setPacketLoss(rate: number): void {
    this.packetLossRate = Math.max(0, Math.min(100, rate));
    console.log(`[Lintron Engine] ⚠️ Packet Loss Simulation: ${this.packetLossRate}%`);
  }

  public getProfile(): NetworkProfile {
    return this.currentProfile;
  }

  public getIsOffline(): boolean {
    return this.isOffline || this.currentProfile.speed === 0 || (this.currentProfile as any).mode === 'Offline' || this.currentProfile.name === 'Offline';
  }

  /**
   * Applies artificial network delay based on current profile and payload size.
   * Throws TypeError('Network request failed') if offline or packet dropped.
   */
  public async applyThrottling(payloadBytes: number = 1024): Promise<void> {
    if (this.getIsOffline()) {
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

export const networkEngine = new NetworkEngine();

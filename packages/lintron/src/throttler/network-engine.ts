import { NetworkProfile } from '../types';

export class NetworkEngine {
  private currentProfile: NetworkProfile = {
    name: 'Good',
    speed: 10000000,
    latency: 0,
  };
  private isOffline: boolean = false;

  public setProfile(profile: NetworkProfile): void {
    this.currentProfile = profile;
    console.log(`[Lintron Engine] 🌐 Applied Profile: ${profile.name} (${Math.round(profile.speed / 1024)} KB/s, ${profile.latency}ms)`);
  }

  public setOffline(offline: boolean): void {
    this.isOffline = offline;
    console.log(`[Lintron Engine] 🔴 Offline Mode: ${offline ? 'ACTIVE' : 'INACTIVE'}`);
  }

  public getProfile(): NetworkProfile {
    return this.currentProfile;
  }

  public getIsOffline(): boolean {
    return this.isOffline;
  }

  /**
   * Applies artificial network delay based on current profile and payload size.
   * Throws TypeError('Network request failed') if offline.
   */
  public async applyThrottling(payloadBytes: number = 1024): Promise<void> {
    if (this.isOffline || this.currentProfile.speed === 0) {
      // Standard React Native offline error
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

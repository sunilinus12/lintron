import { NetworkProfile } from '../types';
export declare class NetworkEngine {
    private currentProfile;
    private isOffline;
    private packetLossRate;
    setProfile(profile: NetworkProfile): void;
    setOffline(offline: boolean): void;
    setPacketLoss(rate: number): void;
    getProfile(): NetworkProfile;
    getIsOffline(): boolean;
    /**
     * Applies artificial network delay based on current profile and payload size.
     * Throws TypeError('Network request failed') if offline or packet dropped.
     */
    applyThrottling(payloadBytes?: number): Promise<void>;
}
export declare const networkEngine: NetworkEngine;
//# sourceMappingURL=network-engine.d.ts.map
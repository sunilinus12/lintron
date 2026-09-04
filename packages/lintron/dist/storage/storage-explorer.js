"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupStorageExplorer = setupStorageExplorer;
function setupStorageExplorer(client) {
    const globalScope = typeof global !== 'undefined' ? global : window;
    // Attempt to resolve AsyncStorage
    const getAsyncStorage = () => {
        if (globalScope.AsyncStorage)
            return globalScope.AsyncStorage;
        try {
            // In React Native environment, require might resolve it
            return require('@react-native-async-storage/async-storage').default;
        }
        catch (e) {
            if (globalScope.localStorage) {
                return {
                    getAllKeys: async () => Object.keys(globalScope.localStorage),
                    multiGet: async (keys) => keys.map((k) => [k, globalScope.localStorage.getItem(k)]),
                    clear: async () => globalScope.localStorage.clear(),
                    removeItem: async (key) => globalScope.localStorage.removeItem(key),
                };
            }
            return null;
        }
    };
    client.onStorageQuery = async () => {
        const storage = getAsyncStorage();
        if (!storage) {
            client.send({
                type: 'STORAGE_DATA',
                payload: { available: false, entries: [] },
            });
            return;
        }
        try {
            const keys = await storage.getAllKeys();
            const pairs = await storage.multiGet(keys);
            const entries = pairs.map(([key, val]) => ({ key, value: val }));
            client.send({
                type: 'STORAGE_DATA',
                payload: { available: true, entries },
            });
        }
        catch (e) {
            console.warn('[Lintron Storage] Error querying storage:', e);
        }
    };
    client.onStorageClear = async () => {
        const storage = getAsyncStorage();
        if (storage) {
            try {
                await storage.clear();
                console.log('[Lintron Storage] 🗑️ Storage cleared via Desktop');
                client.onStorageQuery();
            }
            catch (e) {
                console.warn('[Lintron Storage] Failed to clear storage:', e);
            }
        }
    };
}
//# sourceMappingURL=storage-explorer.js.map
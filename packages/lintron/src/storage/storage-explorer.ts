export function setupStorageExplorer(client: any): void {
  const globalScope = typeof global !== 'undefined' ? (global as any) : (window as any);

  // Attempt to resolve AsyncStorage
  const getAsyncStorage = (): any => {
    if (globalScope.AsyncStorage) return globalScope.AsyncStorage;
    try {
      // In React Native environment, require might resolve it
      return require('@react-native-async-storage/async-storage').default;
    } catch (e) {
      if (globalScope.localStorage) {
        return {
          getAllKeys: async () => Object.keys(globalScope.localStorage),
          multiGet: async (keys: string[]) => keys.map((k) => [k, globalScope.localStorage.getItem(k)]),
          clear: async () => globalScope.localStorage.clear(),
          removeItem: async (key: string) => globalScope.localStorage.removeItem(key),
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
      const entries = pairs.map(([key, val]: [string, string]) => ({ key, value: val }));

      client.send({
        type: 'STORAGE_DATA',
        payload: { available: true, entries },
      });
    } catch (e: any) {
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
      } catch (e) {
        console.warn('[Lintron Storage] Failed to clear storage:', e);
      }
    }
  };
}

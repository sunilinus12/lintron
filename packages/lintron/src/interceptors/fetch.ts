import { networkEngine } from '../throttler/network-engine';
import { RequestLogEntry } from '../types';

let isInterceptorActive = false;
let originalFetch: typeof global.fetch | null = null;

export function setupFetchInterceptor(client: any): void {
  if (isInterceptorActive) return;

  const globalScope = typeof global !== 'undefined' ? global : window;
  if (!globalScope.fetch) {
    console.warn('[Lintron] fetch is not defined in global scope.');
    return;
  }

  originalFetch = globalScope.fetch.bind(globalScope);
  isInterceptorActive = true;

  globalScope.fetch = async function lintronFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const startTime = Date.now();
    let url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    let method = (init?.method || (typeof input === 'object' && 'method' in input ? (input as any).method : 'GET')).toUpperCase();
    
    // Extract headers
    const headers: Record<string, string> = {};
    if (init?.headers) {
      if (typeof (init.headers as any).forEach === 'function') {
        (init.headers as any).forEach((value: string, key: string) => {
          headers[key] = value;
        });
      } else if (Array.isArray(init.headers)) {
        init.headers.forEach(([k, v]) => { headers[k] = v; });
      } else {
        Object.assign(headers, init.headers);
      }
    }

    let bodyStr: string | undefined = undefined;
    if (init?.body) {
      if (typeof init.body === 'string') {
        bodyStr = init.body;
      } else {
        try {
          bodyStr = JSON.stringify(init.body);
        } catch (e) {
          bodyStr = '[Binary/FormData Body]';
        }
      }
    }

    // Generate cURL command
    let curl = `curl -X ${method} "${url}"`;
    for (const [k, v] of Object.entries(headers)) {
      curl += ` \\\n  -H "${k}: ${v}"`;
    }
    if (bodyStr) {
      const escapedBody = bodyStr.replace(/'/g, "'\\''");
      curl += ` \\\n  --data-raw '${escapedBody}'`;
    }

    // Check Breakpoints
    if (client.getIsBreakpointEnabled() && (method === 'POST' || method === 'PUT' || method === 'PATCH' || bodyStr)) {
      const bpId = `bp_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      const bpResolution = await client.requestBreakpointResolution({
        id: bpId,
        method,
        url,
        headers,
        body: bodyStr,
        time: new Date().toLocaleTimeString(),
      });

      if (bpResolution.action === 'abort') {
        throw new TypeError('Network request aborted by Lintron Breakpoint');
      }

      if (bpResolution.action === 'forward' && bpResolution.modifiedBody !== undefined) {
        bodyStr = bpResolution.modifiedBody;
        if (init) init.body = bodyStr;
      }
    }

    // Apply Throttling (latency + offline simulation)
    await networkEngine.applyThrottling(bodyStr ? bodyStr.length : 512);

    try {
      const response = await (originalFetch as typeof fetch)(input, init);
      const durationMs = Date.now() - startTime;

      let host = '';
      let port = 443;
      try {
        const parsedUrl = new URL(url);
        host = parsedUrl.hostname;
        port = parseInt(parsedUrl.port) || (parsedUrl.protocol === 'https:' ? 443 : 80);
      } catch (e) {
        host = 'unknown-host';
      }

      // Read response clone for size
      let sizeBytes = 1024;
      try {
        const clone = response.clone();
        const text = await clone.text();
        sizeBytes = text.length;
      } catch (e) {}

      // Apply downlink throttling based on response size
      await networkEngine.applyThrottling(sizeBytes);

      const logEntry: RequestLogEntry = {
        id: `req_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        time: new Date().toLocaleTimeString(),
        method,
        url,
        host,
        port,
        status: `${response.status} ${response.statusText || 'OK'}`,
        statusCode: response.status,
        headers,
        body: bodyStr,
        curl,
        durationMs,
        sizeBytes,
      };

      client.sendLogRequest(logEntry);

      return response;
    } catch (error: any) {
      const durationMs = Date.now() - startTime;
      const logEntry: RequestLogEntry = {
        id: `req_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        time: new Date().toLocaleTimeString(),
        method,
        url,
        host: 'error',
        port: 0,
        status: error?.message || 'FAILED',
        headers,
        body: bodyStr,
        curl,
        durationMs,
        sizeBytes: 0,
      };
      client.sendLogRequest(logEntry);
      throw error;
    }
  };

  console.log('[Lintron] 🚀 Fetch Interceptor initialized');
}

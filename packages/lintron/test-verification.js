const LintronWsServer = require('../../apps/desktop/ws-server');
const WebSocket = require('ws');

async function runVerification() {
  console.log('🧪 Starting Lintron End-to-End Verification Test...\n');

  let testPassed = 0;

  // 1. Start Server
  const server = new LintronWsServer({
    port: 9095, // Isolated test port
    onClientConnected: (clientInfo) => {
      console.log(`✅ [1/5] Server: Handshake received from "${clientInfo.appName}" (${clientInfo.platform})`);
      testPassed++;
    },
    onLogRequest: (log) => {
      console.log(`✅ [3/5] Server: Request Log received - ${log.method} ${log.url} [${log.status}]`);
      testPassed++;
    },
    onBreakpointIntercept: (bp) => {
      console.log(`✅ [4/5] Server: Breakpoint intercepted for ${bp.url}`);
      testPassed++;
      // Auto-resolve with mock status
      setTimeout(() => {
        server.resolveBreakpoint(bp.id, 'mock', undefined, 200, '{"mocked": true}');
      }, 50);
    },
    onConsoleLog: (log) => {
      console.log(`✅ [5/5] Server: Console log streamed: [${log.level.toUpperCase()}] ${log.message}`);
      testPassed++;
    }
  });

  server.start();

  // 2. Connect Mock React Native App Client
  const ws = new WebSocket('ws://localhost:9095');

  ws.on('open', () => {
    // Send Handshake
    ws.send(JSON.stringify({
      type: 'HANDSHAKE',
      payload: {
        appName: 'ExpoDemoApp',
        platform: 'Expo (iOS Simulator)',
        clientVersion: '1.0.0'
      }
    }));

    // Broadcast test from server
    setTimeout(() => {
      server.broadcast({
        type: 'SET_PROFILE',
        payload: { name: 'Metro (Tunnel)', speed: 250000, latency: 400 }
      });
    }, 100);
  });

  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.type === 'SET_PROFILE') {
      console.log(`✅ [2/5] Client: Received network profile broadcast: "${msg.payload.name}" (${msg.payload.latency}ms latency)`);
      testPassed++;

      // Trigger test request log
      ws.send(JSON.stringify({
        type: 'LOG_REQUEST',
        payload: {
          id: 'req_123',
          time: '12:00:00',
          method: 'GET',
          url: 'https://api.example.com/items',
          host: 'api.example.com',
          port: 443,
          status: '200 OK',
          durationMs: 412,
          sizeBytes: 1520,
          curl: 'curl "https://api.example.com/items"'
        }
      }));

      // Trigger test breakpoint
      setTimeout(() => {
        ws.send(JSON.stringify({
          type: 'BREAKPOINT_INTERCEPT',
          payload: {
            id: 'bp_999',
            method: 'POST',
            url: 'https://api.example.com/checkout',
            headers: { 'Content-Type': 'application/json' },
            body: '{"amount": 100}'
          }
        }));
      }, 100);
    }

    if (msg.type === 'BREAKPOINT_RESOLVED') {
      // Send console log
      ws.send(JSON.stringify({
        type: 'CONSOLE_LOG',
        payload: {
          id: 'log_001',
          level: 'log',
          message: 'User completed checkout process successfully',
          time: '12:00:01'
        }
      }));

      setTimeout(() => {
        console.log(`\n🎉 Verification Completed! ${testPassed}/5 core protocols verified successfully.`);
        ws.close();
        if (server.wss) server.wss.close();
        process.exit(0);
      }, 200);
    }
  });
}

runVerification();

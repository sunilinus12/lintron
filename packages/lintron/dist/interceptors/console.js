"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupConsoleInterceptor = setupConsoleInterceptor;
let isConsoleInterceptorActive = false;
function setupConsoleInterceptor(client) {
    if (isConsoleInterceptorActive)
        return;
    const globalScope = typeof global !== 'undefined' ? global : window;
    if (!globalScope.console)
        return;
    const originalConsole = {
        log: globalScope.console.log.bind(globalScope.console),
        warn: globalScope.console.warn.bind(globalScope.console),
        error: globalScope.console.error.bind(globalScope.console),
        info: globalScope.console.info.bind(globalScope.console),
    };
    isConsoleInterceptorActive = true;
    const levels = ['log', 'warn', 'error', 'info'];
    levels.forEach((level) => {
        globalScope.console[level] = function lintronConsole(...args) {
            // Always call original first so Metro packager shows the log
            originalConsole[level](...args);
            // Do not re-intercept our own Lintron internal logs to prevent loops
            if (typeof args[0] === 'string' && args[0].startsWith('[Lintron')) {
                return;
            }
            const formattedArgs = args.map((arg) => {
                if (arg === null)
                    return 'null';
                if (arg === undefined)
                    return 'undefined';
                if (typeof arg === 'object') {
                    try {
                        return JSON.stringify(arg, null, 2);
                    }
                    catch (e) {
                        return '[Circular / Object]';
                    }
                }
                return String(arg);
            });
            client.send({
                type: 'CONSOLE_LOG',
                payload: {
                    id: `log_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
                    level,
                    message: formattedArgs.join(' '),
                    time: new Date().toLocaleTimeString(),
                },
            });
        };
    });
    console.log('[Lintron] 🚀 Console Log Streamer initialized');
}
//# sourceMappingURL=console.js.map
/**
 * ConsoleLogger - Custom console logger that intercepts and redirects console output
 * to both the standard console and specific WebSocket connections
 */
class ConsoleLogger {
  constructor(connectionManager) {
    this.connectionManager = connectionManager;
    this.originalConsole = {
      log: console.log,
      error: console.error,
      warn: console.warn,
      info: console.info
    };
    
    this.activeConnectionId = null;
    
    // Replace console methods with custom versions
    this.overrideConsoleMethods();
  }

  /**
   * Override standard console methods to intercept logs
   */
  overrideConsoleMethods() {
    // Override console.log
    console.log = (...args) => {
      // Call original console.log
      this.originalConsole.log(...args);
      
      // If there's an active connection, send to that connection
      if (this.activeConnectionId) {
        this.connectionManager.addLog(this.activeConnectionId, 'log', ...args);
      }
    };

    // Override console.error
    console.error = (...args) => {
      // Call original console.error
      this.originalConsole.error(...args);
      
      // If there's an active connection, send to that connection
      if (this.activeConnectionId) {
        this.connectionManager.addLog(this.activeConnectionId, 'error', ...args);
      }
    };

    // Override console.warn
    console.warn = (...args) => {
      // Call original console.warn
      this.originalConsole.warn(...args);
      
      // If there's an active connection, send to that connection
      if (this.activeConnectionId) {
        this.connectionManager.addLog(this.activeConnectionId, 'warn', ...args);
      }
    };

    // Override console.info
    console.info = (...args) => {
      // Call original console.info
      this.originalConsole.info(...args);
      
      // If there's an active connection, send to that connection
      if (this.activeConnectionId) {
        this.connectionManager.addLog(this.activeConnectionId, 'info', ...args);
      }
    };
  }

  /**
   * Set the active connection ID for logging
   * @param {string} connectionId The active connection ID
   */
  setActiveConnectionId(connectionId) {
    this.activeConnectionId = connectionId;
  }

  /**
   * Clear the active connection ID
   */
  clearActiveConnectionId() {
    this.activeConnectionId = null;
  }

  /**
   * Run a function with a specific connection ID as the active connection
   * @param {string} connectionId The connection ID
   * @param {Function} fn The function to run
   */
  withConnection(connectionId, fn) {
    const previousConnectionId = this.activeConnectionId;
    this.setActiveConnectionId(connectionId);
    
    try {
      return fn();
    } finally {
      this.setActiveConnectionId(previousConnectionId);
    }
  }

  /**
   * Restore original console methods
   */
  restore() {
    console.log = this.originalConsole.log;
    console.error = this.originalConsole.error;
    console.warn = this.originalConsole.warn;
    console.info = this.originalConsole.info;
  }
}

module.exports = ConsoleLogger;

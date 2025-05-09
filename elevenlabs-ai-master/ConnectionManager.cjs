const EventEmitter = require('events');
const { v4: uuidv4 } = require('uuid');

/**
 * ConnectionManager - Manages WebSocket connections and related resources
 * Tracks active connections and routes messages to the appropriate clients
 * Improved with better connection lifecycle management and resource cleanup
 */
class ConnectionManager extends EventEmitter {
  constructor(inactivityTimeout = 5 * 60 * 1000, staleThreshold = 10 * 60 * 1000) {
    super();
    this.connections = new Map(); // Map of connection ID to connection info
    this.inactivityTimeout = inactivityTimeout;
    this.staleThreshold = staleThreshold;
    this.pendingClosures = new Set(); // Track connection IDs in process of closing
    this.pendingClosures = new Set(); // Track connection IDs in process of closing
    this.connectionTimestamps = new Map(); // Track when connections were created
    this.connectionTimeouts = new Map(); // Track connection timeouts
  }

  /**
   * Register a new WebSocket connection
   * @param {WebSocket} ws The WebSocket connection
   * @returns {string} The connection ID
   */
  registerConnection(ws) {
    if (!ws) {
      throw new Error(`[ConnectionManager] Attempted to register a null or undefined WebSocket`);
    }
    
    // Check WebSocket state before registering
    if (ws.readyState !== 1) { // WebSocket.OPEN is 1
      console.warn(`[ConnectionManager] Attempted to register WebSocket in non-OPEN state: ${ws.readyState}`);
    }

    // Generate a unique timestamp-based ID to prevent collisions
    const connectionId = uuidv4();
    console.log(`[ConnectionManager] Registering new connection with ID: ${connectionId}`);
    
    // Track when this connection was created
    const timestamp = Date.now();
    this.connectionTimestamps.set(connectionId, timestamp);
    
    // Create connection object with more structured state tracking
    this.connections.set(connectionId, {
      ws,
      logs: [],
      elevenLabsWs: null,
      customParameters: {},
      state: {
        isClosing: false,
        lastActivity: timestamp,
        createTime: timestamp
      },
      userId: null,
      agents: {}
    });
    
    // Set up an inactivity timeout
    const connectionTimeout = setTimeout(() => {
      console.warn(`[ConnectionManager] Connection ${connectionId} inactive for 5 minutes, closing`);
      this.closeConnection(connectionId);
    }, this.inactivityTimeout);
    
    this.connectionTimeouts.set(connectionId, connectionTimeout);
    
    return connectionId;
  }
  /**
   * Update the available Agent ID for a connection
   * @param {string} connectionId The connection ID
   */
  setAgents(connectionId, agents = {}) {
    const connection = this.connections.get(connectionId);
    connection.agents = agents;
    this.updateActivity(connectionId);
  }
  /**
   * Get the User ID for a connection
   * @param {string} connectionId The connection ID
   */
  getAgents(connectionId) {
    const connection = this.connections.get(connectionId);
    return(connection.agents);
  }
  /**
   * Update the User ID for a connection
   * @param {string} connectionId The connection ID
   */
  updateUserId(connectionId, userId) {
    if (!userId) {
      console.warn(`[ConnectionManager] Attempted to update User ID with null or undefined value`);
      return;
    }
    if (userId.length < 3) {
      console.warn(`[ConnectionManager] User ID is too short: ${userId}`);
      return;
    }
    if (userId.length > 20) {
      console.warn(`[ConnectionManager] User ID is too long: ${userId}`);
      return;
    }
    if (this.pendingClosures.has(connectionId)) {
      console.warn(`[ConnectionManager] Attempted to update User ID for a connection that's being closed: ${connectionId}`);
      return;
    }
    const connection = this.connections.get(connectionId);
    connection.userId = userId;
    this.updateActivity(connectionId);
  }
  /**
   * Get the User ID for a connection
   * @param {string} connectionId The connection ID
   */
  getUserId(connectionId) {
    const connection = this.connections.get(connectionId);
    if (!connection || !connection.userId) {
      return null;
    }
    this.updateActivity(connectionId);
    return(connection.userId);
  }
  /**
   * Get the User ID for a connection
   * @param {string} connectionId The connection ID
   */
  getCompId(connectionId) {
    const connection = this.connections.get(connectionId);
    if (!connection || !connection.userId) {
      return null;
    }
    this.updateActivity(connectionId);
    if (connection.userId === 'admin') {
      return(null);
    }
    return(connection.userId.substring(0,3));
  }
  /**
   * Update the activity timestamp for a connection
   * @param {string} connectionId The connection ID
   */
  updateActivity(connectionId) {  
    const connection = this.connections.get(connectionId);
    connection.state.lastActivity = Date.now();
    
    // Reset the inactivity timeout if the connection is not closing
    if (!connection.state.isClosing && this.connectionTimeouts.has(connectionId)) {
      clearTimeout(this.connectionTimeouts.get(connectionId));
      
      const connectionTimeout = setTimeout(() => {
        console.warn(`[ConnectionManager] Connection ${connectionId} inactive for 5 minutes, closing`);
        this.closeConnection(connectionId);
      }, 5 * 60 * 1000); // 5 minutes
      
      this.connectionTimeouts.set(connectionId, connectionTimeout);
    }
  }


  /**
   * Set custom parameters for a connection
   * @param {string} connectionId The connection ID
   * @param {Object} parameters The custom parameters
   */
  setCustomParameters(connectionId, parameters) {
    const connection = this.connections.get(connectionId);
    if (connection) {
      connection.customParameters = parameters;
      this.updateActivity(connectionId);
}
  }

  /**
   * Set the ElevenLabs WebSocket for a connection
   * @param {string} connectionId The connection ID
   * @param {WebSocket} elevenLabsWs The ElevenLabs WebSocket
   */
  setElevenLabsWs(connectionId, elevenLabsWs) {
    const connection = this.connections.get(connectionId);
    if (connection) {
      // Check if there's an existing ElevenLabs WebSocket and close it properly
      if (connection.elevenLabsWs && connection.elevenLabsWs.readyState < 2) {
        try {
          console.log(`[ConnectionManager] Closing existing ElevenLabs WebSocket for ${connectionId} before setting new one`);
          connection.elevenLabsWs.close();
        } catch (error) {
          console.error(`[ConnectionManager] Error closing existing ElevenLabs WebSocket: ${error.message}`);
        }
      } else if (connection.elevenLabsWs) {
        console.log(`[ConnectionManager] Existing ElevenLabs WebSocket already closing/closed for ${connectionId}, state: ${connection.elevenLabsWs.readyState}`);
      }

      connection.elevenLabsWs = elevenLabsWs;
    }
  }

  /**
   * Get the ElevenLabs WebSocket for a connection
   * @param {string} connectionId The connection ID
   * @returns {WebSocket|null} The ElevenLabs WebSocket or null if not found
   */
  getElevenLabsWs(connectionId) {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      console.warn(`[ConnectionManager] Attempted to get ElevenLabs WebSocket for non-existent connection: ${connectionId}`);
      return null;
    }
    
    this.updateActivity(connectionId);
    return connection.elevenLabsWs;
  }

  /**
   * Get custom parameters for a connection
   * @param {string} connectionId The connection ID
   * @returns {Object|null} The custom parameters or null if not found
   */
  getCustomParameters(connectionId) {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      console.warn(`[ConnectionManager] Attempted to get parameters for non-existent connection: ${connectionId}`);
      return null;
    }
    
    this.updateActivity(connectionId);
    return connection.customParameters;
  }

  /**
   * Add a log entry for a connection
   * @param {string} connectionId The connection ID
   * @param {string} type Log type (log, error, warn, info)
   * @param {string} message The log message
   * @param {Array} args Additional log arguments
   */
  addLog(connectionId, type, message, ...args) {
    // Check if the connection is being closed
    if (this.pendingClosures.has(connectionId)) {
      console.warn(`[ConnectionManager] Attempted to log to a connection that's being closed: ${connectionId}`);
      return;
    }
    
    const connection = this.connections.get(connectionId);
    if (!connection) {
      console.warn(`[ConnectionManager] Attempted to log to non-existent connection: ${connectionId}`);
      return;
    }
    
    if (connection.state.isClosing) {
      console.warn(`[ConnectionManager] Attempted to log to a connection marked for closing: ${connectionId}`);
      return;
    }
    
    if (!connection.ws) {
      console.warn(`[ConnectionManager] Attempted to log to connection with no WebSocket: ${connectionId}`);
      return;
    }
    // If the WebSocket is closing or closed, mark the connection for cleanup if not already marked
    if (connection.ws.readyState >= 2 && !this.pendingClosures.has(connectionId)) {
      console.log(`[ConnectionManager] WebSocket is in state ${connection.ws.readyState}, scheduling connection cleanup`);
      setTimeout(() => this.closeConnection(connectionId), 0);
    }
    
    this.updateActivity(connectionId);
    
    // Format any objects in args to strings
    let fullMessage = message;
    if (args.length > 0) {
      const formattedArgs = args.map(arg => {
        if (arg === null) return 'null';
        if (arg === undefined) return 'undefined';
        return typeof arg === 'object' ? JSON.stringify(arg) : String(arg);
      });
      
      // Create the full message
      fullMessage += ' ' + formattedArgs.join(' ');
    }

    // Send log to WebSocket client with error handling
    try {
      const payload = JSON.stringify({
        type: 'log',
        logType: type,
        message: fullMessage,
        timestamp: new Date().toISOString()
      });
      
      //console.log(`[ConnectionManager] Sending log to ${connectionId}: ${type} - ${fullMessage.substring(0, 50)}${fullMessage.length > 50 ? '...' : ''}`);
      connection.ws.send(payload);
    } catch (error) {
      console.error(`[ConnectionManager] Error sending log to client ${connectionId}: ${error.message}`);
      // If we can't send messages, the connection might be broken
      setTimeout(() => this.closeConnection(connectionId), 0);
    }
  }

  /**
   * Send a status message to a connection
   * @param {string} connectionId The connection ID
   * @param {string} status The status (connected, disconnected, error)
   * @param {string} message The status message
   */
  sendStatus(connectionId, status, message, requestId = null) {
    // Check if the connection is being closed
    if (this.pendingClosures.has(connectionId)) {
      console.warn(`[ConnectionManager] Attempted to send status to a connection that's being closed: ${connectionId}`);
      return;
    }
    
    const connection = this.connections.get(connectionId);
    if (!connection) {
      console.warn(`[ConnectionManager] Attempted to send status to non-existent connection: ${connectionId}`);
      return;
    }
    
    if (connection.state.isClosing) {
      console.warn(`[ConnectionManager] Attempted to send status to a connection marked for closing: ${connectionId}`);
      return;
    }
    
    if (!connection.ws) {
      console.warn(`[ConnectionManager] Attempted to send status to connection with no WebSocket: ${connectionId}`);
      return;
    }
    
    // Perform more robust WebSocket state check
    if (connection.ws.readyState !== 1) { // 1 is WebSocket.OPEN
      console.warn(`[ConnectionManager] Attempted to send status to closed/closing WebSocket: ${connectionId}, state: ${connection.ws.readyState}`);
      
      // If the WebSocket is closing or closed, mark the connection for cleanup
      if (connection.ws.readyState >= 2) {
        console.log(`[ConnectionManager] WebSocket is in state ${connection.ws.readyState}, scheduling connection cleanup`);
        setTimeout(() => this.closeConnection(connectionId), 0);
      }
      return;
    }
    
    this.updateActivity(connectionId);
    
    try {
      const payload = JSON.stringify({
        type: 'status',
        status,
        message,
        timestamp: new Date().toISOString(),
        requestId: requestId
      });
      
      //console.log(`[ConnectionManager] Sending status to ${connectionId}: ${status} - ${message}`);
      connection.ws.send(payload);
    } catch (error) {
      console.error(`[ConnectionManager] Error sending status to client ${connectionId}: ${error.message}`);
      // If we can't send messages, the connection might be broken
      setTimeout(() => this.closeConnection(connectionId), 0);
    }
  }

  /**
   * Close and remove a connection
   * @param {string} connectionId The connection ID
   */
  closeConnection(connectionId) {
    console.log(`[ConnectionManager] Closing connection: ${connectionId}`);
    
    // If this connection is already being closed, don't try again
    if (this.pendingClosures.has(connectionId)) {
      console.warn(`[ConnectionManager] Connection ${connectionId} is already being closed. Skipping duplicate close.`);
      return;
    }
    
    const connection = this.connections.get(connectionId);
    if (!connection) {
      console.warn(`[ConnectionManager] Attempted to close non-existent connection: ${connectionId}`);
      return;
    }
    
    // Mark connection as being closed to prevent race conditions
    this.pendingClosures.add(connectionId);
    connection.state.isClosing = true;
    
    // Clear any timeout for this connection
    if (this.connectionTimeouts.has(connectionId)) {
      clearTimeout(this.connectionTimeouts.get(connectionId));
      this.connectionTimeouts.delete(connectionId);
    }
    
    // Close ElevenLabs WebSocket if it exists
    if (connection.elevenLabsWs) {
      try {
        console.log(`[ConnectionManager] Closing ElevenLabs WebSocket for connection: ${connectionId}`);
        if (connection.elevenLabsWs.readyState < 2) { // Only close if not already closing/closed
          connection.elevenLabsWs.close();
        } else {
          console.log(`[ConnectionManager] ElevenLabs WebSocket already closing/closed for connection: ${connectionId}, state: ${connection.elevenLabsWs.readyState}`);
        }
      } catch (error) {
        console.error(`[ConnectionManager] Error closing ElevenLabs WebSocket for ${connectionId}: ${error.message}`);
      }
      connection.elevenLabsWs = null;
    }

    // Close client WebSocket if it exists
    if (connection.ws) {
      try {
        // Only close if it's not already closed or closing
        if (connection.ws.readyState < 2) { // 0 = CONNECTING, 1 = OPEN
          console.log(`[ConnectionManager] Closing client WebSocket for connection: ${connectionId}`);
          connection.ws.close(1000, "Connection closed by server");
        } else {
          console.log(`[ConnectionManager] Client WebSocket already closing/closed for connection: ${connectionId}, state: ${connection.ws.readyState}`);
        }
      } catch (error) {
        console.error(`[ConnectionManager] Error closing client WebSocket for ${connectionId}: ${error.message}`);
      }
      connection.ws = null;
    }

    // Ensure all cleanup tasks are done before removing the connection
    Promise.all([
      new Promise(resolve => {
        if (connection.elevenLabsWs && connection.elevenLabsWs.readyState < 2) {
          connection.elevenLabsWs.onclose = resolve;
          connection.elevenLabsWs.close();
        } else {
          resolve();
        }
      }),
      new Promise(resolve => {
        if (connection.ws && connection.ws.readyState < 2) {
          connection.ws.onclose = resolve;
          connection.ws.close(1000, "Connection closed by server");
        } else {
          resolve();
        }
      })
    ]).then(() => {
      // Remove connection from all tracking maps and sets
      this.connections.delete(connectionId);
      this.connectionTimestamps.delete(connectionId);
      this.pendingClosures.delete(connectionId);
      console.log(`[ConnectionManager] Connection fully removed: ${connectionId}`);
      this.emit('connectionClosed', connectionId);
    }).catch(error => {
      console.error(`[ConnectionManager] Error during connection cleanup: ${error.message}`);
    });
  }

  /**
   * Get all active connection IDs
   * @returns {Array} Array of connection IDs
   */
  getActiveConnectionIds() {
    // Filter out any connections marked for closing
    return Array.from(this.connections.entries())
      .filter(([_, conn]) => !conn.state.isClosing)
    const staleThreshold = this.staleThreshold;
  }

  /**
   * Get active connection count
   * @returns {number} Number of active connections
   */
  getConnectionCount() {
    // Count only non-closing connections
    return this.getActiveConnectionIds().length;
  }
  
  /**
   * Perform a cleanup of stale connections
   * Should be called periodically
   */
  cleanupStaleConnections() {
    console.log(`[ConnectionManager] Checking for stale connections...`);
    const now = Date.now();
    const staleThreshold = 10 * 60 * 1000; // 10 minutes
    
    for (const [connectionId, timestamp] of this.connectionTimestamps.entries()) {
      const connection = this.connections.get(connectionId);
      if (!connection) continue;
      
      const lastActivity = connection.state.lastActivity || timestamp;
      const timeSinceActivity = now - lastActivity;
      
      if (timeSinceActivity > staleThreshold && connection.ws.readyState < 2) {
        console.warn(`[ConnectionManager] Cleaning up stale connection ${connectionId} (inactive for ${Math.round(timeSinceActivity/1000/60)} minutes)`);
        this.closeConnection(connectionId);
      }
    }
  }
}

module.exports = ConnectionManager;

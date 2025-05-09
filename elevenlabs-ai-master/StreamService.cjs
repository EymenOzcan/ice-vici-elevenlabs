const { Buffer } = require('buffer');
const EventEmitter = require('events');

// Define packet types for Asterisk audiosocket
const PACKET_TYPES = {
  TERMINATE: 0x00,
  UUID: 0x01,
  AUDIO: 0x10,
  ERROR: 0xff,
};

// StreamService implementation (optimized version)
class StreamService extends EventEmitter {
  constructor(socket) {
    super();
    this.socket = socket;
    this.uuid = null;
    this.audioQueue = []; // Initialize audio queue
    this.isSending = false; // Flag to prevent concurrent sending
    this.packetHandlers = {
      [PACKET_TYPES.TERMINATE]: this.handleTerminatePacket.bind(this),
      [PACKET_TYPES.UUID]: this.handleUUIDPacket.bind(this),
      [PACKET_TYPES.AUDIO]: this.handleAudioPacket.bind(this),
      [PACKET_TYPES.ERROR]: this.handleErrorPacket.bind(this),
    };
    
    // Listen for voice interruption events
    this.on('voiceInterrupted', this.clearAudioBuffer.bind(this));
  }

  async sendAudio(audio) {
    this.audioQueue.push(audio); // Add audio to the queue
    if (!this.isSending) {
      this.processAudioQueue(); // Start processing the queue if not already in progress
    }
  }

  /**
   * Signals that voice streaming has been interrupted
   * This will trigger the clearAudioBuffer method to empty the cache/buffer
   */
  signalVoiceInterruption() {
    console.log('[Audiosocket] Voice interruption detected');
    this.emit('voiceInterrupted');
    return this; // For method chaining
  }

  /**
   * Checks if there is currently an active voice stream
   * @returns {boolean} True if audio is currently being sent, false otherwise
   */
  isStreaming() {
    return this.isSending || this.audioQueue.length > 0;
  }

  /**
   * Handles voice interruption during active streaming
   * If there's an active stream, it will signal an interruption and clear the buffer
   * @returns {boolean} True if an active stream was interrupted, false otherwise
   */
  handleInterruptionIfStreaming() {
    if (this.isStreaming()) {
      console.log('[Audiosocket] Interrupting active voice stream');
      this.signalVoiceInterruption();
      return true;
    }
    return false;
  }

  async processAudioQueue() {
    if (this.isSending) return; // Prevent concurrent processing

    this.isSending = true;
    try {
      // Create a local variable to track interruption state
      let interruptionDetected = false;
      
      // Set up a one-time listener for voice interruption events
      const interruptionHandler = () => {
        interruptionDetected = true;
        console.log('[Audiosocket] Interruption detected during audio processing');
      };
      
      this.once('voiceInterrupted', interruptionHandler);

      while (this.audioQueue.length > 0 && !interruptionDetected) {
        const audio = this.audioQueue.shift(); // Get the next audio chunk from the queue
        
        // Skip processing if it's empty or null
        if (!audio || audio.length === 0) continue;

        const chunkSize = 320;
        for (let i = 0; i < audio.length; i += chunkSize) {
          // Check for interruption flag before sending each chunk
          if (interruptionDetected) break;

          const chunk = audio.slice(i, i + chunkSize);
          const header = Buffer.alloc(3);
          header.writeUInt8(PACKET_TYPES.AUDIO, 0);
          header.writeUInt16BE(chunk.length, 1);
          const packet = Buffer.concat([header, chunk]);
          this.socket.write(packet);
          // Wait for 19ms to fit within the 20ms frame size
          await new Promise(resolve => setTimeout(resolve, 19));
        }

        if (!interruptionDetected) {
          this.emit('audioSent', audio.length);
        }
      }

      // Remove the interruption listener if we're done
      this.removeListener('voiceInterrupted', interruptionHandler);

      if (interruptionDetected) {
        console.log('[Audiosocket] Processing interrupted, remaining audio discarded');
        // Clear any remaining audio in the queue
        this.audioQueue = [];
        this.emit('bufferCleared');
      }
    } catch (error) {
      console.error('[Audiosocket] Error sending audio:', error);
      this.emit('error', error);
    } finally {
      this.isSending = false;
    }
  }

  handleAndProcessPacket(packetData, transformStream) {
    if (!packetData || !Buffer.isBuffer(packetData)) {
      console.warn('[Audiosocket] Invalid packet data received');
      return;
    }

    let buffer = packetData;
    while (buffer.length >= 3) {
      const packetType = buffer.readUInt8(0);
      const packetLength = buffer.readUInt16BE(1);
      const fullPacketLength = 3 + packetLength;

      if (buffer.length < fullPacketLength) {
        break; // Wait for more data
      }

      const packet = buffer.subarray(0, fullPacketLength);
      buffer = buffer.subarray(fullPacketLength);

      this.processPacket(packetType, packetLength, packet, transformStream);
    }
  }

  processPacket(type, length, packet, transformStream) {
    const handler = this.packetHandlers[type];
    if (handler) {
      handler(length, packet, transformStream);
    } else {
      console.warn(`[Audiosocket] Unknown packet type received: ${type}`);
    }
  }

  handleTerminatePacket() {
    console.log('[Audiosocket] Terminate packet received. Closing connection.');
    // Clear the audio buffer when terminating
    this.clearAudioBuffer();
    this.emit('terminate');
    try {
      this.socket.end();
    } catch (error) {
      console.error('[Audiosocket] Error while closing the socket:', error);
    }
  }

  handleUUIDPacket(length, packet) {
    //console.log('[Audiosocket] UUID packet received. Length:', length);
    // Get only 9 digits Lead ID
    this.uuid = packet.subarray(3, 12).toString();
    this.emit('uuid', this.uuid);
  }

  handleAudioPacket(length, packet, transformStream) {
    if (!transformStream) {
      console.warn('[Audiosocket] Transform stream is not available or invalid.');
      return;
    }
    
    const audioData = packet.subarray(3, 3 + length);
    transformStream.write(audioData);
    this.emit('audioReceived', audioData);
  }

  handleErrorPacket(length, packet) {
    const errorCode = length > 0 ? packet.readUInt8(3) : null;
    console.log(`Error packet received with code: ${errorCode}`);
    // Clear the audio buffer when an error occurs
    this.clearAudioBuffer();
    this.emit('protocolError', errorCode);
  }

  /**
   * Clears the audio buffer/cache when voice streaming is interrupted
   * This prevents stale audio data from being sent after an interruption
   */
  clearAudioBuffer() {
    console.log('[Audiosocket] Clearing audio buffer due to voice interruption');
    // Empty the audio queue
    this.audioQueue = [];
    // Emit an event to notify that the buffer has been cleared
    this.emit('bufferCleared');
  }

  /**
   * Resets the stream state after an interruption
   * This should be called before starting a new stream after an interruption
   */
  resetStreamState() {
    console.log('[Audiosocket] Resetting stream state');
    this.clearAudioBuffer();
    this.isSending = false;
    this.emit('streamReset');
    return this;
  }

}

// Export the StreamService class and PACKET_TYPES
module.exports = {
  StreamService,
  PACKET_TYPES
};

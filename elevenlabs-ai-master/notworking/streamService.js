import { Buffer } from 'node:buffer';
import EventEmitter from 'events';

const PACKET_TYPES = {
  TERMINATE: 0x00,
  UUID: 0x01,
  AUDIO: 0x10,
  ERROR: 0xff,
};

export class StreamService extends EventEmitter {
  constructor(socket) {
    super();
    this.socket = socket;
    this.expectedAudioIndex = 0;
    this.audioBuffer = {};
    this.uuid = null;
    this.audioQueue = [];
    this.isSending = false;
    this.interuptAudio = false;
  }

  /**
   * Buffers the audio data and sends it in the correct order.
   * @param {number|null} index - The index of the audio packet. If null, the audio is sent immediately.
   * @param {Buffer} audio - The audio data to be sent.
   */
  buffer(index, audio) {
    // If the index is null, send the audio immediately
    if (index === null) {
      this.sendAudio(audio, null);
      return;
    }
    // If the index is the expected index, send the audio and check for buffered audio
    this.sendAudio(audio, index);
    /*
    if (index === this.expectedAudioIndex) {
      this.sendAudio(audio, index);
      this.expectedAudioIndex++;
      while (this.audioBuffer[this.expectedAudioIndex]) {
        const nextAudio = this.audioBuffer[this.expectedAudioIndex];
        this.sendAudio(nextAudio, this.expectedAudioIndex);
        delete this.audioBuffer[this.expectedAudioIndex];
        this.expectedAudioIndex++;
      }
    } else {
      // If the index is not the expected index, buffer the audio
      this.audioBuffer[index] = audio;
    }
    */
  }

  // Method to stop sending audio, can be called when a new transcript arrives
  interruptAudio() {
    console.log('Stream Service: Interrupting audio transmission');
    // Set the interrupt flag
    this.interuptAudio = true;
    // Clear the audio queue
    this.audioQueue = [];
    // Clear buffered audio
    this.audioBuffer = {};
  }

  // Method to send audio to the socket
  async sendAudio(audio, index) {
    if (this.isSending) {
      this.audioQueue.push(audio);
      return;
    }

    // Method to send audio chunks to the socket
    const sendChunk = async (audioData) => {
      this.isSending = true;
      const chunkSize = 320;
      for (let i = 0; i < audioData.length; i += chunkSize) {
        // Check if audio has been interrupted before sending each chunk
        if (this.interuptAudio) {
          console.log('Audio transmission interrupted during chunk processing');
          this.interuptAudio = false; // Reset flag after interruption is handled
          break; // Exit the loop
        }

        const chunk = audioData.slice(i, i + chunkSize);
        const header = Buffer.alloc(3);
        header.writeUInt8(PACKET_TYPES.AUDIO, 0);
        header.writeUInt16BE(chunk.length, 1);
        const packet = Buffer.concat([header, chunk]);
        this.socket.write(packet);
        await new Promise(resolve => setTimeout(resolve, 18));
      }
    };

    // Send the audio data
    try {
      // Check if audio was interrupted before starting
      if (!this.interuptAudio) {
        await sendChunk(audio);

        // Process audio queue if not interrupted
        while (this.audioQueue.length > 0 && !this.interuptAudio) {
          const nextAudio = this.audioQueue.shift();
          await sendChunk(nextAudio);
        }
      } else {
        // Reset the flag after handling the interruption
        this.interuptAudio = false;
        console.log('Audio transmission interrupted before processing');
      }
    } catch (error) {
      console.error('Error sending audio:', error);
      this.emit('error', error);
    }
    this.isSending = false;
  }

  // Method to handle and process incoming packets
  async handleAndProcessPacket(packetData, transformStream) {
    let buffer = Buffer.isBuffer(packetData) ? packetData : Buffer.from(packetData);
    this.processNextPacket(buffer, transformStream);
  }

  // Method to process the next packet
  processNextPacket(buffer, transformStream) {
    if (buffer.length < 3) {
      console.warn('Incomplete packet header received.');
      return;
    }

    const packetLength = buffer.readUInt16BE(1);
    const fullPacketLength = 3 + packetLength;

    if (buffer.length < fullPacketLength) {
      console.warn(`Incomplete packet, waiting for more data. Expected: ${fullPacketLength}, Received: ${buffer.length}`);
      return;
    }

    const packet = buffer.subarray(0, fullPacketLength);
    buffer = buffer.subarray(fullPacketLength);

    const type = packet.readUInt8(0);
    const length = packet.readUInt16BE(1);

    this.handlePacket(type, length, packet, buffer, transformStream);
  }

  // Method to handle different packet types
  handlePacket(type, length, packet, buffer, transformStream) {
    switch (type) {
    case PACKET_TYPES.TERMINATE:
      this.handleTerminatePacket();
      break;
    case PACKET_TYPES.UUID:
      this.handleUUIDPacket(length, packet);
      break;
    case PACKET_TYPES.AUDIO:
      this.handleAudioPacket(length, packet, transformStream);
      break;
    case PACKET_TYPES.ERROR:
      this.handleErrorPacket(length, packet);
      break;
    default:
      console.warn(`Unknown packet type: ${type}`);
      break;
    }

    // Process the next packet
    if (buffer.length > 0) {
      setTimeout(() => this.processNextPacket(buffer, transformStream), 0);
    }
  }

  // Method to handle the terminate packet
  handleTerminatePacket() {
    console.log('Terminate packet received. Closing connection.');
    try {
      this.socket.end();
    } catch (error) {
      console.error('Error while closing the socket:', error);
    }
  }

  // Method to handle the UUID packet
  handleUUIDPacket(length, packet) {
    if (length >= 16) {
      this.uuid = packet.subarray(3, 19).toString('hex'); // Store the UUID
    }
  }

  // Method to handle the audio packet
  handleAudioPacket(length, packet, transformStream) {
    const audioData = packet.subarray(3, 3 + length);
    if (transformStream) {
      transformStream.write(audioData);
    } else {
      console.warn('Transform stream is not available or invalid.');
    }
  }

  // Method to handle the error packet
  handleErrorPacket(length, packet) {
    let errorCode = length > 0 ? packet.readUInt8(3) : null;
    console.log(`Error packet received with code: ${errorCode}`);
  }
}

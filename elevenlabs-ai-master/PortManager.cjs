const net = require('net');
const EventEmitter = require('events');
const { StreamService } = require('./StreamService.cjs');


class PortManager extends EventEmitter {
  constructor(minPort = 5052, maxPort = 5059, dbManager) {
    super();
    this.minPort = minPort;
    this.maxPort = maxPort;
    this.usedPorts = new Set();
    this.activeServers = new Map(); // connectionId -> {server, port}
    this.dbManager = dbManager;
  }

  allocatePort() {
    for (let port = this.minPort; port <= this.maxPort; port++) {
      if (!this.usedPorts.has(port)) {
        this.usedPorts.add(port);
        return port;
      }
    }
    throw new Error('No available ports in the specified range');
  }

  releasePort(port) {
    this.usedPorts.delete(port);
    console.log(`[PortManager] Released port ${port}`);
  }

  createCallServer(connectionId, customParameters, setupElevenLabsCallback, streamServiceFactory, port = null) {
    let persistant = false;
    try {
      let allocatedPort;
      if (port === null) {
        allocatedPort = this.allocatePort();
        console.log(`[PortManager] Allocated port ${allocatedPort} for connection ${connectionId}`);
      } else {
        if (this.usedPorts.has(port)) {
          return false;
        }
        persistant = true;
        allocatedPort = port;
        this.usedPorts.add(port);
        console.log(`[PortManager] Using provided port ${port} for connection ${connectionId}`);
      }

      const server = net.createServer(async (socket) => {
        console.log(`[Audiosocket:${port}] Stream connected for ${connectionId}`);
        socket.setNoDelay(true);
        
        // Get Dialer Remote Agent and Live Agent Parameters
        try {
          [customParameters.remoteAgent] = await this.dbManager.getActiveRemoteAgents(port);
          console.log(`[Audiosocket:${port}] Stream for Remote Agent - User: ${customParameters.remoteAgent.user_start} - Exten: ${customParameters.remoteAgent.conf_exten} - IP: ${customParameters.remoteAgent.server_ip}`);
          customParameters.liveAgent = await this.dbManager.getLiveAgents(customParameters.remoteAgent.user_start, customParameters.remoteAgent.conf_exten, customParameters.remoteAgent.server_ip);
          console.log(`[Audiosocket:${port}] Stream for Live Agent - User: ${customParameters.liveAgent.lead_id} - Campaign: ${customParameters.liveAgent.campaign_id} - Channel: ${customParameters.liveAgent.channel} - Callserver: ${customParameters.liveAgent.call_server_ip}`);
          customParameters.autoCalls = await this.dbManager.getAutoCalls(customParameters.liveAgent.lead_id);
          console.log(`[Audiosocket:${port}] Stream for Auto Calls - Phone No: ${customParameters.autoCalls.phone_code}${customParameters.autoCalls.phone_number} - Status: ${customParameters.autoCalls.status} - CallTime: ${customParameters.autoCalls.call_time} - CallType: ${customParameters.autoCalls.call_type}`);
          const leadData = await this.dbManager.getLeadData(customParameters.liveAgent.lead_id);
          console.log(`[Audiosocket:${port}] Lead Informations loaded`);
          const leadFields = await this.dbManager.getLeadDataCustomFields(customParameters.liveAgent.lead_id);
          console.log(`[Audiosocket:${port}] Lead Fields loaded`);
          customParameters.leadData = { ...leadData, ...leadFields };

        }
        catch (error) {
          console.error(`[Audiosocket-${port}] Error getting agent data:`, error);
        }


        const streamService = streamServiceFactory(socket);

        // UUID
        streamService.on('uuid', async (uuid) => {
          console.log(`[Audiosocket-${port}] Connection got UUID ${uuid}`);
        });

        // Hangup von anderer SEite
        streamService.on('terminate', () => {         
          this.closeCallServer(connectionId, persistant);
          //socket.end();
          console.log(`[Audiosocket:${port}] Stream terminated from other side for ${connectionId}`);
        });
        
        // Create a transform stream for audio data
        const { Transform } = require('stream');
        const transformStream = new Transform({
          transform(chunk, encoding, callback) {
            //console.log(`[Audiosocket:${port}] Processing ${chunk.length} bytes of audio`);
            callback(null, chunk);
          },
        });
        
        try {
          // Set up ElevenLabs with the known parameters immediately
          console.log(`[Audiosocket:${port}] Setting up ElevenLabs using known parameters`);
          const elevenLabsWs = await setupElevenLabsCallback(connectionId, customParameters);
          
          if (!elevenLabsWs) {
            console.error(`[Audiosocket:${port}] Failed to establish ElevenLabs connection`);
            // Don't continue with socket setup if no connection
            socket.end();
            return;
          }

          console.log(`[Audiosocket:${port}] ElevenLabs connection established successfully`);
                
          // Set up handlers for ElevenLabs messages AFTER connection is established
          this.setupElevenLabsHandlers(elevenLabsWs, streamService, connectionId);

          // Handle incoming data from Asterisk
          socket.on('data', (packetData) => {
            //console.log(`[Audiosocket:${port}] Received ${packetData.length} bytes from Asterisk`);
            
            // Process packets for audio data
            try {
              streamService.handleAndProcessPacket(packetData, transformStream);
            } catch (error) {
              console.error(`[Audiosocket:${port}] Error processing packet:`, error);
            }
          });
            // Handle socket closure
            socket.on('end', () => {
              console.log(`[Audiosocket:${port}] Stream disconnected for ${connectionId}`);
              if (elevenLabsWs && elevenLabsWs.readyState === 1) {
                elevenLabsWs.close();
              }
              
              // Close and cleanup the server
              this.closeCallServer(connectionId, persistant);
            });

        } catch (wsError) {
          console.error(`[Audiosocket:${port}] Error setting up ElevenLabs:`, wsError);
          socket.end();
          this.closeCallServer(connectionId, persistant);
        }
        
        socket.on('error', (err) => {
          console.error(`[Audiosocket:${port}] Socket error for ${connectionId}: ${err.message}`);
        });
      });


      server.on('error', (err) => {
        console.error(`[PortManager] Server error on port ${port}: ${err.message}`);
        this.releasePort(port);
        this.emit('error', { connectionId, port, error: err });
      });

      // Add port to usedPorts before starting server if not already added
      if (!persistant) {
        this.usedPorts.add(allocatedPort);
      }

      server.listen(allocatedPort, () => {
        console.log(`[Audiosocket:${allocatedPort}] Server listening for connection ${connectionId}`);
      });
      
      this.activeServers.set(connectionId, { server, port: allocatedPort });
      return allocatedPort;
    } catch (error) {
      console.error(`[PortManager] Failed to create call server: ${error.message}`);
      throw error;
    }
  }
  
  closeCallServer(connectionId, persistant = false) {
    const serverInfo = this.activeServers.get(connectionId);
    if (!serverInfo) return;
    
    const { server, port } = serverInfo;
    
    if (!persistant) {
      server.close(() => {
        console.log(`[PortManager] Server closed for connection ${connectionId} on port ${port}`);
        this.releasePort(port);
      });
      
      this.activeServers.delete(connectionId);
    } else {
      console.log(`[PortManager] Server recycle for connection ${connectionId} on port ${port}`);
    }
  }
  
  setupElevenLabsHandlers(elevenLabsWs, streamService, connectionId) {

    streamService.on('audioReceived', (audioData) => {
      //console.log(`[Audiosocket:${port}] Audio data received: ${audioData.length} bytes`);
      // Process audio data here if needed
      // Only send if WS connection is open
      if (elevenLabsWs && elevenLabsWs.readyState === 1) { // WebSocket.OPEN
        //console.log(`[Audiosocket:${port}] Sending audio to ElevenLabs`);
        const audioMessage = {
          user_audio_chunk: Buffer.from(audioData).toString('base64'),
        };
        elevenLabsWs.send(JSON.stringify(audioMessage));
      } else {
        //console.log(`[Audiosocket:${port}] WS not ready, state: ${elevenLabsWs?.readyState}`);
      }
    });

    elevenLabsWs.on("message", data => {
      try {
        const message = JSON.parse(data);
        //console.log(`[ElevenLabs:${connectionId}] Received message type: ${message.type}`);
        
        switch (message.type) {
          case "audio":
            // Handle audio from ElevenLabs and send to Asterisk
            if (message.audio?.chunk) {
              const audioData = Buffer.from(message.audio.chunk, 'base64');
              //console.log(`[ElevenLabs:${connectionId}] Received audio chunk: ${audioData.length} bytes`);
              streamService.sendAudio(audioData);
            } else if (message.audio_event?.audio_base_64) {
              const audioData = Buffer.from(message.audio_event.audio_base_64, 'base64');
              //console.log(`[ElevenLabs:${connectionId}] Received audio event: ${audioData.length} bytes`);
              streamService.sendAudio(audioData);
            }
            break;
            
          case "agent_response":
            this.emit('agent_response', { connectionId, agent_response: message.agent_response_event?.agent_response });
            //console.log(`[ElevenLabs:${connectionId}] Agent response: ${message.agent_response_event?.agent_response}`);
            break;

          case "agent_response_correction":
            this.emit('agent_response_correction', { connectionId, agent_response_correction: message.correction_event?.corrected_response });
            //console.log(`[ElevenLabs:${connectionId}] Agent response: ${message.agent_response_event?.agent_response}`);
            break;
          case "user_transcript":
            this.emit('user_transcript', { connectionId, user_transcript: message.user_transcription_event?.user_transcript });
            //console.log(`[ElevenLabs:${connectionId}] User transcript: ${message.user_transcription_event?.user_transcript}`);
            break;
          
          case "interruption":
            //this.emit('interruption', { connectionId, interruption: message.interruption_event?.event_id });
            streamService.emit('voiceInterrupted');
            console.log(`[ElevenLabs:${connectionId}] Interruption event`);
            break;

          case "ping":
            // Handle pings from ElevenLabs
            if (message.ping_event?.event_id) {
              //console.log(`[ElevenLabs:${connectionId}] Sending pong`);
              elevenLabsWs.send(
                JSON.stringify({
                  type: "pong",
                  event_id: message.ping_event.event_id,
                })
              );
            }
            break;
            
          default:
            console.log(`[ElevenLabs:${connectionId}] Received message type: ${message.type}`);
        }
      } catch (error) {
        console.error(`[ElevenLabs:${connectionId}] Error processing message:`, error);
      }
    });
    
    elevenLabsWs.on("close", () => {
      console.log(`[ElevenLabs:${connectionId}] WebSocket closed`);
    });
    
    elevenLabsWs.on("error", (error) => {
      console.error(`[ElevenLabs:${connectionId}] WebSocket error:`, error);
    });
  }
  
  closeAllServers() {
    console.log(`[PortManager] Closing all active servers (${this.activeServers.size})`);
    
    for (const [connectionId, { server, port }] of this.activeServers.entries()) {
      console.log(`[PortManager] Closing server for ${connectionId} on port ${port}`);
      server.close(() => {
        this.releasePort(port);
      });
    }
    
    this.activeServers.clear();
  }
}

module.exports = PortManager;
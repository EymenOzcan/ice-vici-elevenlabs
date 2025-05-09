require('dotenv').config();

const { Transform } = require('stream');
const { WebSocket, WebSocketServer } = require('ws');
const net = require('net');
const fetch = require('node-fetch');
const blob = require('blob');
const URL = require('url');
const { ElevenLabsClient } = require('elevenlabs');
const AsteriskService = require('./AsteriskManager.cjs');
const { StreamService, PACKET_TYPES } = require('./StreamService.cjs');
const ConnectionManager = require('./ConnectionManager.cjs');
const ConsoleLogger = require('./ConsoleLogger.cjs');
const PortManager = require('./PortManager.cjs');
const { pool, testConnection, getSessionData } = require('./MySQL.cjs');
const DatabaseManager = require('./DatabaseManager.cjs');
 
// Environment variables
const { ELEVENLABS_AGENT_ID, ELEVENLABS_API_KEY, CHECK_REMOTE_AGENTS_INTERVAL } = process.env;

if (!ELEVENLABS_API_KEY) {
  throw new Error('Missing environment variables');
}

// Initialize managers and services
const dbManager = new DatabaseManager();
const asteriskService = new AsteriskService();

// Check for active remote agents and create call servers
async function checkAndCreateRemoteAgentServers() {
  try {
    const activeAgents = await dbManager.getActiveRemoteAgents();
    const activeAgentIds = new Set(activeAgents.map(agent => String(agent.remote_agent_id)));
    //console.log(`[RemoteAgents] Found ${activeAgents.length} active remote agents`);

    for (const agent of activeAgents) {
      const connectionId = `${agent.audio_port}`;
      try {
        // Create call server for each active agent
        const port = portManager.createCallServer(
          connectionId,
          { agent_id: agent.agent_id || process.env.ELEVENLABS_AGENT_ID },  // Use custom agent_id or fallback to default
          setupElevenLabs,
          (socket) => new StreamService(socket),
          agent.audio_port
        );
        //console.log(`[RemoteAgents] Created call server for agent ${agent.remote_agent_id} on port ${port}`);
      } catch (error) {
        console.error(`[RemoteAgents] Error creating call server for agent ${agent.remote_agent_id}:`, error);
      }
    }

    // Cleanup inactive call servers
    for (const [connectionId, serverInfo] of portManager.activeServers.entries()) {
      if (connectionId.startsWith('remote_')) {
        const remoteAgentId = connectionId.split('_')[1];
        //console.log(`[RemoteAgents] Checking agent ${remoteAgentId} - Active in DB: ${activeAgentIds.has(remoteAgentId)}`);
        if (!activeAgentIds.has(remoteAgentId)) {
          console.log(`[RemoteAgents] Closing inactive call server for agent ${remoteAgentId}`);
          portManager.closeCallServer(connectionId, false);
        }
      }
    }
  } catch (error) {
    console.error('[RemoteAgents] Error checking remote agents:', error);
  }
}

// Start periodic check for remote agents
const checkInterval = parseInt(CHECK_REMOTE_AGENTS_INTERVAL || '60000', 10);
const checkRemoteAgentsInterval = setInterval(checkAndCreateRemoteAgentServers, checkInterval);


const activeAgents = dbManager.getActiveRemoteAgents().then(agents => {
  console.error(`[RemoteAgents] Found ${activeAgents} active remote agents`);
}).catch(error => { 
  console.error('[RemoteAgents] Error fetching active remote agents:', error);
}
);
//console.log(activeAgents);
//console.log(`[RemoteAgents] Found ${activeAgents.length} active remote agents`);
//return;

// Initialize the port manager
const portManager = new PortManager(
  parseInt(process.env.AUDIOSOCKET_PORT_MIN || '15052'), 
  parseInt(process.env.AUDIOSOCKET_PORT_MAX || '15099'),
  dbManager
);

// Initial check
checkAndCreateRemoteAgentServers();
// Set up PortManager event listeners
portManager.on('user_transcript', ({ connectionId, user_transcript }) => {
  console.log(`[ElevenLabs:${connectionId}] User: ${user_transcript}`);
});

portManager.on('agent_response_correction', ({ connectionId, agent_response_correction }) => {
  console.log(`[ElevenLabs:${connectionId}] Agent Correction: ${agent_response_correction}`);
});

portManager.on('agent_response', ({ connectionId, agent_response }) => {
  console.log(`[ElevenLabs:${connectionId}] Agent: ${agent_response}`);
});

portManager.on('interruption', ({ connectionId, interruption }) => {
  console.log(`[ElevenLabs:${connectionId}] Interruption ${interruption}`);
});



// Initialize connection manager and logger
const connectionManager = new ConnectionManager();
const consoleLogger = new ConsoleLogger(connectionManager);

// Start WebSocket API server
const API_PORT = process.env.API_PORT || 3000;
const wss = new WebSocketServer({ port: API_PORT });
console.log(`[WebSocket API] Server listening on port ${API_PORT}`);

// Helper function to sync agents with database
async function saveAgentDb(apiResponse, createNew = false) {
  if (!apiResponse) {
    throw new Error('API response is null or undefined');
  }
  if (!apiResponse.agent_id) {
    throw new Error('API response does not contain agent_id');
  }
  try {
      await dbManager.updateAgentDb({
        agent_id: apiResponse.agent_id,
        comp_id: apiResponse.comp_id,
        user_id: apiResponse.user_id,
        name: apiResponse.name,
        prompt: apiResponse.conversation_config?.agent?.prompt?.prompt,
        first_message: apiResponse.conversation_config?.agent?.first_message,
        language: apiResponse.conversation_config?.agent?.language,
        voice_id: apiResponse.conversation_config?.tts?.voice_id,
        model_id: apiResponse.conversation_config?.tts?.model_id,
        llm_model: apiResponse.conversation_config?.agent?.prompt?.llm,
        llm_temperature: apiResponse.conversation_config?.agent?.prompt?.temperature,
        turn_timeout: apiResponse.conversation_config?.turn?.turn_timeout,
        turn_mode: apiResponse.conversation_config?.turn?.mode,
        max_duration_seconds: apiResponse.conversation_config?.conversation?.max_duration_seconds,
        asr_config: apiResponse.conversation_config?.asr,
        tts_config: apiResponse.conversation_config?.tts,
        conversation_config: apiResponse.conversation_config?.conversation,
        prompt_config: apiResponse.conversation_config?.agent?.prompt,
            language_presets: apiResponse.conversation_config?.language_presets || {},
            dynamic_variables: apiResponse.conversation_config?.agent?.dynamic_variables || {},
            auth_config: apiResponse.platform_settings?.auth || {},
        evaluation_criteria: apiResponse.platform_settings?.evaluation?.criteria || [],
        data_collection_config: apiResponse.platform_settings?.data_collection || {},
        override_config: apiResponse.platform_settings?.overrides || {},
        call_limits: apiResponse.platform_settings?.call_limits || {},
        privacy_settings: apiResponse.platform_settings?.privacy || {},
            safety_settings: apiResponse.platform_settings?.safety || {},
        raw_configuration: apiResponse,
        created_at_unix_secs: apiResponse.metadata?.created_at_unix_secs
    }, createNew);
/*
    // Mark agents not in API response as inactive
    const currentAgents = await dbManager.getExistingAgents();
    // Create a Set with just the current agent_id since we're processing one at a time
    const currentApiAgentIds = new Set([apiResponse.agent_id]);
    
    const inactiveAgents = currentAgents
      .filter(agent => !currentApiAgentIds.has(agent.agent_id))
      .map(agent => agent.agent_id);

    for (const agentId of inactiveAgents) {
      await dbManager.deactivateAgent(agentId);
    }
*/
    return true;
  } catch (error) {
    console.error('[Database] Error syncing agents:', error);
    throw error;
  }
}
// Helper function to get signed URL for ElevenLabs
async function getSignedUrl(agentId = null) {
  try {
    // Use provided agent_id or fall back to environment variable
    const agent_id = agentId || ELEVENLABS_AGENT_ID;
    
    if (!ELEVENLABS_API_KEY) {
      throw new Error("Missing ELEVENLABS_API_KEY in environment variables");
    };
    if (!agent_id) {
      throw new Error("Missing ELEVENLABS_AGENT_ID in environment variables or custom parameters");
    };
    console.log(`[ElevenLabs] Getting signed URL for agent_id: ${agent_id}`);
    // Add timeout to prevent hanging requests
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
    try {
      const response = await fetch(
        `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${agent_id}`,
        {
          method: "GET",
          headers: {
            "xi-api-key": ELEVENLABS_API_KEY,
          },
          signal: controller.signal
        }
      );
      clearTimeout(timeoutId);
      if (!response.ok) {
        throw new Error(`Failed to get signed URL: ${response.statusText}`);
      }
      const data = await response.json();
      //console.log(`[ElevenLabs] Successfully obtained signed URL`);
      return data.signed_url;
    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        throw new Error('Timeout while getting signed URL from ElevenLabs API');
      }
      throw fetchError;
    }
  } catch (error) {
    console.error("[ElevenLabs] Error getting signed URL:", error);
    throw error;
  }
}

// Function to set up ElevenLabs connection with custom parameters
const setupElevenLabs = async (connectionId = null, customParameters = null) => {
  let connectionTimeout;
  
  return new Promise((resolve, reject) => {
    try {
      // Better logging for debugging
      console.log(`[ElevenLabs] Setting up connection for ${connectionId} with parameters: `, 
        customParameters ? JSON.stringify(customParameters).substring(0, 100) + "..." : "none");
      
      const agentId = customParameters?.agent_id || null;
      
      // Get signed URL with better error handling
      getSignedUrl(agentId).then(signedUrl => {
        //console.log(`[ElevenLabs:${connectionId}] Got signed URL: ${signedUrl}`);
        
        // Create WebSocket with connection timeout
        //console.log(`[ElevenLabs:${connectionId}] Creating WebSocket connection to ${signedUrl}`);
        const wsConnection = new WebSocket(signedUrl);
        
        // Set a 15-second timeout for connection
        connectionTimeout = setTimeout(() => {
          console.error(`[ElevenLabs:${connectionId}] Connection timeout`);
          try {
            if (wsConnection) wsConnection.close();
          } catch (e) {}
          reject(new Error('Connection timeout: Cannot connect to service within 15 seconds'));
        }, 15000);
        
        // Handle successful connection
        wsConnection.on("open", () => {
          clearTimeout(connectionTimeout);
          console.log(`[ElevenLabs:${connectionId}] Connected successfully to Conversational AI`);
          
          // Send initial configuration with prompt and first message
          const initialConfig = {
            type: "conversation_initiation_client_data",
            conversation_config_override: {
              agent: {},
            },
            dynamic_variables: {
              agent_id: customParameters?.agent_id,
              called_number: customParameters.autoCalls?.phone_code + customParameters.autoCalls?.phone_number,
              lead_id: customParameters.autoCalls?.lead_id,
              campaign_id: customParameters.liveAgent?.campaign_id,
              uniqueid: customParameters.liveAgent?.uniqueid,              
              first_name: customParameters.leadData?.first_name,
              last_name: customParameters.leadData?.last_name,
              title: customParameters.leadData?.title,
              address1: customParameters.leadData?.address1,
              address2: customParameters.leadData?.address2,
              city: customParameters.leadData?.city,
              postal_code: customParameters.leadData?.postal_code,
              custom1: customParameters.leadData?.custom1,
              custom2: customParameters.leadData?.custom2,
              email: customParameters.leadData?.email,
              phone_number: customParameters.leadData?.phone_number,
              comments: customParameters.leadData?.comments,
              called_count: customParameters.leadData?.called_count,
            },
          };
          
          // Apply custom parameters if available
          if (customParameters?.params?.prompt) {
            initialConfig.conversation_config_override.agent.prompt = { "prompt": customParameters?.params.prompt};
            console.log(`[ElevenLabs:${connectionId}] Using prompt: ${customParameters?.params.prompt}`);
          }
          if (customParameters?.params?.first_message) {
            initialConfig.conversation_config_override.agent.first_message = customParameters?.params.first_message;
            console.log(`[ElevenLabs:${connectionId}] Using first message: ${customParameters?.params.first_message}`);
          }
          if (customParameters?.params?.language) {
            initialConfig.conversation_config_override.agent.language = customParameters?.params.language;
            console.log(`[ElevenLabs:${connectionId}] Using language: ${customParameters?.params.language}`);
          }
          
          // Event listeners are now handled at application startup

          // Send with error handling
          try {
            console.log(`[ElevenLabs:${connectionId}] Sending initial config`);
            wsConnection.send(JSON.stringify(initialConfig));
            
            // Register the WebSocket with the connection manager
            if (connectionId) {
              connectionManager.setElevenLabsWs(connectionId, wsConnection);
            }
                        
            resolve(wsConnection);

            // Handle connection close *after* resolving
            wsConnection.on("close", (code, reason) => {
              clearTimeout(connectionTimeout);
              if (wsConnection.readyState !== WebSocket.OPEN) {
                console.error(`[ElevenLabs:${connectionId}] Hangup? WebSocket closed before open: ${code} - ${reason}`);
                //StreamService.sendAudio(Buffer.from([0x00, 0x00, 0x00, 0x00]));
                //handleTerminatePacket
                // TODO: hangup call
                //portManager.closeCallServer(connectionId);
                reject(new Error(`WebSocket closed before open: ${code} - ${reason}`));
              }
            });

          } catch (sendError) {
            console.error(`[ElevenLabs:${connectionId}] Error sending initial config:`, sendError);
            reject(sendError);
          }
        });
        
        // Handle connection errors
        wsConnection.on("error", (wsError) => {
          clearTimeout(connectionTimeout);
          console.error(`[ElevenLabs:${connectionId}] WebSocket error during setup:`, wsError);
          reject(wsError);
        });
      }).catch(urlError => {
        console.error(`[ElevenLabs:${connectionId}] Failed to get signed URL:`, urlError.message);
        if (connectionId) {
          connectionManager.sendStatus(connectionId, 'error', `Failed to get signed URL: ${urlError.message}`, data.requestId);
        }
        reject(urlError);
      });
    } catch (error) {
      clearTimeout(connectionTimeout);
      console.error(`[ElevenLabs:${connectionId}] Setup error:`, error.message);
      reject(error);
    }
  });
};

wss.on('connection', (ws, req) => {
    const ip = req.headers['x-forwarded-for'] ? 
    req.headers['x-forwarded-for'].split(',')[0].trim() : 
    req.socket.remoteAddress;
    console.log(`[WebSocket] Connection received from ${ip}`);
    // Generate a connection ID and register it
    const connectionId = connectionManager.registerConnection(ws);
    //console.log(`[WebSocket] New connection established: ${connectionId}`);
    // Send connected status to client
    try {
      connectionManager.sendStatus(connectionId, 'connected', 'WebSocket connection established');
    } catch (error) {
      console.error(`[WebSocket] Error sending initial status to ${connectionId}:`, error);
    }
    // Elevenlabs API Proxy
    const client = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY });
  
    // Handle incoming messages
    ws.on('message', async (rawMessage) => {
      try {
        //console.log(`[WebSocket] Message received from ${connectionId}: ${rawMessage.toString()}`);
        const data = JSON.parse(rawMessage.toString());
        // Verify Session ID
        if (data?.sessionId && connectionManager.getUserId(connectionId) === null) {
          const sessionData = await getSessionData(data.sessionId);
          if (sessionData?.data?.PHP_AUTH_USER) {
            //console.log(`[WebSocket] Session ID verified for ${data.sessionId}`);
            // Update connection manager with session data
            connectionManager.updateUserId(connectionId, sessionData.data?.PHP_AUTH_USER);
          } 
        }
        // Session bekannt
        try {
          let response;
          const customParameters = connectionManager.getCustomParameters(connectionId);
          const userId = connectionManager.getUserId(connectionId);
          let compId = connectionManager.getCompId(connectionId);
          if (userId === 'admin') {
            compId = null;
          }
          
          // *** FRONTEND/BACKEND CONTROL COMMANDS ***
          switch (data.action) {
            case 'getAgent':
              console.log(`[WebSocket] ${data.action} request from ${userId} ${connectionId}`);
              response = await client.conversationalAi.getAgent(data.params);
              //response = await dbManager.getAgentById(data.params);
              // Sync agents with database
              try {
                //console.log(response);
                await saveAgentDb(response);
                //console.log(`[WebSocket] Successfully synced agent ${response.agent_id} with database`);
                response.remoteagent = await dbManager.getRemoteAgentById(data.params);
              } catch (saveError) {
                console.error(`[WebSocket] Error syncing agent ${data.params} with database:`, saveError);
              }
              connectionManager.sendStatus(connectionId, data.action, response, data.requestId);
              break;
            case 'createAgent':
              console.log(`[WebSocket] ${data.action} request from ${connectionId}`);
              if (data.language === "en" && data.model_id == "eleven_flash_v2_5") {
                data.model_id = "eleven_flash_v2";
              } else if (data.language === "en" && data.model_id == "eleven_turbo_v2_5") {
                data.model_id = "eleven_turbo_v2";
              } else if (data.language !== "en" && data.model_id == "eleven_flash_v2") {
                data.model_id = "eleven_flash_v2_5";
              } else if (data.language !== "en" && data.model_id == "eleven_turbo_v2") {
                data.model_id = "eleven_turbo_v2_5";
              }
              const conversation_config = {
                conversation_config: {
                  asr: {
                    user_input_audio_format: "pcm_8000"
                  },
                  tts: {
                    agent_output_audio_format: "pcm_8000",
                    optimize_streaming_latency: 3,
                    model_id: data.model_id,
                    voice_id: data.voice_id || "56AoDkrOh6qfVPDXZ7Pt"
                  },
                  agent: {
                    language: data.language || "en",
                    first_message: data.first_message || "Hello! How can I help you today?",
                    prompt: {
                      prompt: data.prompt || "You are a helpful AI assistant.",
                      llm: data.llm || "gpt-4o-mini",
                      tool_ids: ["AUV0T9X4hEINv7fkA1F0"]
                    }
                  },
                },
                platform_settings: {
                  overrides: {
                    conversation_config_override: {
                      agent: {
                        prompt: {
                          prompt: true
                        },
                        first_message: true,
                        language: true
                      },
                      tts: {
                        voice_id: true
                      }
                    }
                  }
                },
                name: data.agent_name || "New Agent"
              };
              response = await client.conversationalAi.createAgent(conversation_config);
              conversation_config.agent_id = response.agent_id;
              conversation_config.comp_id = compId;
              conversation_config.user_id = userId;
              // Sync agents with database
              try {
                await saveAgentDb(conversation_config, true);
                console.log(`[WebSocket] Successfully created agent ${conversation_config.agent_id} in database`);
              } catch (saveError) {
                console.error(`[WebSocket] Error syncing agent ${conversation_config.agent_id} with database:`, saveError);
              }
              connectionManager.sendStatus(connectionId, data.action, response, data.requestId);
              break;
            case 'listAgents':
              console.log(`[WebSocket] ${data.action} request from ${userId} ${connectionId}`);
              //response = await client.conversationalAi.getAgents();
              //const agents = compId ? response.agents.filter(agent => agent.name.startsWith(compId)) : response.agents;
              const agents = await dbManager.listAgents(compId, null);
              connectionManager.sendStatus(connectionId, data.action, { agents: agents.agents }, data.requestId);
              break;
            case 'updateAgent':
              console.log(`[WebSocket] ${data.action} request from ${connectionId}`);
              if (data.params.conversation_config.agent.language === "en" && data.params.conversation_config.tts.model_id == "eleven_flash_v2_5") {
                params.conversation_config.tts.model_id = "eleven_flash_v2";
              } else if (data.params.conversation_config.agent.language === "en" && data.params.conversation_config.tts.model_id == "eleven_turbo_v2_5") {
                params.conversation_config.tts.model_id = "eleven_turbo_v2";
              } else if (data.params.conversation_config.agent.language !== "en" && data.params.conversation_config.tts.model_id == "eleven_flash_v2") {
                params.conversation_config.tts.model_id = "eleven_flash_v2_5";
              } else if (data.params.conversation_config.agent.language !== "en" && data.params.conversation_config.tts.model_id == "eleven_turbo_v2") {
                params.conversation_config.tts.model_id = "eleven_turbo_v2_5";
              }
              response = await client.conversationalAi.updateAgent(data.params.agent_id, data.params);
              //console.log(response);
              try {
                await saveAgentDb(response);
                console.log(`[WebSocket] Successfully synced agent ${response.agent_id} with database`);
              } catch (saveError) {
                console.error(`[WebSocket] Error syncing agent ${response.agent_id} with database:`, saveError);
              }
              connectionManager.sendStatus(connectionId, data.action, "Agent updated", data.requestId);
              break;
            case 'listConversations':
              console.log(`[WebSocket] ${data.action} request from ${userId} ${connectionId}`);
              try {
                let compId = connectionManager.getCompId(connectionId);
                const responseConv = await dbManager.listConversations(null, { compId: compId, limit: 100 });
                //const responseConv = await client.conversationalAi.getConversations();
                connectionManager.sendStatus(connectionId, data.action, responseConv, data.requestId);
              } catch (error) {
                console.error(`[WebSocket] Database error in listConversations:`, error);
                connectionManager.sendStatus(connectionId, 'error', 
                  `Error retrieving conversations: ${error.message}`, 
                  data.requestId
                );
              }
              break;
            case 'getConversation':
              console.log(`[WebSocket] ${data.action} request from ${userId} ${connectionId}`);
              try {
              //const conversation = await client.conversationalAi.getConversation(data.conversation_id);
              const conversation = await dbManager.getConversation(data.conversation_id);
                connectionManager.sendStatus(connectionId, data.action, conversation, data.requestId);
              } catch (error) {
                console.error(`[WebSocket] Database error in getConversation:`, error);
                connectionManager.sendStatus(connectionId, 'error',
                  `Error retrieving conversation: ${error.message}`,
                  data.requestId
                );
              }
              break;
            case 'getConversationAudio':
              console.log(`[WebSocket] ${data.action} request from ${userId} ${connectionId}`);
              const url = `https://api.elevenlabs.io/v1/convai/conversations/${data.params}/audio`;
              const options = { method: 'GET', headers: { 'xi-api-key': ELEVENLABS_API_KEY } }; 
              response = await fetch(url, options); 
              const audioBlob = await response.blob(); 
              const audioBuffer = await audioBlob.arrayBuffer();
              const audioData = new Uint8Array(audioBuffer);
              const audioBase64 = Buffer.from(audioData).toString('base64');
              connectionManager.sendStatus(connectionId, data.action, audioBase64, data.requestId);
              break;
            case 'enableAgent':
                console.log(`[WebSocket] ${data.action} request from ${userId} ${connectionId}`);
                response = await dbManager.enableAgentById(data.params)
                connectionManager.sendStatus(connectionId, data.action, "Agent enabled", data.requestId);
                break;
            case 'disableAgent':
              console.log(`[WebSocket] ${data.action} request from ${userId} ${connectionId}`);
              response = await dbManager.disableAgentById(data.params)
              connectionManager.sendStatus(connectionId, data.action, "Agent disabled", data.requestId);
              break;
            case 'deleteAgent':
              console.log(`[WebSocket] ${data.action} request from ${userId} ${connectionId}`);
              response = await dbManager.disableAgentById(data.params)
              connectionManager.sendStatus(connectionId, data.action, "Agent disabled", data.requestId);
              break;              
            case 'listRemoteAgents':
              console.log(`[WebSocket] ${data.action} request from ${userId} ${connectionId}`);
              response = await dbManager.getActiveRemoteAgents(null, compId, true)
              response.maxAgents = 2; 
              connectionManager.sendStatus(connectionId, data.action, response, data.requestId);
              break;
            case 'getCampaigns':
              console.log(`[WebSocket] ${data.action} request from ${userId} ${connectionId}`);
              response = await dbManager.getCampaignsByUserPrefix(userId)
              connectionManager.sendStatus(connectionId, data.action, response, data.requestId);
              break;
  // assignAgents...
  /*!SECTION

INSERT INTO `osdial_users` (`user_id`, `user`, `pass`, `full_name`, `user_level`, `user_group`, `phone_login`, `phone_pass`, `delete_users`, `delete_user_groups`, `delete_lists`, `delete_campaigns`, `delete_ingroups`, `delete_remote_agents`, `load_leads`, `campaign_detail`, `ast_admin_access`, `ast_delete_phones`, `delete_scripts`, `modify_leads`, `hotkeys_active`, `change_agent_campaign`, `agent_choose_ingroups`, `closer_campaigns`, `scheduled_callbacks`, `agentonly_callbacks`, `agentcall_manual`, `osdial_recording`, `osdial_transfers`, `delete_filters`, `alter_agent_interface_options`, `closer_default_blended`, `delete_call_times`, `modify_call_times`, `modify_users`, `modify_campaigns`, `modify_lists`, `modify_scripts`, `modify_filters`, `modify_ingroups`, `modify_usergroups`, `modify_remoteagents`, `modify_servers`, `view_reports`, `osdial_recording_override`, `alter_custdata_override`, `manual_dial_new_limit`, `manual_dial_allow_skip`, `export_leads`, `admin_api_access`, `agent_api_access`, `xfer_agent2agent`, `script_override`, `load_dnc`, `export_dnc`, `delete_dnc`, `lead_search`) VALUES
(36921, 'va196001', 'ViRtUaLaGeNt', 'Virtual Agent', 7, 'VIRTUAL', NULL, NULL, '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '1', '0', '1', '', '1', '1', '1', '1', '1', '0', '0', '1', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', 'DISABLED', 'ALLOW_ALTER', -1, '1', '0', '0', '0', '0', '', '0', '0', '0', '0');

INSERT INTO `osdial`.`osdial_remote_agents` (`remote_agent_id` ,`user_start` ,`number_of_lines` ,`server_ip` ,`conf_exten` ,`status` ,`campaign_id` ,`closer_campaigns` ,`audio_host` ,`audio_port` ,`agent_id`)
VALUES ( NULL , 'va196001', '1', '168.119.38.103', '87196001', 'ACTIVE', '196AITEST1', '', 'dev.dial24.net', '15081', 'sPboZBYACpuuAe18w6ZR');


  */

/*
            case 'showChannels':
              //console.log(`[WebSocket] ${data.action} request from ${connectionId}`);
              response = await asteriskService.getChannels();
              connectionManager.sendStatus(connectionId, data.action, response, data.requestId);
              break;
            case 'hangup':
              console.log(`[WebSocket] ${data.action} request from ${connectionId}`);
              response = asteriskService.hangupCall(data.channel);
              connectionManager.sendStatus(connectionId, data.action, response, data.requestId);
              break;
*/
              case 'ping':
              //console.log(`[WebSocket] Ping received from ${connectionId}, sending pong`);
              connectionManager.sendStatus(connectionId, 'pong', 'Connection alive', data.requestId);
              break;
            case 'start_call':
              connectionManager.setCustomParameters(connectionId, data);
              try {
                const channelNumber = data.channel.startsWith('+') ? data.channel.slice(1) : data.channel;
                data.called_number = channelNumber;
                data.callerid = '4921612963110';
                const channel = `SIP/${channelNumber}@45656`;
                //const channel = `SIP/994${channelNumber}@voip3_994`;
                const port = portManager.createCallServer(
                  connectionId, 
                  data, 
                  setupElevenLabs,  // Pass the existing setup function
                  (socket) => new StreamService(socket) // Factory to create StreamService instances
                );
                asteriskService.originateCall(channel, connectionId, port)
                  .then((response) => {
                    if (response.message == "Originate successfully queued") {
                      connectionManager.sendStatus(connectionId, 'start_call', "Call started successfully", data.requestId);
                    }
                  })
                  .catch((error) => {
                    // Clean up the server if call fails
                    portManager.closeCallServer(connectionId);
                    connectionManager.sendStatus(connectionId, 'error', `Error: ${error.message}`, data.requestId);
                  });
              } catch (error) {
                console.error(`[WebSocket] Error starting call: ${error.message}`);
                connectionManager.sendStatus(connectionId, 'error', `Failed to start call: ${error.message}`, data.requestId);
              }
              break;
            default:
              //console.error(`Unknown action: ${data.action}`);
          }
        } catch (error) {
          console.error(`[WebSocket] API Error in ${data.action} for ${connectionId}:`, error);
          connectionManager.sendStatus(connectionId, 'error', `Error: ${error}`, data?.requestId || null);
        }
      } catch (error) {
        console.error(`[WebSocket] Error parsing message: ${error}`);
        connectionManager.sendStatus(connectionId, 'error', 'Error in message', null);
      }
    });

    
    // Handle connection close
    ws.on('close', (code, reason) => {
        console.log(`[WebSocket] Connection closed: ${connectionId}, Code: ${code}, Reason: ${reason} || 'No reason provided'}`);
        connectionManager.closeConnection(connectionId);
    });
    
    // Handle connection errors
    ws.on('error', (error) => {
        console.error(`[WebSocket] Connection error for ${connectionId}:`, error);
        connectionManager.closeConnection(connectionId);
    });
    
    // Set up ping interval to keep connection alive
    const pingInterval = setInterval(() => {
        try {
            // Get fresh reference to the websocket to ensure accurate state
            const connection = connectionManager.connections.get(connectionId);
            if (!connection || !connection.ws) {
                console.log(`[WebSocket] Connection ${connectionId} no longer exists, clearing keep-alive interval`);
                clearInterval(pingInterval);
                return;
            }
            
            if (connection.ws.readyState === WebSocket.OPEN) {
                connection.ws.send(JSON.stringify({ type: 'ping' }));
                //console.log(`[WebSocket] Keep-alive message sent to ${connectionId}`);
                // Update last activity time
                if (connectionManager.updateActivity) {
                    connectionManager.updateActivity(connectionId);
                }
            } else {
                console.log(`[WebSocket] Connection ${connectionId} no longer open (state: ${connection.ws.readyState}), clearing keep-alive interval`);
                clearInterval(pingInterval);
                
                // If connection not properly closed, ensure it's cleaned up
                if (!connection.state?.isClosing) {
                    connectionManager.closeConnection(connectionId);
                }
            }
        } catch (error) {
            console.error(`[WebSocket] Error sending keep-alive to ${connectionId}:`, error);
            clearInterval(pingInterval);
            
            // Attempt to clean up the connection in case of error
            try {
                connectionManager.closeConnection(connectionId);
            } catch (closeError) {
                console.error(`[WebSocket] Error cleaning up connection after ping error:`, closeError);
            }
        }
    }, 30000);
    
    // Clear interval when connection closes
    ws.on('close', () => {
        clearInterval(pingInterval);
    });
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down servers...');
  
  // Clear remote agents check interval
  if (checkRemoteAgentsInterval) {
    clearInterval(checkRemoteAgentsInterval);
  }
  
  // Close all dynamic call servers
  portManager.closeAllServers();
  
  // Close all active connections
  connectionManager.getActiveConnectionIds().forEach(connectionId => {
    connectionManager.closeConnection(connectionId);
  });
  
  // Restore original console methods
  consoleLogger.restore();

  // Attempt to close servers gracefully
  Promise.all([
    wss.close(),
    console.log('[WebSocket API] Server closed'),
  ])
  .then(() => {
    console.log('All servers closed successfully');
    shutdownComplete = true;
    process.exit(0);
  })
  .catch(error => {
    console.error('Error closing servers:', error);
    shutdownComplete = true;
    process.exit(1);
  });
  
  // Force exit after 5 seconds if shutdown gets stuck
  setTimeout(() => {
    if (!shutdownComplete) {
      console.log('Forcing server shutdown after timeout');
      process.exit(1);
    }
  }, 5000);
});

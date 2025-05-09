require('dotenv').config();
const crypto = require('crypto');
const bodyParser = require('body-parser');
const express = require('express');
const app = express();
const port = 3000;
const DatabaseManager = require('./DatabaseManager.cjs');
const db = new DatabaseManager();
const { pool } = require('./MySQL.cjs');
 
// Environment variables
const { ELEVENLABS_API_KEY, ELEVENLABS_POST_SECRET } = process.env;

if (!ELEVENLABS_API_KEY || !ELEVENLABS_POST_SECRET) {
  throw new Error('Missing environment variables');
}

function validatePostCallData(data) {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid data format');
  }

  const required = {
    'type': (v) => v === 'post_call_transcription',
    'event_timestamp': (v) => typeof v === 'number',
    'data.agent_id': (v) => typeof v === 'string' && v.length > 0,
    'data.conversation_id': (v) => typeof v === 'string' && v.length > 0,
    'data.status': (v) => ['done', 'in_progress', 'failed'].includes(v),
    'data.transcript': (v) => Array.isArray(v),
    'data.metadata': (v) => typeof v === 'object',
    'data.analysis': (v) => typeof v === 'object'
  };

  for (const [path, validator] of Object.entries(required)) {
    const value = path.split('.').reduce((obj, key) => obj?.[key], data);
    if (!validator(value)) {
      throw new Error(`Invalid or missing field: ${path}`);
    }
  }

  // Validate transcript entries
  data.data.transcript.forEach((turn, index) => {
    if (!turn.role || !['agent', 'user'].includes(turn.role)) {
      throw new Error(`Invalid role in transcript turn ${index}`);
    }
/*
    if (typeof turn.message !== 'string') {
      throw new Error(`Invalid message in transcript turn ${index}`);
    }
*/
    if (turn.time_in_call_secs !== undefined && typeof turn.time_in_call_secs !== 'number') {
      throw new Error(`Invalid time_in_call_secs in transcript turn ${index}`);
    }
  });

  return true;
}

function sanitizeValue(value) {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  if (typeof value === 'string') {
    return value.slice(0, 65535); // Protect against oversized strings
  }
  return value;
}





// Custom middleware for raw body and JSON parsing
app.use(express.json({
  verify: (req, res, buf, encoding) => {
    // Store raw body buffer for signature verification
    req.rawBody = buf.toString();
  }
}));

// Error handler for JSON parsing
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    console.error('Invalid JSON:', err);
    return res.status(400).send('Invalid JSON payload');
  }
  next(err);
});

async function storeConversationData(data) {
  try {
    // Start transaction
    const connection = await pool.getConnection();
    await connection.beginTransaction();
    const conversationId = data.data.conversation_id;

    try {
      // 1. Store main conversation data
      const conversationData = {
        conversation_id: conversationId,
        agent_id: data.data.agent_id,
        lead_id: sanitizeValue(data.data.conversation_initiation_client_data.dynamic_variables.lead_id),
        uniqueid: sanitizeValue(data.data.conversation_initiation_client_data.dynamic_variables.uniqueid),
        campaign_id: sanitizeValue(data.data.conversation_initiation_client_data.dynamic_variables.campaign_id),
        start_time_unix_secs: data.data.metadata.start_time_unix_secs,
        call_duration_secs: data.data.metadata.call_duration_secs,
        status: data.data.status,
        termination_reason: sanitizeValue(data.data.metadata.termination_reason),
        cost: data.data.metadata.cost,
        call_successful: sanitizeValue(data.data.analysis.call_successful),
        transcript_summary: sanitizeValue(data.data.analysis.transcript_summary),
        metadata: sanitizeValue(data.data.metadata),
        analysis: JSON.stringify(data.data.analysis),
        client_data: sanitizeValue(data.data.conversation_initiation_client_data.dynamic_variables)
      };

      console.log('Storing conversation data:', data.data.conversation_id);
      await db.executeQuery(
        `REPLACE INTO elevenlabs_conversations SET ?`,
        [conversationData]
      );

      // 2. Store conversation turns
      console.log('Storing conversation turns...');
      for (let i = 0; i < data.data.transcript.length; i++) {
        const turn = data.data.transcript[i];
        const turnData = {
          conversation_id: conversationId,
          turn_index: i,
          role: turn.role,
          message: sanitizeValue(turn.message),
          time_in_call_secs: turn.time_in_call_secs,
          feedback: sanitizeValue(turn.feedback),
          llm_override: sanitizeValue(turn.llm_override)
        };

        const result = await db.addConversationTurn(turnData);
        console.log(`Stored turn ${i + 1}/${data.data.transcript.length}`);

        // Store turn metrics if present
        if (turn.conversation_turn_metrics?.metrics) {
          console.log('Processing metrics:', turn.conversation_turn_metrics.metrics);
          const flatMetrics = {};
          // Extract elapsed_time values from the nested structure
          for (const [key, value] of Object.entries(turn.conversation_turn_metrics.metrics)) {
            if (!value || typeof value.elapsed_time !== 'number') {
              continue;
            }
            flatMetrics[key] = value.elapsed_time;
          }
          await db.updateTurnMetrics(result, flatMetrics);
          console.log(`Stored metrics for turn ${i + 1}`);
        }
      }

      // 3. Store collected data
      console.log('Storing collected data...');
      for (const [id, collectedData] of Object.entries(data.data.analysis.data_collection_results || {})) {
        await db.executeQuery(
          `INSERT INTO elevenlabs_collected_data
          (conversation_id, data_collection_id, value, json_schema, rationale)
          VALUES (?, ?, ?, ?, ?)`,
          [conversationId, id, sanitizeValue(collectedData.value), sanitizeValue(collectedData.json_schema), sanitizeValue(collectedData.rationale)]
        );
      }

      // 4. Store evaluation results
      console.log('Storing evaluation results...');
      for (const [id, evalData] of Object.entries(data.data.analysis.evaluation_criteria_results || {})) {
        await db.addEvaluation({ 
          conversation_id: conversationId,
          criteria_id: sanitizeValue(id),
          result: sanitizeValue(evalData.result),
          rationale: sanitizeValue(evalData.rationale)
        });
      }

      // 5. Store retention settings
      console.log('Storing retention settings...');
      if (data.data.metadata.deletion_settings) {
        const deletionSettings = data.data.metadata.deletion_settings;
        await db.executeQuery(
          `REPLACE INTO elevenlabs_retention_settings SET
           conversation_id = ?,
           deletion_time_unix_secs = ?,
           deleted_logs_at_time_unix_secs = ?,
           deleted_audio_at_time_unix_secs = ?,
           deleted_transcript_at_time_unix_secs = ?,
           delete_transcript_and_pii = ?,
           delete_audio = ?`,
          [conversationId, deletionSettings.deletion_time_unix_secs, deletionSettings.deleted_logs_at_time_unix_secs, deletionSettings.deleted_audio_at_time_unix_secs, deletionSettings.deleted_transcript_at_time_unix_secs, deletionSettings.delete_transcript_and_pii ? 1 : 0, deletionSettings.delete_audio ? 1 : 0]
        );
      }

      // 6. Store Dialer data
      console.log('Storing dialing result...');
      switch (sanitizeValue(data.data.analysis.call_successful)) {
        case "success" : {
          await db.executeQuery(
            `UPDATE osdial_list 
              SET status='SALE' 
              WHERE lead_id = ? LIMIT 1`,
            [sanitizeValue(data.data.conversation_initiation_client_data.dynamic_variables.lead_id)]
          );
          await db.executeQuery(
            `UPDATE osdial_agent_log
              SET status='SALE' 
              WHERE uniqueid = ? LIMIT 1`,
            [sanitizeValue(data.data.conversation_initiation_client_data.dynamic_variables.uniqueid)]
          );
          await db.executeQuery(
            `UPDATE osdial_log
              SET status='SALE' 
              WHERE uniqueid = ? LIMIT 1`,
            [sanitizeValue(data.data.conversation_initiation_client_data.dynamic_variables.uniqueid)]
          );
        }
        default : {
          await db.executeQuery(
            `UPDATE osdial_list 
              SET status='NI' 
              WHERE lead_id = ? LIMIT 1`,
            [sanitizeValue(data.data.conversation_initiation_client_data.dynamic_variables.lead_id)]
          );
          await db.executeQuery(
            `UPDATE osdial_agent_log
              SET status='NI' 
              WHERE uniqueid = ? LIMIT 1`,
            [sanitizeValue(data.data.conversation_initiation_client_data.dynamic_variables.uniqueid)]
          );
          await db.executeQuery(
            `UPDATE osdial_log
              SET status='NI' 
              WHERE uniqueid = ? LIMIT 1`,
            [sanitizeValue(data.data.conversation_initiation_client_data.dynamic_variables.uniqueid)]
          );
        }
      }


      // Commit transaction
      await connection.commit();
      console.log('All data stored successfully');
    } catch (error) {
      // Rollback transaction on error
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Error storing conversation data:', error);
    throw error;
  }
}

// Webhook handler
app.post('/webhook/postcall', async (req, res) => {
  console.log('Received webhook request');
  console.log('Headers:', JSON.stringify(req.headers, null, 2));

  const signatureHeader = req.headers['elevenlabs-signature'];
  
  if (!signatureHeader) {
    console.error('Missing ElevenLabs-Signature header');
    res.status(401).send('Missing signature header');
    return;
  }

  console.log('Signature header:', signatureHeader);
  const headers = signatureHeader.split(',');
  const timestampHeader = headers.find((e) => e.startsWith('t='));
  const signatureComponent = headers.find((e) => e.startsWith('v0='));

  if (!signatureComponent) {
    console.error('Missing v0= signature component');
    res.status(401).send('Invalid signature format');
    return;
  }

  if (!timestampHeader) {
    console.error('Missing timestamp in signature header');
    res.status(401).send('Invalid signature format');
    return;
  }

  const timestamp = timestampHeader.substring(2);
  
  // Validate timestamp
  const reqTimestamp = timestamp * 1000;
  const tolerance = Date.now() - 30 * 60 * 1000;

  if (reqTimestamp < tolerance) {
    console.error('Request expired. Timestamp:', new Date(reqTimestamp).toISOString());
    res.status(403).send('Request expired');
    return;
  }

  try {
    // Normalize JSON to ensure consistent string representation
    const normalizedBody = JSON.stringify(JSON.parse(req.rawBody));
    
    // Debug signature verification
    console.log('Verification details:');
    console.log('- Timestamp:', timestamp);
    //console.log('- Normalized body:', normalizedBody);
    console.log('- Secret key length:', ELEVENLABS_POST_SECRET?.length || 'undefined');
    
    // Calculate signature
    const signingMessage = `${timestamp}.${normalizedBody}`;
    const expectedSignature = 'v0=' + crypto.createHmac('sha256', ELEVENLABS_POST_SECRET).update(signingMessage).digest('hex');
    
    //console.log('Signature comparison:');
    //console.log('- Message used for signing:', signingMessage);
    //console.log('- Expected signature:', expectedSignature);
    //console.log('- Received signature:', signatureComponent);
    console.log('- Raw body:', req.rawBody);
/*
    if (signatureComponent !== expectedSignature) {
      console.error('Signature verification failed');
      res.status(401).send('Request unauthorized');
      return;
    }
*/
    // Validation passed, store the data
    const data = req.body;
    /* const data = '{"type": "post_call_transcription", "event_timestamp": 1743088235, "data": {"agent_id": "hTwP6TgapJKas2oJxX6d", "conversation_id": "3ySOh4E978gWEfMy7jqo", "status": "done", "transcript": [{"role": "agent", "message": "Guten Tag, mein Name ist Lisa von SpeedNetwork", "tool_calls": [], "tool_results": [], "feedback": null, "llm_override": null, "time_in_call_secs": 0, "conversation_turn_metrics": null, "rag_retrieval_info": null}, {"role": "user", "message": "Hallo, ist das Aschada?", "tool_calls": [], "tool_results": [], "feedback": null, "llm_override": null, "time_in_call_secs": 2, "conversation_turn_metrics": null, "rag_retrieval_info": null}, {"role": "agent", "message": "\u00c4hm, das ist nicht Aschada. Sie sprechen mit Lisa von SpeedNetwork. Wie kann ich Ihnen helfen?", "tool_calls": [], "tool_results": [], "feedback": null, "llm_override": null, "time_in_call_secs": 5, "conversation_turn_metrics": {"metrics": {"convai_llm_service_ttf_sentence": {"elapsed_time": 0.5183883779682219}, "convai_llm_service_ttfb": {"elapsed_time": 0.3835314509924501}}}, "rag_retrieval_info": null}, {"role": "user", "message": "Kann ich bitte Sascha eine Nachricht hinterlassen?", "tool_calls": [], "tool_results": [], "feedback": null, "llm_override": null, "time_in_call_secs": 10, "conversation_turn_metrics": null, "rag_retrieval_info": null}, {"role": "agent", "message": "Ja, nat\u00fcrlich. Aber ich muss zuerst Ihren Namen oder den Namen Ihrer Firma wissen. Was m\u00f6chten Sie ihm...", "tool_calls": [], "tool_results": [], "feedback": null, "llm_override": null, "time_in_call_secs": 13, "conversation_turn_metrics": {"metrics": {"convai_llm_service_ttf_sentence": {"elapsed_time": 0.3976317640626803}, "convai_llm_service_ttfb": {"elapsed_time": 0.3435847240034491}}}, "rag_retrieval_info": null}, {"role": "user", "message": "Bin Mike.", "tool_calls": [], "tool_results": [], "feedback": null, "llm_override": null, "time_in_call_secs": 19, "conversation_turn_metrics": null, "rag_retrieval_info": null}, {"role": "agent", "message": "Danke, Mike...", "tool_calls": [], "tool_results": [], "feedback": null, "llm_override": null, "time_in_call_secs": 21, "conversation_turn_metrics": {"metrics": {"convai_llm_service_ttf_sentence": {"elapsed_time": 0.5254602909553796}, "convai_llm_service_ttfb": {"elapsed_time": 0.4858067020541057}}}, "rag_retrieval_info": null}, {"role": "user", "message": "Ich bin Mike und ich m\u00f6chte ihm als Nachricht hinterlassen, dass er nach Hause gehen kann. Das war\'s.", "tool_calls": [], "tool_results": [], "feedback": null, "llm_override": null, "time_in_call_secs": 21, "conversation_turn_metrics": null, "rag_retrieval_info": null}, {"role": "agent", "message": "Vielen Dank, Mike. Ich habe Ihre Nachricht notiert, dass Herr...", "tool_calls": [], "tool_results": [], "feedback": null, "llm_override": null, "time_in_call_secs": 30, "conversation_turn_metrics": {"metrics": {"convai_llm_service_ttf_sentence": {"elapsed_time": 0.8692940580658615}, "convai_llm_service_ttfb": {"elapsed_time": 0.8324175719171762}}}, "rag_retrieval_info": null}, {"role": "user", "message": "Danke, tsch\u00fcss.", "tool_calls": [], "tool_results": [], "feedback": null, "llm_override": null, "time_in_call_secs": 31, "conversation_turn_metrics": null, "rag_retrieval_info": null}, {"role": "agent", "message": "Gern geschehen, Mike. Kann ich Ihnen noch mit etwas anderem helfen?...", "tool_calls": [], "tool_results": [], "feedback": null, "llm_override": null, "time_in_call_secs": 33, "conversation_turn_metrics": {"metrics": {"convai_llm_service_ttf_sentence": {"elapsed_time": 0.41048910201061517}, "convai_llm_service_ttfb": {"elapsed_time": 0.3606061489554122}}}, "rag_retrieval_info": null}], "metadata": {"start_time_unix_secs": 1743088193, "call_duration_secs": 37, "cost": 248, "deletion_settings": {"deletion_time_unix_secs": 1806160230, "deleted_logs_at_time_unix_secs": null, "deleted_audio_at_time_unix_secs": null, "deleted_transcript_at_time_unix_secs": null, "delete_transcript_and_pii": true, "delete_audio": true}, "feedback": {"overall_score": null, "likes": 0, "dislikes": 0}, "authorization_method": "signed_url", "charging": {"dev_discount": false}, "phone_call": null, "termination_reason": ""}, "analysis": {"evaluation_criteria_results": {"nachricht_hinterlassen": {"criteria_id": "nachricht_hinterlassen", "result": "success", "rationale": "The user explicitly requested to leave a message for Sascha, which the agent acknowledged and took down. The conversation confirms the user\'s request was fulfilled."}}, "data_collection_results": {"message": {"data_collection_id": "message", "value": "Ich bin Mike und ich m\u00f6chte ihm als Nachricht hinterlassen, dass er nach Hause gehen kann. Das war\'s.", "json_schema": {"type": "string", "description": "Nachricht welche vom Anrufer hinterlassen wurde", "dynamic_variable": "", "constant_value": ""}, "rationale": "Der Anrufer Mike hinterl\u00e4sst die Nachricht, dass Sascha nach Hause gehen kann."}, "Name/Firma": {"data_collection_id": "Name/Firma", "value": "Mike", "json_schema": {"type": "string", "description": "Der Name und die Firma des Anrufers", "dynamic_variable": "", "constant_value": ""}, "rationale": "Der Anrufer identifiziert sich als Mike."}, "R\u00fcckrufnummer": {"data_collection_id": "R\u00fcckrufnummer", "value": "None", "json_schema": {"type": "string", "description": "Die Telefon unter welcher zur\u00fcckgerufen werden soll", "dynamic_variable": "", "constant_value": ""}, "rationale": "The conversation does not contain a phone number to call back. The user only leaves a message for Sascha."}}, "call_successful": "success", "transcript_summary": "Lisa from SpeedNetwork spoke with Mike, who wanted to leave a message for Sascha to go home. Lisa confirmed the message and offered further assistance, but Mike declined.\n"}, "conversation_initiation_client_data": {"conversation_config_override": {"agent": {"prompt": null, "first_message": null, "language": null}, "tts": null}, "custom_llm_extra_body": {}, "dynamic_variables": {"agent_id": "hTwP6TgapJKas2oJxX6d", "called_number": "493040607008", "callerid": "4921612963110", "last_name": "Mustermann", "system__agent_id": "hTwP6TgapJKas2oJxX6d", "system__conversation_id": "3ySOh4E978gWEfMy7jqo", "system__caller_id": null, "system__called_number": null, "system__call_duration_secs": 37, "system__time_utc": "2025-03-27T15:10:30.920459+00:00"}}}}'; */

    if (data.type !== 'post_call_transcription') {
      console.error('Invalid webhook type:', data.type);
      res.status(400).send('Invalid webhook type');
      return;
    }

    try {
      // Validate the incoming data
      validatePostCallData(data);
    } catch (error) {
      console.error('Data validation failed:', error.message);
      res.status(400).send(`Invalid data format: ${error.message}`);
      return;
    }

    await storeConversationData(data);
    console.log('Successfully stored conversation data for ID:', data.data.conversation_id);

    // Respond with success
    res.status(200).send();
    
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(400).send('Invalid request');
    return;
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}: http://localhost:${PORT}`);
});

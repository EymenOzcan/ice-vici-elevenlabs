const { pool } = require('./MySQL.cjs');

/**
 * Database manager class for handling all database operations in the ElevenAPI system.
 * Provides methods for querying and managing agents, conversations, evaluations, and remote agent management.
 * 
 * This class encapsulates all SQL operations and provides a clean interface for:
 * - Agent management (CRUD operations, fetching, formatting)
 * - Conversation handling (creation, updating, retrieving transcripts)
 * - Turn management (adding conversation turns, metrics)
 * - Evaluation handling
 * - Remote agent management (enabling/disabling, status checking)
 * - Campaign operations
 * - Lead and call data retrieval
 * 
 * The class includes error handling and JSON parsing safety mechanisms to ensure
 * robust database interactions even when dealing with malformed data.
 * 
 * @class
 * @requires pool A database connection pool (injected)
 */
class DatabaseManager {
    /**
     * Execute a database query with error handling
     * @param {string} query SQL query
     * @param {Array} params Query parameters
     * @returns {Promise<Array>} Query results
     */
    async executeQuery(query, params = []) {
        try {
            const [rows] = await pool.query(query, params);
            return rows;
        } catch (error) {
            console.error('[DatabaseManager] Query error:', error);
            throw error;
        }
    }

    // Agent Management Methods

    /**
     * Get all active agents
     * @returns {Promise<Array>} Array of active agents
     */
    async getExistingAgents() {
        return this.executeQuery(
            'SELECT * FROM elevenlabs_agents '
        ).then(results => 
            results.map(agent => this.convertToApiFormat(agent)));
    }

    /**
     * Convert database entry to list format
     * @param {Object} dbEntry Database entry
     * @returns {Object} Formatted agent list object
     */
    convertToListFormat(dbEntry) {
        return {
            agent_id: dbEntry.agent_id,
            name: dbEntry.name,
            created_at_unix_secs: dbEntry.created_at_unix_secs,
            access_info: {
                is_creator: true,
                creator_name: dbEntry.user_id || "Unknown",
                creator_email: dbEntry.email || "unknown@example.com",
                role: "admin"
            }
        };
    }

    /**
     * List all agents with basic information
     * @param {string} compId Optional company ID to filter agents
     * @returns {Promise<Object>} Object containing array of agents
     */
    async listAgents(compId = null, userId = null) {
        let query = `
            SELECT a.*, ad.user_id, ad.comp_id 
            FROM elevenlabs_agents a 
            LEFT JOIN elevenlabs_agents_dialer ad ON a.agent_id = ad.agent_id 
            WHERE a.active='Y' AND a.agent_id IS NOT NULL
        `;
        if (compId) {
            query += ' AND ad.comp_id = ?';
        }
        else if (userId) {
            query += ' AND ad.user_id = ?';
        }

        query += ' ORDER BY a.modified_at DESC';
        const results = await this.executeQuery(query, 
            compId ? [compId] : userId ? [userId] : []
        );
        return {
            agents: results.map(agent => this.convertToListFormat(agent))
        };
    }

    /**
     * Get agent by ID
     * @param {string} agentId 
     * @returns {Promise<Object|null>} Agent data or null if not found
     */
    async getAgentById(agentId) {
        const results = await this.executeQuery(
            'SELECT * FROM elevenlabs_agents WHERE agent_id = ? ',
            [agentId]
        );
        const agent = results[0];
        return agent ? this.convertToApiFormat(agent) : null;
    }

    /**
     * Get agent by userId
     * @param {string} userId 
     * @returns {Promise<Object|null>} Agent data or null if not found
     */
    async getAgentByUserId(userId) {
        const results = await this.executeQuery(
            `SELECT * FROM elevenlabs_agents a 
              LEFT JOIN elevenlabs_agents_dialer ad 
               ON a.agent_id = ad.agent_id 
             WHERE ad.user_id = ? 
             `,
            [userId]
        );
        const agent = results[0];
        return agent ? this.convertToApiFormat(agent) : null;
    }

    /**
     * Convert database entry to ElevenLabs API format
     * @param {Object} dbEntry Database entry
     * @returns {Object} Formatted agent object
     */
    convertToApiFormat(dbEntry) {
        const tts_config = JSON.parse(dbEntry.tts_config || '{}');
        const asr_config = JSON.parse(dbEntry.asr_config || '{}');
        const conversation_config = JSON.parse(dbEntry.conversation_config || '{}');
        const prompt_config = JSON.parse(dbEntry.prompt_config || '{}');
        const language_presets = JSON.parse(dbEntry.language_presets || '{}');
        const dynamic_variables = JSON.parse(dbEntry.dynamic_variables || '{}');
        const evaluation_criteria = JSON.parse(dbEntry.evaluation_criteria || '[]');
        const data_collection_config = JSON.parse(dbEntry.data_collection_config || '{}');
        const override_config = JSON.parse(dbEntry.override_config || '{}');
        const call_limits = JSON.parse(dbEntry.call_limits || '{}');
        const privacy_settings = JSON.parse(dbEntry.privacy_settings || '{}');
        const safety_settings = JSON.parse(dbEntry.safety_settings || '{}');
        const auth_config = JSON.parse(dbEntry.auth_config || '{}');

        return {
            agent_id: dbEntry.agent_id,
            name: dbEntry.name,
            conversation_config: {
                asr: asr_config,
                turn: {
                    turn_timeout: dbEntry.turn_timeout,
                    mode: dbEntry.turn_mode
                },
                tts: {
                    ...tts_config,
                    model_id: dbEntry.model_id,
                    voice_id: dbEntry.voice_id
                },
                conversation: {
                    max_duration_seconds: dbEntry.max_duration_seconds,
                    ...conversation_config
                },
                language_presets: language_presets,
                agent: {
                    first_message: dbEntry.first_message,
                    language: dbEntry.language,
                    dynamic_variables: dynamic_variables,
                    prompt: {
                        ...prompt_config,
                        prompt: dbEntry.prompt,
                        llm: dbEntry.llm_model,
                        temperature: dbEntry.llm_temperature
                    }
                }
            },
            metadata: {
                created_at_unix_secs: dbEntry.created_at_unix_secs
            },
            platform_settings: {
                auth: auth_config,
                evaluation: { criteria: evaluation_criteria },
                data_collection: data_collection_config,
                overrides: override_config,
                call_limits: call_limits,
                privacy: privacy_settings,
                safety: safety_settings
            },
            phone_numbers: []
        };
    }
    
    /**
     * Get agent by compId
     * @param {string} compId 
     * @returns {Promise<Object|null>} Agent data or null if not found
     */
    async getAgentByCompId(compId) {
        const results = await this.executeQuery(
            `SELECT * FROM elevenlabs_agents a 
              LEFT JOIN elevenlabs_agents_dialer ad 
               ON a.agent_id = ad.agent_id 
             WHERE ad.comp_id = ? 
             `,
            [compId]
        );
        const agent = results[0];
        return agent ? this.convertToApiFormat(agent) : null;
    }

    /**
     * Create an agent in our DB
     * @param {Object} agentData Agent configuration data
     * @returns {Promise<string>} Agent ID
     */
    async createAgentDb(agentData) {

        // Create new agent
        if (!agentData.agent_id) {
            throw new Error('Missing agent_id');
        }
        if (!agentData.name) {  
            throw new Error('Missing agent name');
        }
        const query1 = `
            INSERT INTO elevenlabs_agents SET
            agent_id = ?,
            name = ?,
            raw_configuration = ?,
            active = "Y",
            created_at_unix_secs = UNIX_TIMESTAMP()
        `;
        await this.executeQuery(query1, [
            agentData.agent_id,
            agentData.name,
            JSON.stringify(agentData.raw_configuration || {})
        ]);

        // Create new agent dialer entry
        if (!agentData.comp_id) {
            throw new Error('Missing company ID');
        }
        if (!agentData.user_id) {
            throw new Error('Missing user ID');
        }        
        const query2 = `
            INSERT INTO elevenlabs_agents_dialer SET
            agent_id = ?,
            comp_id = ?,
            user_id = ?
        `;
        await this.executeQuery(query2, [
            agentData.agent_id,
            agentData.comp_id,
            agentData.user_id
        ]);

        // Send to updateAgentDb to set all other fields
        return this.updateAgentDb(agentData, false);
    }
      
    /**
     * Create or update an agent
     * @param {Object} agentData Agent configuration data
     * @returns {Promise<string>} Agent ID
     */
    async updateAgentDb(agentData, isNew = false) {
        if (isNew) {
            return this.createAgentDb(agentData);
        }
        if (!agentData.agent_id) {
            throw new Error('Missing agent_id');
        }
        if (!agentData.name) {
            throw new Error('Missing agent name');
        }

        // Update existing agent        
        const query = `
            UPDATE elevenlabs_agents SET
            name = ?,
            first_message = ?,
            prompt = ?,
            language = ?,
            voice_id = ?,
            model_id = ?,
            llm_model = ?,
            llm_temperature = ?,
            turn_timeout = ?,
            turn_mode = ?,
            max_duration_seconds = ?,
            asr_config = ?,
            tts_config = ?,
            conversation_config = ?,
            prompt_config = ?,
            language_presets = ?,
            dynamic_variables = ?,
            auth_config = ?,
            evaluation_criteria = ?,
            data_collection_config = ?,
            override_config = ?,
            call_limits = ?,
            privacy_settings = ?,
            safety_settings = ?,
            raw_configuration = ?
            WHERE agent_id = ?
        `;
        await this.executeQuery(query, [
            agentData.name,
            agentData.first_message,
            agentData.prompt,
            agentData.language || 'en',
            agentData.voice_id,
            agentData.model_id,
            agentData.llm_model,
            agentData.llm_temperature || 0.8,
            agentData.turn_timeout || 11,
            agentData.turn_mode || 'turn',
            agentData.max_duration_seconds || 600,
            JSON.stringify(agentData.asr_config || {}),
            JSON.stringify(agentData.tts_config || {}),
            JSON.stringify(agentData.conversation_config || {}),
            JSON.stringify(agentData.prompt_config || {}),
            JSON.stringify(agentData.language_presets || {}),
            JSON.stringify(agentData.dynamic_variables || {}),
            JSON.stringify(agentData.auth_config || {}),
            JSON.stringify(agentData.evaluation_criteria || {}),
            JSON.stringify(agentData.data_collection_config || {}),
            JSON.stringify(agentData.override_config || {}),
            JSON.stringify(agentData.call_limits || {}),
            JSON.stringify(agentData.privacy_settings || {}),
            JSON.stringify(agentData.safety_settings || {}),
            JSON.stringify(agentData.raw_configuration || {}),
            agentData.agent_id
        ]);

        return agentData.agent_id;
    }

    // Conversation Management Methods

    /**
     * Format conversation data for API response
     * @param {Object} conv Database conversation entry
     * @returns {Object} Formatted conversation object
     * @private
     */
    formatConversation(conv) {
        return {
            agent_id: conv.agent_id,
            agent_name: conv.agent_name,
            conversation_id: conv.conversation_id,
            start_time_unix_secs: conv.start_time_unix_secs,
            call_duration_secs: conv.call_duration_secs,
            message_count: conv.turns_count || 0,
            status: conv.status,
            call_successful: conv.call_successful
        };
    }

    /**
     * List conversations for an agent
     * @param {string} agentId 
     * @param {Object} options Filtering options
     * @returns {Promise<Array>} Array of conversations
     */
    async listConversations(agentId, options = {}) {
        if (options.compId) {
            return this.listConversationsByCompanyId(options.compId, options.limit);
        } else {
            const query = `
                SELECT c.*, a.name as agent_name,
                       (SELECT COUNT(*) FROM elevenlabs_conversation_turns t 
                        WHERE t.conversation_id = c.conversation_id) as turns_count
                FROM elevenlabs_conversations c
                JOIN elevenlabs_agents a ON c.agent_id = a.agent_id
                WHERE c.agent_id = ?
                ORDER BY c.created_at DESC
                LIMIT ?`;
            const conversations = await this.executeQuery(query, [agentId, options.limit || 100]);
            return {
                conversations: conversations.map(conv => this.formatConversation(conv))
            };
        }
    }

    /**
     * List all conversations for a company
     * @param {string} compId Company ID to filter conversations
     * @param {number} limit Maximum number of conversations to return
     * @returns {Promise<Object>} Object containing array of formatted conversations
     */
    async listConversationsByCompanyId(compId, limit = 100) {
        const query = `
            SELECT c.*, a.name as agent_name, ad.comp_id,
                   (SELECT COUNT(*) FROM elevenlabs_conversation_turns t 
                    WHERE t.conversation_id = c.conversation_id) as turns_count
            FROM elevenlabs_conversations c
            JOIN elevenlabs_agents a ON c.agent_id = a.agent_id
            JOIN elevenlabs_agents_dialer ad ON a.agent_id = ad.agent_id
            WHERE ad.comp_id = ?
            ORDER BY c.created_at DESC
            LIMIT ?`;

        const conversations = await this.executeQuery(query, [compId, limit]);
        return {
            conversations: conversations.map(conv => this.formatConversation(conv))
        };
    }

    /**
     * Get conversation by ID
     * @param {string} conversationId 
     * @returns {Promise<Object|null>} Conversation data
     */
    async getConversation(conversationId) {
        // Get conversation with agent info and turns
        const query = `
            SELECT c.*, ad.comp_id
            FROM elevenlabs_conversations c
            JOIN elevenlabs_agents a ON c.agent_id = a.agent_id
            JOIN elevenlabs_agents_dialer ad ON a.agent_id = ad.agent_id
            WHERE c.conversation_id = ?
        `;

        const results = await this.executeQuery(query, [conversationId]);
        if (!results[0]) return null;

        // Get conversation turns with all related data
        const turnsQuery = `
            SELECT 
                t.turn_index, t.role, t.message, t.time_in_call_secs, t.feedback, t.llm_override,
                GROUP_CONCAT(DISTINCT tc.params_as_json ORDER BY tc.tool_call_id) as tool_calls,
                GROUP_CONCAT(DISTINCT tr.result_value ORDER BY tr.result_id) as tool_results,
                GROUP_CONCAT(DISTINCT 
                    CONCAT('{"metric_name":"', COALESCE(tm.metric_name, 'null'), 
                           '","elapsed_time":', COALESCE(tm.elapsed_time, 'null'), '}')
                ) as conversation_turn_metrics,
                GROUP_CONCAT(DISTINCT rr.content) as rag_retrieval_info
            FROM elevenlabs_conversation_turns t
            LEFT JOIN elevenlabs_tool_calls tc ON t.turn_id = tc.turn_id
            LEFT JOIN elevenlabs_tool_results tr ON t.turn_id = tr.turn_id
            LEFT JOIN elevenlabs_turn_metrics tm ON t.turn_id = tm.turn_id
            LEFT JOIN elevenlabs_rag_retrievals rr ON t.turn_id = rr.turn_id
            WHERE t.conversation_id = ?
            GROUP BY t.turn_id, t.turn_index, t.role, t.message, t.time_in_call_secs, t.feedback, t.llm_override
            ORDER BY t.turn_index ASC
        `;

        const turns = await this.executeQuery(turnsQuery, [conversationId]);
        const conv = results[0];
        
        // Safely parse JSON fields
        const metadata = (() => {
            try {
                return conv.metadata ? JSON.parse(conv.metadata) : {};
            } catch (err) {
                console.error('[DatabaseManager] Failed to parse metadata:', err);
                return {};
            }
        })();

        const analysis = (() => {
            try {
                return conv.analysis ? JSON.parse(conv.analysis) : {};
            } catch (err) {
                console.error('[DatabaseManager] Failed to parse analysis:', err);
                return {};
            }
        })();

        const client_data = (() => {
            try {
                return conv.client_data ? JSON.parse(conv.client_data) : {};
            } catch (err) {
                console.error('[DatabaseManager] Failed to parse client_data:', err);
                return {};
            }
        })();
        
        try {
            // Format response to match API format
            const formattedResponse = {
                conversation_id: conv.conversation_id,
                agent_id: conv.agent_id,
                status: conv.status,
                transcript: turns.map(turn => {
                    try {
                        return {
                            role: turn.role,
                            message: turn.message,
                            tool_calls: (() => {
                                if (!turn.tool_calls) return [];
                                try {
                                    return turn.tool_calls.split(',').map(tc => {
                                        try {
                                            return JSON.parse(tc);
                                        } catch (err) {
                                            console.error('[DatabaseManager] Failed to parse tool call:', tc, err);
                                            return null;
                                        }
                                    }).filter(tc => tc !== null);
                                } catch (err) {
                                    console.error('[DatabaseManager] Failed to process tool calls:', err);
                                    return [];
                                }
                            })(),
                            tool_results: (() => {
                                if (!turn.tool_results) return [];
                                try {
                                    return turn.tool_results.split(',').map(tr => {
                                        try {
                                            return JSON.parse(tr);
                                        } catch (err) {
                                            console.error('[DatabaseManager] Failed to parse tool result:', tr, err);
                                            return null;
                                        }
                                    }).filter(tr => tr !== null);
                                } catch (err) {
                                    console.error('[DatabaseManager] Failed to process tool results:', err);
                                    return [];
                                }
                            })(),
                            feedback: (() => {
                                if (!turn.feedback) return null;
                                try {
                                    return JSON.parse(turn.feedback);
                                } catch (err) {
                                    console.error('[DatabaseManager] Failed to parse feedback:', err);
                                    return null;
                                }
                            })(),
                            llm_override: turn.llm_override,
                            time_in_call_secs: turn.time_in_call_secs,
                            conversation_turn_metrics: (() => {
                                if (!turn.conversation_turn_metrics) return null;
                                try {
                                    // Handle both string and object formats
                                    if (typeof turn.conversation_turn_metrics === 'object') {
                                        return turn.conversation_turn_metrics;
                                    }
                                    
                                    // Try to parse if it's a string
                                    if (typeof turn.conversation_turn_metrics === 'string') {
                                        try {
                                            // Handle case where metrics are concatenated JSON objects
                                            if (turn.conversation_turn_metrics.includes('},{')) {
                                                return turn.conversation_turn_metrics.split(',{')
                                                    .map((metric, index) => {
                                                        // Add back the { for all but first item
                                                        let metricStr = index === 0 ? metric : '{' + metric;
                                                        try {
                                                            return JSON.parse(metricStr);
                                                        } catch (parseErr) {
                                                            console.error('[DatabaseManager] Failed to parse individual metric:', parseErr);
                                                            return null;
                                                        }
                                                    })
                                                    .filter(m => m !== null);
                                            }
                                            // Single JSON object case
                                            return [JSON.parse(turn.conversation_turn_metrics)];
                                        } catch (err) {
                                            console.error('[DatabaseManager] Failed to parse metrics JSON:', err);
                                            console.error('Raw metrics:', turn.conversation_turn_metrics);
                                            return null;
                                        }
                                    }
                                    
                                    return null;
                                } catch (err) {
                                    console.error('[DatabaseManager] Failed to process metrics:', err);
                                    return null;
                                }
                            })(),
                            rag_retrieval_info: turn.rag_retrieval_info ? 
                                turn.rag_retrieval_info.split(',').filter(Boolean) : null
                        };
                    } catch (err) {
                        console.error('[DatabaseManager] Failed to process turn:', turn, err);
                        return {
                            role: turn.role || 'unknown',
                            message: turn.message || '',
                            tool_calls: [],
                            tool_results: [],
                            feedback: null,
                            llm_override: null,
                            time_in_call_secs: null,
                            conversation_turn_metrics: null,
                            rag_retrieval_info: null
                        };
                    }
                }),
                metadata: metadata,
                analysis: {
                    evaluation_criteria_results: analysis.evaluation_criteria_results || {},
                    data_collection_results: analysis.data_collection_results || {},
                    call_successful: analysis.call_successful || null,
                    transcript_summary: conv.transcript_summary
                },
                conversation_initiation_client_data: client_data
            };
            return formattedResponse;
        } catch (err) {
            console.error('[DatabaseManager] Critical error processing conversation:', err);
            // Return minimal valid response with error indication
            return {
                conversation_id: conversationId,
                agent_id: conv?.agent_id || 'unknown',
                status: 'error',
                transcript: [],
                metadata: { error: 'Failed to process conversation data' },
                analysis: {
                    evaluation_criteria_results: {},
                    data_collection_results: {},
                    call_successful: false,
                    transcript_summary: null
                },
                conversation_initiation_client_data: {}
            };
        }
    }

    /**
     * Create a new conversation
     * @param {Object} conversationData 
     * @returns {Promise<string>} Conversation ID
     */
    async createConversation(conversationData) {
        const query = `
            INSERT INTO elevenlabs_conversations SET
            conversation_id = ?,
            agent_id = ?,
            lead_id = ?,
            uniqueid = ?,
            campaign_id = ?,
            call_date = CURRENT_TIMESTAMP,
            start_time_unix_secs = UNIX_TIMESTAMP(),
            status = "in_progress"
        `;

        await this.executeQuery(query, [
            conversationData.conversation_id,
            conversationData.agent_id,
            conversationData.lead_id,
            conversationData.uniqueid,
            conversationData.campaign_id
        ]);

        return conversationData.conversation_id;
    }

    /**
     * Update conversation status and metadata
     * @param {string} conversationId 
     * @param {string} status 
     * @param {Object} metadata 
     * @returns {Promise<boolean>} Success status
     */
    async updateConversationStatus(conversationId, status, metadata = {}) {
        const query = `
            UPDATE elevenlabs_conversations SET
            status = ?,
            metadata = ?,
            call_duration_secs = UNIX_TIMESTAMP() - start_time_unix_secs
            WHERE conversation_id = ?
        `;

        const result = await this.executeQuery(query, [
            status,
            JSON.stringify(metadata),
            conversationId
        ]);
        return result.affectedRows > 0;
    }

    // Conversation Turns Methods

    /**
     * Add a conversation turn
     * @param {Object} turnData 
     * @returns {Promise<number>} Turn ID
     */
    async addConversationTurn(turnData) {
        const query = `
            INSERT INTO elevenlabs_conversation_turns SET
            conversation_id = ?,
            turn_index = ?,
            role = ?,
            message = ?,
            time_in_call_secs = ?
        `;

        const result = await this.executeQuery(query, [
            turnData.conversation_id,
            turnData.turn_index,
            turnData.role,
            turnData.message,
            turnData.time_in_call_secs
        ]);

        return result.insertId;
    }

    /**
     * Get turns for a conversation
     * @param {string} conversationId 
     * @returns {Promise<Array>} Array of conversation turns
     */
    async getConversationTurns(conversationId) {
        return this.executeQuery(
            'SELECT * FROM elevenlabs_conversation_turns WHERE conversation_id = ? ORDER BY turn_index ASC',
            [conversationId]
        );
    }

    /**
     * Update turn metrics
     * @param {number} turnId 
     * @param {Object} metrics 
     * @returns {Promise<boolean>} Success status
     */
    async updateTurnMetrics(turnId, metrics) {
        if (!turnId || typeof turnId !== 'number') {
            throw new Error('Invalid turnId');
        }
        
        const entries = Object.entries(metrics);
        console.log('Updating metrics for turn', turnId, 'with values:', metrics);
        
        const promises = entries
            .filter(([name, elapsed_time]) => elapsed_time !== undefined && elapsed_time !== null)
            .map(([name, elapsed_time]) => {
                return this.executeQuery(
                    'REPLACE INTO elevenlabs_turn_metrics (turn_id, metric_name, elapsed_time) VALUES (?, ?, ?)',
                    [turnId, name, elapsed_time]
                );
            });

        if (promises.length === 0) {
            console.log('No valid metrics to update');
            return true;
        }

        await Promise.all(promises);
        return true;
    }

    // Evaluation Methods

    /**
     * Add an evaluation
     * @param {Object} evaluationData 
     * @returns {Promise<number>} Evaluation ID
     */
    async addEvaluation(evaluationData) {
        const query = `
            INSERT INTO elevenlabs_evaluations SET
            conversation_id = ?,
            criteria_id = ?,
            result = ?,
            rationale = ?
        `;

        const result = await this.executeQuery(query, [
            evaluationData.conversation_id,
            evaluationData.criteria_id,
            evaluationData.result,
            evaluationData.rationale
        ]);

        return result.insertId;
    }

    /**
     * Get evaluations for a conversation
     * @param {string} conversationId 
     * @returns {Promise<Array>} Array of evaluations
     */
    async getEvaluations(conversationId) {
        return this.executeQuery(
            'SELECT * FROM elevenlabs_evaluations WHERE conversation_id = ?',
            [conversationId]
        );
    }

    /**
     * Get campaigns filtered by user ID prefix
     * @param {string|null} userId - The user ID to filter campaigns by (optional)
     * @param {number} [limit=100] - Maximum number of campaigns to return
     * @returns {Promise<Array<{campaign_id: string}>>} Array of campaign objects
     * @throws {Error} If userId is invalid
     */
    async getCampaignsByUserPrefix(userId = null, limit = 100) {
        // Input validation
        if (userId !== null) {
            if (typeof userId !== 'string' || userId.length < 3) {
                throw new Error('Invalid userId format: must be string with minimum length of 3');
            }
        }

        // Ensure limit is valid
        const validLimit = Math.max(1, Math.min(500, limit));

        try {
            // Use parameterized query for security
            const query = userId
                ? 'SELECT campaign_id, SUBSTRING(campaign_id,4) AS name, campaign_name AS description FROM osdial_campaigns WHERE campaign_id LIKE ? ORDER BY campaign_id LIMIT ?'
                : 'SELECT campaign_id, SUBSTRING(campaign_id,4) AS name, campaign_name AS description FROM osdial_campaigns ORDER BY campaign_id LIMIT ?';

            const params = userId
                ? [`${userId.substring(0, 3)}%`, validLimit]
                : [validLimit];

            return await this.executeQuery(query, params);
        } catch (error) {
            console.error('[DatabaseManager] Error fetching campaigns:', error);
            throw new Error('Failed to fetch campaigns: ' + error.message);
        }
    }

    
    /**
     * Get campaign data with audio port
     * @returns {Promise<Array>} Array of active remote agents
     */
    async getRemoteAgentById(agentId) {
        return this.executeQuery(
            'SELECT * FROM osdial_remote_agents WHERE agent_id = ?',
            [agentId]
        );
    }

    /**
     * Get active remote agents count for agent_id
     * @returns {Promise<Array>} Array of active remote agents
     */
    async getRemoteAgentCountById(agentId) {
        return this.executeQuery(
            'SELECT COUNT(*) AS count FROM osdial_remote_agents WHERE agent_id = ?',
            [agentId]
        );
    }

    /**
     * Enable an agent by ID
     * @param {string} agentId The agent ID to enable
     * @returns {Promise<boolean>} Success status
     */
    async enableAgentById(agentId) {
        const query = `
            UPDATE osdial_remote_agents 
            SET status = 'ACTIVE' 
            WHERE agent_id = ?`;
        const result = await this.executeQuery(query, [agentId]);
        return result.affectedRows > 0;
    }

    /**
     * Disable an agent by ID
     * @param {string} agentId The agent ID to disable
     * @returns {Promise<boolean>} Success status
     */
    async disableAgentById(agentId) {
        const query = `
            UPDATE osdial_remote_agents r, osdial_live_agents l 
            SET r.status = 'INACTIVE', l.status='PAUSED'
            WHERE r.agent_id = ? AND l.user=r.user_start and l.server_ip=r.server_ip`;
        const result = await this.executeQuery(query, [agentId]);
        return result.affectedRows > 0;
    }

    
    /**
     * Enable an agent by ID
     * @param {string} agentId The agent ID to disable
     * @returns {Promise<boolean>} Success status
     */
    async enableAgentByUserId(userId) {
        const query = `
            UPDATE osdial_remote_agents 
            SET status = 'ACTIVE' 
            WHERE user_start = ?`;
        const result = await this.executeQuery(query, [userId]);
        return result.affectedRows > 0;
    }
    
    /**
     * Disable an agent by ID
     * @param {string} agentId The agent ID to disable
     * @returns {Promise<boolean>} Success status
     */
    async disableAgentByUserId(userId) {
        const query = `
            UPDATE osdial_remote_agents r, osdial_live_agents l 
            SET r.status = 'INACTIVE', l.status='PAUSED'
            WHERE r.user_start = ? AND l.user=r.user_start and l.server_ip=r.server_ip`;
        const result = await this.executeQuery(query, [userId]);
        return result.affectedRows > 0;
    }


    /**
     * Enable an agent by ID
     * @param {string} agentId The agent ID to disable
     * @returns {Promise<boolean>} Success status
     */
    async enableAgentByCampaignId(campId) {
        const query = `
            UPDATE osdial_remote_agents 
            SET status = 'ACTIVE' 
            WHERE campaign_id = ?`;
        const result = await this.executeQuery(query, [campId]);
        return result.affectedRows > 0;
    }

    /**
     * Disable an agent by ID
     * @param {string} agentId The agent ID to disable
     * @returns {Promise<boolean>} Success status
     */
    async disableAgentByCampaignId(campId) {
        const query = `
            UPDATE osdial_remote_agents r, osdial_live_agents l 
            SET r.status = 'INACTIVE', l.status='PAUSED'
            WHERE r.campaign_id = ? AND l.user=r.user_start and l.server_ip=r.server_ip`;
        const result = await this.executeQuery(query, [campId]);
        return result.affectedRows > 0;
    }


    /**
     * Get active remote agents with audio port
     * @returns {Promise<Array>} Array of active remote agents
     * @param {number|null} port Optional port number to filter by
     */
    /**
     * Get active remote agents with audio port
     * @param {number|null} port - Optional port number to filter by
     * @param {string|null} userId - Optional user ID to filter by
     * @returns {Promise<Array>} Array of active remote agents
     * @throws {Error} If input validation fails
     */
    async getActiveRemoteAgents(port = null, userId = null, showInactive = false) {
        try {
            let query = `
                SELECT * FROM osdial_remote_agents
                WHERE audio_port IS NOT NULL
            `;
            
            if (showInactive === true) {
                query += ' AND status IN ("INACTIVE", "ACTIVE")';
            } else {
                query += ' AND status = "ACTIVE"';
            }

            // Input validation
            const params = [];
            
            // Add port condition
            if (port !== null) {
                query += ' AND audio_port = ?';
                params.push(port);
            } else {
                query += ' AND audio_port > 0';
            }
            
            // Add userId condition
            if (userId) {
                query += ' AND user_start LIKE ?';
                params.push(`va${userId}%`);
            }
            
            return await this.executeQuery(query, params);
        } catch (error) {
            console.error('[DatabaseManager] Error fetching active remote agents:', error);
            throw new Error('Failed to fetch active remote agents: ' + error.message);
        }
    }
    
    /**
     * Get live agent information by UUID
     * @param {string} uuid The uniqueid to lookup
     * @returns {Promise<Object|null>} Agent information or null if not found
     */
    async getAutoCalls(leadId) {
        const query = `
            SELECT *
            FROM osdial_auto_calls
            WHERE lead_id = ?
        `;
        const results = await this.executeQuery(query, [leadId]);
        return results[0] || null;
    }
    
    /**
     * Get live agent information by UUID
     * @param {string} uuid The uniqueid to lookup
     * @returns {Promise<Object|null>} Agent information or null if not found
     */
    async getLeadData(leadId) {
        const query = `
            SELECT *
            FROM osdial_list
            WHERE lead_id = ?
        `;
        const results = await this.executeQuery(query, [leadId]);
        return results[0] || null;
    }

    async getDisposition(campaignId) {
        const query = `
            SELECT status,status_name,category
            FROM 
            (SELECT status,status_name,category FROM osdial_campaign_statuses WHERE selectable='Y' AND campaign_id = ? 
             UNION 
             SELECT status,status_name,category FROM osdial_statuses WHERE status IN ('CALLBK','DNC','NI','SALE')
            ) AS stat 
            GROUP BY status    
        `;
        const results = await this.executeQuery(query, [campaignId]);
        return results || null;
    }
 
        
    /**
     * Get live agent information by UUID
     * @param {string} uuid The uniqueid to lookup
     * @returns {Promise<Object|null>} Agent information or null if not found
     */
    async getLeadDataCustomFields(leadId) {
        const query = `
            SELECT 
                ol.*,
                CONCAT(SUBSTRING(ocf.name,4), '_', ocfd.name) AS field,
                olf.value
            FROM 
                osdial_list ol
            LEFT JOIN 
                osdial_lists ols ON ol.list_id = ols.list_id
            LEFT JOIN 
                osdial_campaign_forms ocf ON FIND_IN_SET(ols.campaign_id, ocf.campaigns) > 0
            LEFT JOIN 
                osdial_campaign_fields ocfd ON ocf.id = ocfd.form_id
            LEFT JOIN 
                osdial_list_fields olf ON ol.lead_id = olf.lead_id AND ocfd.id = olf.field_id
            WHERE 
                ol.lead_id = ?
        `;
        const results = await this.executeQuery(query, [leadId]);
        return results[0] || null;
    }

    
    
    /**
     * Get live agent information by user ID, with optional filtering by conference extension and server IP.
     * If `confExten` or `serverIp` are `null`, they will not be included in the filtering criteria.
     * 
     * @param {string} userId The user ID to lookup
     * @param {string|null} confExten Optional conference extension to filter by (null to ignore)
     * @param {string|null} serverIp Optional server IP to filter by (null to ignore)
     * @returns {Promise<Object|null>} Agent information or null if not found
     */
    async getLiveAgents(userId, confExten = null, serverIp = null) {
        let query = `
            SELECT *
            FROM osdial_live_agents
            WHERE user = ?
        `;
        const params = [userId];
        if (confExten) {
            query += ' AND conf_exten = ?';
            params.push(confExten);
        }
        if (serverIp) {
            query += ' AND server_ip = ?';
            params.push(serverIp);
        }

        const results = await this.executeQuery(query, params);
        return results[0] || null;
    }
}

module.exports = DatabaseManager;
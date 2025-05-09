import { useState, useEffect } from 'react';

interface ToolCall {
  id: string;
  type: string;
  function: {
    name: string;
    arguments: Record<string, unknown>;
  };
}

interface ToolResult {
  id: string;
  type: string;
  output: unknown;
}

interface ConversationTurnMetrics {
  duration_ms: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

interface Feedback {
  score?: number;
  comment?: string;
}

interface Transcript {
  role: string;
  message: string;
  tool_calls: ToolCall[];
  tool_results: ToolResult[];
  feedback: Feedback | null;
  time_in_call_secs: number;
  conversation_turn_metrics: ConversationTurnMetrics | null;
}

interface DeletionSettings {
  deletion_time_unix_secs: number;
  deleted_logs_at_time_unix_secs: number | null;
  deleted_audio_at_time_unix_secs: number | null;
  deleted_transcript_at_time_unix_secs: number | null;
  delete_transcript_and_pii: boolean;
  delete_audio: boolean;
}

interface MetadataFeedback {
  overall_score: number | null;
  likes: number;
  dislikes: number;
}

interface Charging {
  dev_discount: boolean;
}

interface EvaluationCriteriaResults {
  [key: string]: unknown;
}

interface DataCollectionResults {
  [key: string]: unknown;
}

interface ConversationConfig {
  agent: {
    prompt: {
      prompt: string;
    };
    first_message: string;
    language: string | null;
  };
  tts: Record<string, unknown> | null;
}

interface ConversationDetails {
  agent_id: string;
  conversation_id: string;
  status: string;
  transcript: Transcript[];
  metadata: {
    start_time_unix_secs: number;
    call_duration_secs: number;
    cost: number;
    deletion_settings: DeletionSettings;
    feedback: MetadataFeedback;
    authorization_method: string;
    charging: Charging;
    termination_reason: string;
  };
  analysis: {
    evaluation_criteria_results: EvaluationCriteriaResults;
    data_collection_results: DataCollectionResults;
    call_successful: string;
    transcript_summary: string;
  };
  conversation_initiation_client_data: {
    conversation_config_override: ConversationConfig;
    custom_llm_extra_body: Record<string, unknown>;
    dynamic_variables: Record<string, unknown>;
  };
}

export function useConversationDetails(conversationId: string | null) {
  const [data, setData] = useState<ConversationDetails | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Wenn keine conversationId vorhanden ist, nichts tun
    if (!conversationId) return;

    let sharedWebSocket: WebSocket | null = null;
    let isMounted = true;

    const fetchConversationDetails = () => {
      setIsLoading(true);
      setError(null);

      // WebSocket-Verbindung herstellen
      sharedWebSocket = new WebSocket("wss://dev.dial24.net/ai");

      sharedWebSocket.onopen = () => {
        console.log("WebSocket connection established for conversation details");
        // Anfrage mit conversation_id senden
        sharedWebSocket?.send(JSON.stringify({ 
          action: "getConversation", 
          conversation_id: conversationId 
        }));
      };

      // Handler für eingehende Nachrichten
      sharedWebSocket.onmessage = (event) => {
        try {
          const receivedData = JSON.parse(event.data);
          console.log("Received conversation details:", receivedData);

          if (receivedData.type === "status" && receivedData.status === "getConversation") {
            if (isMounted) {
              setData(receivedData.message);
              setIsLoading(false);
            }
          }
        } catch (parseError) {
          console.error("Error parsing JSON response:", parseError);
          if (isMounted) {
            setError("Fehler beim Verarbeiten der Daten.");
            setIsLoading(false);
          }
        }
      };

      // Handler für Fehler
      sharedWebSocket.onerror = (error) => {
        console.error("WebSocket error:", error);
        if (isMounted) {
          setError("Fehler beim Laden der Daten. Bitte versuchen Sie es später erneut.");
          setIsLoading(false);
        }
      };

      // Handler für Verbindungsabbruch
      sharedWebSocket.onclose = () => {
        console.log("WebSocket connection closed for conversation details");
        if (isMounted) {
          setIsLoading(false);
        }
      };
    };

    fetchConversationDetails();

    // Cleanup-Funktion
    return () => {
      isMounted = false;
      if (sharedWebSocket) {
        sharedWebSocket.close();
      }
    };
  }, [conversationId]);

  return { data, isLoading, error };
}

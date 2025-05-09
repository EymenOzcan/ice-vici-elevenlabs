import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { toast } from "@/hooks/use-toast";
import { Bot, Languages, MessageSquare, Phone, Settings } from "lucide-react";

// Typen basierend auf der API-Antwort
type AgentDetails = {
  agent_id: string;
  name: string;
  conversation_config: {
    asr: {
      quality: string;
      provider: string;
      user_input_audio_format: string;
      keywords: string[];
    };
    turn: {
      turn_timeout: number;
      mode: string;
    };
    tts: {
      model_id: string;
      voice_id: string;
      agent_output_audio_format: string;
      optimize_streaming_latency: number;
      stability: number;
      speed: number;
      similarity_boost: number;
      pronunciation_dictionary_locators: string[];
    };
    conversation: {
      max_duration_seconds: number;
      client_events: string[];
    };
    language_presets: Record<string, unknown>;
    agent: {
      first_message: string;
      language: string;
      dynamic_variables: {
        dynamic_variable_placeholders: Record<string, unknown>;
      };
      prompt: {
        prompt: string;
        llm: string;
        temperature: number;
        max_tokens: number;
        tools: Array<{
          type: string;
          name: string;
          description: string;
        }>;
        tool_ids: string[];
        knowledge_base: string[];
        custom_llm: unknown;
        rag: {
          enabled: boolean;
          embedding_model: string;
          max_vector_distance: number;
          max_documents_length: number;
        };
      };
    };
  };
  metadata: {
    created_at_unix_secs: number;
  };
  platform_settings: Record<string, unknown>;
};

interface AgentDetailsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agentId: string;
  onStartCall?: (agentId: string) => void;
}

export function AgentDetailsModal({ 
  open, 
  onOpenChange, 
  agentId,
  onStartCall 
}: AgentDetailsModalProps) {
  const [agentDetails, setAgentDetails] = useState<AgentDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // State für bearbeitbare Felder
  const [formData, setFormData] = useState({
    name: "",
    language: "",
    firstMessage: "",
    prompt: "",
    llm: "",
    temperature: 0.85,
    voiceId: "",
    stability: 0.25,
    speed: 0.94,
    similarityBoost: 0.1,
    turnTimeout: 7,
  });

  // Sprachen für das Dropdown
  const languages = [
    { code: "en", name: "English" },
    { code: "de", name: "Deutsch" },
    { code: "tr", name: "Turkish" },
    { code: "es", name: "Español" },
    { code: "fr", name: "Français" },
    { code: "it", name: "Italiano" },

  ];

  // Sprachmodelle für das Dropdown
  const llmModels = [
    { id: "gpt-4o-mini", name: "GPT-4o Mini" },
    { id: "gpt-4o", name: "GPT-4o" },
  ];

  // Voice IDs für das Dropdown
  const voiceIds = [
    { id: "v3V1d2rk6528UrLKRuy8", name: "Deutsch - Weiblich" },
    { id: "FTNCalFNG5bRnkkaP5Ug", name: "Deutsch - Männlich" },
    { id: "56AoDkrOh6qfVPDXZ7Pt", name: "English - Female" },
    { id: "UgBBYS2sOqTuMpoF3BR0", name: "English - Male" },
  ];

  // WebSocket-Anfrage für Agent-Details
  useEffect(() => {
    if (open && agentId) {
      setIsLoading(true);
      setError(null);
      
      const ws = new WebSocket("wss://dev.dial24.net/ai");
      
      ws.onopen = () => {
        console.log("WebSocket connected, sending getAgent request");
        ws.send(JSON.stringify({ action: "getAgent", agent_id: agentId }));
      };
      
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log("Received WebSocket message:", data);
          
          if (data.type === "status" && data.status === "getAgent") {
            const details = data.message as AgentDetails;
            setAgentDetails(details);
            
            // Formular mit den Daten füllen
            setFormData({
              name: details.name,
              language: details.conversation_config.agent.language,
              firstMessage: details.conversation_config.agent.first_message,
              prompt: details.conversation_config.agent.prompt.prompt,
              llm: details.conversation_config.agent.prompt.llm,
              temperature: details.conversation_config.agent.prompt.temperature,
              voiceId: details.conversation_config.tts.voice_id,
              stability: details.conversation_config.tts.stability,
              speed: details.conversation_config.tts.speed,
              similarityBoost: details.conversation_config.tts.similarity_boost,
              turnTimeout: details.conversation_config.turn.turn_timeout,
            });
            
            setIsLoading(false);
          }
        } catch (error) {
          console.error("Error parsing WebSocket message:", error);
          setError("Fehler beim Verarbeiten der Daten.");
          setIsLoading(false);
        }
      };
      
      ws.onerror = (error: Event) => {
        console.error("WebSocket error:", error);
        setError("Fehler bei der Verbindung zum Server.");
        setIsLoading(false);
      };
      
      ws.onclose = () => {
        console.log("WebSocket connection closed");
      };
      
      return () => {
        ws.close();
      };
    }
  }, [open, agentId]);

  // Handler für Formularänderungen
  const handleChange = (field: string, value: string | number) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };
  
  // Handler für "Anruf starten"
  const handleStartCall = () => {
    if (onStartCall && agentId) {
      onStartCall(agentId);
      onOpenChange(false);
    }
  };
  
  // Handler für "Speichern"
  const handleSave = () => {
    // Hier würde die Logik zum Speichern der Änderungen implementiert werden
    toast({
      title: "Änderungen gespeichert",
      description: "Die Änderungen wurden erfolgreich gespeichert.",
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Agent Details</DialogTitle>
          <DialogDescription>
            Details und Einstellungen des ausgewählten Agenten.
          </DialogDescription>
        </DialogHeader>
        
        {isLoading ? (
          <div className="py-8 text-center">
            <div className="animate-pulse flex flex-col items-center">
              <div className="h-4 bg-muted rounded w-3/4 mb-4"></div>
              <div className="h-3 bg-muted rounded w-1/2"></div>
            </div>
          </div>
        ) : error ? (
          <div className="py-4 text-center text-red-500">
            <p>{error}</p>
          </div>
        ) : (
          <div className="grid gap-4 py-4">
            {/* Allgemeine Informationen */}
            <div className="grid gap-2">
              <div className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-primary" />
                <Label htmlFor="name">Name</Label>
              </div>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => handleChange("name", e.target.value)}
                className="bg-white"
              />
            </div>
            
            <div className="grid gap-2">
              <div className="flex items-center gap-2">
                <Languages className="h-4 w-4 text-primary" />
                <Label htmlFor="language">Sprache</Label>
              </div>
              <Select 
                value={formData.language} 
                onValueChange={(value) => handleChange("language", value)}
              >
                <SelectTrigger className="bg-white">
                  <SelectValue placeholder="Sprache auswählen" />
                </SelectTrigger>
                <SelectContent className="bg-white">
                  <SelectGroup>
                    <SelectLabel>Sprachen</SelectLabel>
                    {languages.map((lang) => (
                      <SelectItem key={lang.code} value={lang.code}>
                        {lang.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            
            {/* Sprachmodell-Einstellungen */}
            <div className="grid gap-2">
              <div className="flex items-center gap-2">
                <Settings className="h-4 w-4 text-primary" />
                <Label htmlFor="llm">Sprachmodell</Label>
              </div>
              <Select 
                value={formData.llm} 
                onValueChange={(value) => handleChange("llm", value)}
              >
                <SelectTrigger className="bg-white">
                  <SelectValue placeholder="Modell auswählen" />
                </SelectTrigger>
                <SelectContent className="bg-white">
                  <SelectGroup>
                    <SelectLabel>Modelle</SelectLabel>
                    {llmModels.map((model) => (
                      <SelectItem key={model.id} value={model.id}>
                        {model.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="temperature">Temperatur: {formData.temperature}</Label>
              <Slider
                id="temperature"
                min={0}
                max={1}
                step={0.01}
                value={[formData.temperature]}
                onValueChange={(value) => handleChange("temperature", value[0])}
              />
            </div>
            
            {/* Voice Settings */}
            <div className="grid gap-2">
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-primary" />
                <Label htmlFor="voiceId">Stimme</Label>
              </div>
              <Select 
                value={formData.voiceId} 
                onValueChange={(value) => handleChange("voiceId", value)}
              >
                <SelectTrigger className="bg-white">
                  <SelectValue placeholder="Stimme auswählen" />
                </SelectTrigger>
                <SelectContent className="bg-white">
                  <SelectGroup>
                    <SelectLabel>Stimmen</SelectLabel>
                    {voiceIds.map((voice) => (
                      <SelectItem key={voice.id} value={voice.id}>
                        {voice.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="stability">Stabilität: {formData.stability}</Label>
              <Slider
                id="stability"
                min={0}
                max={1}
                step={0.01}
                value={[formData.stability]}
                onValueChange={(value) => handleChange("stability", value[0])}
              />
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="speed">Geschwindigkeit: {formData.speed}</Label>
              <Slider
                id="speed"
                min={0.5}
                max={1.5}
                step={0.01}
                value={[formData.speed]}
                onValueChange={(value) => handleChange("speed", value[0])}
              />
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="similarityBoost">Ähnlichkeits-Boost: {formData.similarityBoost}</Label>
              <Slider
                id="similarityBoost"
                min={0}
                max={1}
                step={0.01}
                value={[formData.similarityBoost]}
                onValueChange={(value) => handleChange("similarityBoost", value[0])}
              />
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="turnTimeout">Turn Timeout: {formData.turnTimeout} Sekunden</Label>
              <Slider
                id="turnTimeout"
                min={1}
                max={15}
                step={1}
                value={[formData.turnTimeout]}
                onValueChange={(value) => handleChange("turnTimeout", value[0])}
              />
            </div>
            
            {/* Prompt und First Message */}
            <div className="grid gap-2">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-primary" />
                <Label htmlFor="firstMessage">Erste Nachricht</Label>
              </div>
              <Input
                id="firstMessage"
                value={formData.firstMessage}
                onChange={(e) => handleChange("firstMessage", e.target.value)}
                className="bg-white"
              />
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="prompt">Prompt</Label>
              <Textarea
                id="prompt"
                value={formData.prompt}
                onChange={(e) => handleChange("prompt", e.target.value)}
                className="resize-none bg-white"
                rows={5}
              />
            </div>
          </div>
        )}
        
        <DialogFooter className="flex flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button variant="outline" onClick={handleSave} disabled={isLoading}>
            Speichern
          </Button>
          <Button onClick={handleStartCall} disabled={isLoading}>
            Anruf starten
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

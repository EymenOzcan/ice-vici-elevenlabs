
import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { useWebSocket } from "@/hooks/useWebSocket";
// Direkter Zugriff auf die gemeinsam genutzte WebSocket-Verbindung
import { sharedWebSocket } from "@/hooks/useWebSocket";
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
import { toast } from "@/hooks/use-toast";
import { Bot, Languages, MessageSquare, Phone } from "lucide-react";

// Typen basierend auf der API-Antwort
type AccessInfo = {
  is_creator: boolean;
  creator_name: string;
  creator_email: string;
  role: string;
};

type Agent = {
  agent_id: string;
  name: string;
  created_at_unix_secs: number;
  access_info: AccessInfo;
};

type AgentsResponse = {
  agents: Agent[];
  next_cursor: string | null;
  has_more: boolean;
};

// Typ für die WebSocket-Nachricht zum Starten eines Anrufs
type StartCallMessage = {
  action: string;
  channel: string;
  agent_id: string;
  params: {
    prompt?: string;
    first_message?: string;
    language?: string;
  };
};

const languageCodes = [
  { code: "en", name: "English" },
  { code: "de", name: "German" },
  { code: "tr", name: "Turkish" },
  { code: "es", name: "Español" },
  { code: "fr", name: "Français" },
  { code: "it", name: "Italiano" },
];

interface NewCallModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preselectedAgentId?: string; // Optional: Vorausgewählter Agent
}

export function NewCallModal({ open, onOpenChange, preselectedAgentId }: NewCallModalProps) {
  // Abrufen der Agenten von der API
  const { data: agents, isLoading, error } = useWebSocket<Agent[]>("listAgents", "agents");
  
  const [formData, setFormData] = useState({
    agentId: preselectedAgentId || "",
    phoneNumber: "",
    prompt: "",
    firstMessage: "",
    languageCode: "",
  });

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  // Referenz, um zu verfolgen, ob bereits ein Anruf gestartet wurde
  const callStartedRef = useRef(false);

  // Der automatische Start des Anrufs bei Änderungen wurde entfernt.
  // Der Anruf wird jetzt nur noch durch den Submit-Button ausgelöst.

  // Der automatische Start des Anrufs bei Änderungen wurde entfernt.
  // Der Anruf wird jetzt nur noch durch den Submit-Button ausgelöst.

  
  const handleSubmit = () => {
    // Validate form
    if (!formData.agentId || !formData.phoneNumber) {
      toast({
        title: "Required fields missing",
        description: "Please select an agent and enter a phone number",
        variant: "destructive",
      });
      return;
    }

    // Wenn bereits ein Anruf gestartet wurde, nichts tun
    if (callStartedRef.current) {
      return;
    }

    // Senden der start_call Aktion über WebSocket
    if (sharedWebSocket && sharedWebSocket.readyState === WebSocket.OPEN) {
      const startCallMessage: StartCallMessage = {
        action: "start_call",
        channel: formData.phoneNumber,
        agent_id: formData.agentId,
        params: {},
      };
      
      if (formData.prompt) {
        startCallMessage.params.prompt = formData.prompt;
      }
      
      if (formData.firstMessage) {
        startCallMessage.params.first_message = formData.firstMessage;
      }
      
      if (formData.languageCode) {
        startCallMessage.params.language = formData.languageCode;
      }
      
      console.log("Sending start_call message:", startCallMessage);
      sharedWebSocket.send(JSON.stringify(startCallMessage));
      
      toast({
        title: "New call initiated",
        description: "Your call has been queued and will start momentarily",
      });
      
      // Markieren, dass ein Anruf gestartet wurde
      callStartedRef.current = true;
      
      onOpenChange(false);
    } else {
      toast({
        title: "Connection error",
        description: "Could not connect to the server. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>New Call</DialogTitle>
          <DialogDescription>
             Start outbound call by an AI agent. Fill out the details below.
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-primary" />
              <Label htmlFor="agent">Select AI Agent</Label>
            </div>
            <Select 
              value={formData.agentId} 
              onValueChange={(value) => handleChange("agentId", value)}
            >
              <SelectTrigger className="bg-white">
                <SelectValue placeholder="Select an agent" />
              </SelectTrigger>
              <SelectContent className="bg-white">
                <SelectGroup>
                  <SelectLabel>Available Agents</SelectLabel>
                  {agents?.map((agent) => (
                    <SelectItem key={agent.agent_id} value={agent.agent_id}>
                      {agent.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          
          <div className="grid gap-2">
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-primary" />
              <Label htmlFor="phoneNumber">Phone Number</Label>
            </div>
            <Input
              id="phoneNumber"
              placeholder="+49 172 1234567"
              value={formData.phoneNumber}
              onChange={(e) => handleChange("phoneNumber", e.target.value)}
              className="bg-white"
            />
          </div>
          
          <div className="grid gap-2">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-primary" />
              <Label htmlFor="prompt">Agent Prompt (Optional, Override)</Label>
            </div>
            <Textarea
              id="prompt"
              placeholder="Enter instructions for the AI agent..."
              value={formData.prompt}
              onChange={(e) => handleChange("prompt", e.target.value)}
              className="resize-none bg-white"
              rows={3}
            />
          </div>
          
          <div className="grid gap-2">
            <Label htmlFor="firstMessage">First Message (Optional, Override)</Label>
            <Input
              id="firstMessage"
              placeholder="Hello, how can I help you today?"
              value={formData.firstMessage}
              onChange={(e) => handleChange("firstMessage", e.target.value)}
              className="bg-white"
            />
          </div>
          
          <div className="grid gap-2">
            <div className="flex items-center gap-2">
              <Languages className="h-4 w-4 text-primary" />
              <Label htmlFor="language">Language (Optional, Override)</Label>
            </div>
            <Select 
              value={formData.languageCode} 
              onValueChange={(value) => handleChange("languageCode", value)}
            >
              <SelectTrigger className="bg-white">
                <SelectValue placeholder="Select a language" />
              </SelectTrigger>
              <SelectContent className="bg-white">
                <SelectGroup>
                  <SelectLabel>Languages</SelectLabel>
                  {languageCodes.map((lang) => (
                    <SelectItem key={lang.code} value={lang.code}>
                      {lang.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit}>
            Start Call
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

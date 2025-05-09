import { FadeIn } from "@/components/animations/FadeIn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Bot, Calendar, Clock, User } from "lucide-react";
import { useState, useEffect } from "react";
import { useWebSocket } from "@/hooks/useWebSocket";
import { AgentDetailsModal } from "./AgentDetailsModal";
import { openNewCallWithAgent } from "./Header";

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

export function AgentsCard() {
  const { data: agents, isLoading, error } = useWebSocket<Agent[]>("listAgents", "agents");
  const [viewAll, setViewAll] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  
  // Funktion zum Öffnen des Modals
  const handleAgentSelect = (agent: Agent) => {
    setSelectedAgent(agent);
    setModalOpen(true);
  };
  
  // Funktion zum Starten eines Anrufs mit dem ausgewählten Agenten
  const handleStartCall = (agentId: string) => {
    // NewCallModal öffnen mit vorausgewähltem Agenten
    openNewCallWithAgent(agentId);
    setModalOpen(false);
  };

  const displayedAgents = viewAll ? agents : agents?.slice(0, 2);
  
  // Formatiert Unix-Zeitstempel in lesbares Datum
  const formatDate = (unixTimestamp: number) => {
    const date = new Date(unixTimestamp * 1000);
    return date.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  return (
    <FadeIn delay={0.5}>
      <div className="glass-card">
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-primary" />
            <h3 className="text-lg font-medium">Available AI Agents</h3>
          </div>
          {agents?.length > 2 && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setViewAll(!viewAll)}
            >
              {viewAll ? "Weniger anzeigen" : "Alle anzeigen"}
            </Button>
          )}
        </div>
        
        <div className="divide-y divide-border">
          {isLoading ? (
            <div className="px-5 py-8 text-center">
              <div className="animate-pulse flex flex-col items-center">
                <div className="h-4 bg-muted rounded w-3/4 mb-4"></div>
                <div className="h-3 bg-muted rounded w-1/2"></div>
              </div>
            </div>
          ) : error ? (
            <div className="px-5 py-4 text-center text-red-500">
              <p>{error}</p>
            </div>
          ) : agents?.length === 0 ? (
            <div className="px-5 py-4 text-center text-muted-foreground">
              <p>Keine Agenten verfügbar</p>
            </div>
          ) : (
            displayedAgents?.map((agent, index) => (
              <FadeIn key={agent.agent_id} delay={0.1 * (index + 1)}>
                <div className="px-5 py-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium">{agent.name}</h4>
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => handleAgentSelect(agent)}
                    >
                      Auswählen
                    </Button>
                  </div>
                  
                  <div className="flex flex-wrap gap-4 text-xs mt-3">
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <User className="h-3 w-3" />
                      <span>Ersteller: {agent.access_info.creator_name}</span>
                    </div>
                    
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      <span>Erstellt am: {formatDate(agent.created_at_unix_secs)}</span>
                    </div>
                    
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Badge variant="secondary" size="sm" className="text-xs">
                        {agent.access_info.role}
                      </Badge>
                    </div>
                  </div>
                </div>
              </FadeIn>
            ))
          )}
        </div>
      </div>
      
      {/* Agent Details Modal */}
      {selectedAgent && (
        <AgentDetailsModal 
          open={modalOpen} 
          onOpenChange={setModalOpen} 
          agentId={selectedAgent.agent_id} 
          onStartCall={handleStartCall}
        />
      )}
    </FadeIn>
  );
}

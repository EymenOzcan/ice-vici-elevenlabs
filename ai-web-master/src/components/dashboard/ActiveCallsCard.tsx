import { FadeIn } from "@/components/animations/FadeIn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Headphones, Timer, User, Server } from "lucide-react";
import { useState, useEffect } from "react";
import { useWebSocket, sharedWebSocket } from "@/hooks/useWebSocket";

type ActiveCall = {
  event: string;
  actionid: string;
  channel: string;
  channelstate: string;
  channelstatedesc: string;
  calleridnum: string;
  calleridname: string;
  connectedlinenum: string;
  connectedlinename: string;
  language: string;
  accountcode: string;
  context: string;
  exten: string;
  priority: string;
  uniqueid: string;
  linkedid: string;
  application: string;
  applicationdata: string;
  duration: string;
  bridgeid: string;
  audioSocketPort: string | null;
};

export function ActiveCallsCard() {
  const { data: activeCalls, isLoading, error } = useWebSocket<ActiveCall[]>("showChannels", "message");
  const [viewAll, setViewAll] = useState(false);
  const displayedCalls = viewAll ? activeCalls : activeCalls.slice(0, 2);
  
  // Periodische Aktualisierung alle 5 Sekunden
  useEffect(() => {
    // Initiale Abfrage wird durch useWebSocket bereits durchgeführt
    
    // Intervall für regelmäßige Aktualisierungen einrichten
    const intervalId = setInterval(() => {
      if (sharedWebSocket && sharedWebSocket.readyState === WebSocket.OPEN) {
        sharedWebSocket.send(JSON.stringify({ action: "showChannels" }));
      }
    }, 5000); // Alle 5 Sekunden
    
    // Aufräumen beim Unmount der Komponente
    return () => clearInterval(intervalId);
  }, []);
  
  return (
    <FadeIn delay={0.5}>
      <div className="glass-card">
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Headphones className="h-4 w-4 text-primary" />
            <h3 className="text-lg font-medium">Aktive Anrufe</h3>
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => setViewAll(!viewAll)}
          >
            {viewAll ? "Show Less" : "View All"}
          </Button>
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
          ) : !activeCalls || activeCalls.length === 0 ? (
            <div className="px-5 py-4 text-center text-muted-foreground">
              <p>Keine aktiven Anrufe</p>
            </div>
          ) : (
            displayedCalls.map((call, index) => (
              <FadeIn key={call.uniqueid} delay={0.1 * (index + 1)}>
                <div className="px-5 py-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        {call.calleridnum}
                      </h4>
                      <Badge variant={call.channelstatedesc === 'Up' ? 'success' : 'warning'} size="sm">
                        {call.channelstatedesc}
                      </Badge>
                    </div>
                    <Button variant="outline" size="sm">Verwalten</Button>
                  </div>
                  
                  <div className="flex flex-wrap items-center gap-4 text-xs mt-2">
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Headphones className="h-3 w-3" />
                      <span>{call.channel}</span>
                    </div>
                    
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Timer className="h-3 w-3" />
                      <span>{call.duration}</span>
                    </div>
                    
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Server className="h-3 w-3" />
                      <span>Account: {call.accountcode || 'N/A'}</span>
                    </div>
                  </div>
                </div>
              </FadeIn>
            ))
          )}
        </div>
      </div>
    </FadeIn>
  );
}

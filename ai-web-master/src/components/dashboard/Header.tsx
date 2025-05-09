import { FadeIn } from "@/components/animations/FadeIn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NewCallModal } from "./NewCallModal";
import { Menu, Search, X } from "lucide-react";
import { useState, useCallback } from "react";

// Globaler Zustand für das NewCallModal
let openNewCallModalWithAgent: ((agentId: string) => void) | null = null;

// Exportiere die Funktion, damit andere Komponenten das Modal öffnen können
export function openNewCallWithAgent(agentId: string) {
  if (openNewCallModalWithAgent) {
    openNewCallModalWithAgent(agentId);
  }
}

interface HeaderProps {
  onMenuClick?: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  const [showSearch, setShowSearch] = useState(false);
  const [showNewCallModal, setShowNewCallModal] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState<string | undefined>(undefined);
  
  // Funktion zum Öffnen des NewCallModal mit einem vorausgewählten Agenten
  const openModalWithAgent = useCallback((agentId: string) => {
    setSelectedAgentId(agentId);
    setShowNewCallModal(true);
  }, []);
  
  // Globale Funktion setzen
  openNewCallModalWithAgent = openModalWithAgent;
  
  return (
    <div className="flex justify-between items-center py-4 px-4 md:px-6 border-b sticky top-0 bg-background z-30">
      <FadeIn delay={0.1} direction="down">
        <div className="flex items-center gap-3">
          <h1 className="text-xl md:text-2xl font-medium tracking-tight">AI Call Center</h1>
          <Badge variant="info" animate="pulse">Live</Badge>
        </div>
      </FadeIn>
      
      <FadeIn delay={0.2} direction="down">
        <div className="flex items-center gap-2 md:gap-4">
          {/* Mobile search toggle */}
          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setShowSearch(!showSearch)}>
            {showSearch ? <X className="h-4 w-4" /> : <Search className="h-4 w-4" />}
          </Button>
          
          {/* Desktop search always visible */}
          <div className="relative hidden md:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search calls..."
              className="pl-10 pr-4 py-2 h-10 w-64 rounded-lg border border-input bg-background"
            />
          </div>
          
          {/* Mobile search expandable */}
          {showSearch && (
            <div className="absolute top-16 left-0 right-0 p-4 bg-background border-b shadow-md md:hidden z-50">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search calls..."
                  className="pl-10 pr-4 py-2 h-10 w-full rounded-lg border border-input bg-background"
                  autoFocus
                />
              </div>
            </div>
          )}
          
          <Button size="sm" className="md:flex" onClick={() => setShowNewCallModal(true)}>New Call</Button>
          <Button size="icon" className="md:hidden" onClick={onMenuClick}>
            <Menu className="h-4 w-4" />
          </Button>
        </div>
      </FadeIn>
      
      <NewCallModal 
        open={showNewCallModal} 
        onOpenChange={setShowNewCallModal} 
        preselectedAgentId={selectedAgentId}
      />
    </div>
  );
}

import { FadeIn } from "@/components/animations/FadeIn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { 
  Calendar,
  ChevronDown, 
  Clock, 
  MoreHorizontal, 
  MessageSquare,
  User,
  Check
} from "lucide-react";
import { useEffect, useState } from "react";
import { useWebSocket } from "@/hooks/useWebSocket";
import { CallDetailsModal } from "./CallDetailsModal";

interface Conversation {
  agent_id: string;
  agent_name?: string;
  conversation_id: string;
  start_time_unix_secs: number;
  call_duration_secs: number;
  message_count: number;
  status: string;
  call_successful: string;
}

export function CallsList() {
  const { data: conversations, isLoading: loading, error } = useWebSocket<Conversation[]>("listConversations", "conversations");
  
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [activeFilter, setActiveFilter] = useState<FilterOption>("all");
  
  const handleConversationClick = (conversation: Conversation) => {
    setSelectedConversation(conversation);
    setShowDetailsModal(true);
  };

  type FilterOption = "all" | "today" | "yesterday" | "min10interactions" | "min2minutes" | "processing";

  const formatDate = (unixTimestamp: number) => {
    const date = new Date(unixTimestamp * 1000);
    return date.toLocaleString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const getStatusVariant = (status: string, callSuccessful: string) => {
    if (status === "processing") return "warning";
    if (callSuccessful === "success") return "success";
    return "destructive";
  };

  const isToday = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    const today = new Date();
    return date.setHours(0, 0, 0, 0) === today.setHours(0, 0, 0, 0);
  };

  const isYesterday = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return date.setHours(0, 0, 0, 0) === yesterday.setHours(0, 0, 0, 0);
  };

  const getFilteredConversations = () => {
    if (!conversations || conversations.length === 0) return [];

    switch (activeFilter) {
      case "today":
        return conversations.filter(conv => isToday(conv.start_time_unix_secs));
      case "yesterday":
        return conversations.filter(conv => isYesterday(conv.start_time_unix_secs));
      case "min10interactions":
        return conversations.filter(conv => conv.message_count >= 10);
      case "min2minutes":
        return conversations.filter(conv => conv.call_duration_secs >= 120);
      case "processing":
        return conversations.filter(conv => conv.status === "processing");
      default:
        return conversations;
    }
  };

  const getFilterLabel = (filter: FilterOption) => {
    switch (filter) {
      case "today": return "Calls von heute";
      case "yesterday": return "Calls von gestern";
      case "min10interactions": return "Min. 10 Interaktionen";
      case "min2minutes": return "Min. 2 Minuten";
      case "processing": return "In Bearbeitung";
      default: return "Alle Konversationen";
    }
  };

  return (
    <FadeIn delay={0.2}>
      <div className="glass-card overflow-hidden">
        <div className="px-3 md:px-5 py-3 md:py-4 flex items-center justify-between border-b">
          <h3 className="text-base md:text-lg font-medium">Letzte Konversationen</h3>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="text-xs flex items-center gap-1">
                {getFilterLabel(activeFilter)} <ChevronDown className="ml-1 h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setActiveFilter("all")} className="flex items-center justify-between">
                Alle Konversationen {activeFilter === "all" && <Check className="h-4 w-4 ml-2" />}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setActiveFilter("today")} className="flex items-center justify-between">
                Calls von heute {activeFilter === "today" && <Check className="h-4 w-4 ml-2" />}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setActiveFilter("yesterday")} className="flex items-center justify-between">
                Calls von gestern {activeFilter === "yesterday" && <Check className="h-4 w-4 ml-2" />}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setActiveFilter("min10interactions")} className="flex items-center justify-between">
                Min. 10 Interaktionen {activeFilter === "min10interactions" && <Check className="h-4 w-4 ml-2" />}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setActiveFilter("min2minutes")} className="flex items-center justify-between">
                Min. 2 Minuten {activeFilter === "min2minutes" && <Check className="h-4 w-4 ml-2" />}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setActiveFilter("processing")} className="flex items-center justify-between">
                In Bearbeitung {activeFilter === "processing" && <Check className="h-4 w-4 ml-2" />}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        
        <div className="divide-y divide-border max-h-[400px] overflow-y-auto">
          {error ? (
            <div className="p-4 text-center text-muted-foreground">{error}</div>
          ) : loading ? (
            <div className="p-4 text-center text-muted-foreground">Lade Konversationen...</div>
          ) : getFilteredConversations().length === 0 ? (
            <div className="p-4 text-center text-muted-foreground">Keine Konversationen gefunden</div>
          ) : (
            getFilteredConversations().map((conversation, index) => (
              <FadeIn key={conversation.conversation_id} delay={0.1 * (index + 1)} direction="up">
                <div 
                  className="px-3 md:px-5 py-2 md:py-3 hover:bg-secondary/30 transition-colors cursor-pointer"
                  onClick={() => handleConversationClick(conversation)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2 md:gap-3">
                      <div className="h-8 w-8 md:h-9 md:w-9 rounded-full bg-primary/10 flex items-center justify-center">
                        <User className="h-4 w-4 md:h-5 md:w-5 text-primary" />
                      </div>
                      <div>
                        <h4 className="text-sm md:text-base font-medium">{conversation.agent_name}</h4>
                        <p className="text-xs md:text-sm text-muted-foreground">ID: {conversation.conversation_id.substring(0, 8)}...</p>
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7 md:h-8 md:w-8">
                      <MoreHorizontal className="h-3 w-3 md:h-4 md:w-4" />
                    </Button>
                  </div>
                  
                  <div className="flex flex-wrap items-center gap-2 md:gap-4 mt-1 md:mt-2 text-[10px] md:text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3 w-3 md:h-3.5 md:w-3.5" />
                      <span>{formatDate(conversation.start_time_unix_secs)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3 md:h-3.5 md:w-3.5" />
                      <span>{formatDuration(conversation.call_duration_secs)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <MessageSquare className="h-3 w-3 md:h-3.5 md:w-3.5" />
                      <span>{conversation.message_count} Interaktionen</span>
                    </div>
                    <Badge 
                      variant={getStatusVariant(conversation.status, conversation.call_successful)}
                      size="sm"
                      className="ml-auto"
                    >
                      {conversation.status === "done" ? "Abgeschlossen" : 
                       conversation.status === "processing" ? "In Bearbeitung" : conversation.status}
                    </Badge>
                  </div>
                </div>
              </FadeIn>
            ))
          )}
        </div>
        
        <div className="px-3 md:px-5 py-2 md:py-3 border-t">
          <Button variant="outline" className="w-full" size="sm">Alle Konversationen anzeigen</Button>
        </div>
      </div>
      
      <CallDetailsModal 
        open={showDetailsModal} 
        onOpenChange={setShowDetailsModal} 
        conversation={selectedConversation} 
      />
    </FadeIn>
  );
}

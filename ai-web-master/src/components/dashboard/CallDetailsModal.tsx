import { useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Calendar, Clock, MessageSquare, User, DollarSign } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useConversationDetails } from "@/hooks/useConversationDetails";
import { Separator } from "@/components/ui/separator";

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

interface CallDetailsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversation: Conversation | null;
}

export function CallDetailsModal({ open, onOpenChange, conversation }: CallDetailsModalProps) {
  const { data, isLoading, error } = useConversationDetails(
    open ? conversation?.conversation_id || null : null
  );

  // Schließe den Modal, wenn ein Fehler auftritt
  useEffect(() => {
    if (error) {
      onOpenChange(false);
    }
  }, [error, onOpenChange]);

  if (!conversation) return null;

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Konversationsdetails</DialogTitle>
          <DialogDescription>
            Details zur Konversation mit {conversation.agent_name || "Agent"}
          </DialogDescription>
        </DialogHeader>
        
        {isLoading ? (
          <div className="py-8 text-center">
            <p className="text-muted-foreground">Lade Konversationsdetails...</p>
          </div>
        ) : (
          <div className="grid gap-4 py-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <User className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="text-lg font-medium">{conversation.agent_name || "Unbekannter Agent"}</h3>
                <p className="text-sm text-muted-foreground">ID: {conversation.conversation_id}</p>
              </div>
              <Badge 
                variant={getStatusVariant(conversation.status, conversation.call_successful)}
                className="ml-auto"
              >
                {conversation.status === "done" ? "Abgeschlossen" : 
                 conversation.status === "processing" ? "In Bearbeitung" : conversation.status}
              </Badge>
            </div>
            
            <div className="grid grid-cols-2 gap-4 bg-secondary/20 p-4 rounded-lg">
              <div className="flex flex-col gap-1">
                <div className="text-sm text-muted-foreground flex items-center gap-2">
                  <Calendar className="h-4 w-4" /> Datum & Zeit
                </div>
                <div className="font-medium">{formatDate(conversation.start_time_unix_secs)}</div>
              </div>
              
              <div className="flex flex-col gap-1">
                <div className="text-sm text-muted-foreground flex items-center gap-2">
                  <Clock className="h-4 w-4" /> Dauer
                </div>
                <div className="font-medium">{formatDuration(conversation.call_duration_secs)}</div>
              </div>
              
              <div className="flex flex-col gap-1">
                <div className="text-sm text-muted-foreground flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" /> Nachrichten
                </div>
                <div className="font-medium">{conversation.message_count}</div>
              </div>
              
              {data?.metadata?.cost && (
                <div className="flex flex-col gap-1">
                  <div className="text-sm text-muted-foreground flex items-center gap-2">
                    <DollarSign className="h-4 w-4" /> Kosten
                  </div>
                  <div className="font-medium">{data.metadata.cost} Credits</div>
                </div>
              )}
            </div>
            
            {data?.analysis?.transcript_summary && (
              <div className="mt-2">
                <h4 className="text-sm font-medium mb-2">Zusammenfassung</h4>
                <p className="text-sm text-muted-foreground bg-secondary/10 p-3 rounded-md">
                  {data.analysis.transcript_summary}
                </p>
              </div>
            )}
            
            {data?.transcript && data.transcript.length > 0 && (
              <div className="mt-2">
                <h4 className="text-sm font-medium mb-2">Transkript</h4>
                <div className="border rounded-md divide-y">
                  {data.transcript.map((entry, index) => (
                    <div key={index} className="p-3">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs font-medium">
                          {entry.role === "agent" ? "Agent" : "Kunde"}
                        </span>
                        {entry.time_in_call_secs !== undefined && (
                          <span className="text-xs text-muted-foreground">
                            {formatDuration(entry.time_in_call_secs)}
                          </span>
                        )}
                      </div>
                      <p className="text-sm">{entry.message}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Schließen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { useState, useEffect, useMemo } from 'react';

// Create a singleton WebSocket instance that persists outside of component lifecycle
export let sharedWebSocket: WebSocket | null = null;
let connectionCount = 0;

export function useWebSocket<T>(action: string, dataKey: string) {
  const [data, setData] = useState<T>([] as unknown as T);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const memoizedAction = useMemo(() => action, [action]);
  const memoizedDataKey = useMemo(() => dataKey, [dataKey]);

  useEffect(() => {
    // Initialize WebSocket if it doesn't exist or is closed
    if (!sharedWebSocket || sharedWebSocket.readyState === WebSocket.CLOSED) {
      sharedWebSocket = new WebSocket("wss://dev.dial24.net/ai");
      
      sharedWebSocket.onopen = () => {
        // The connection is now open
        console.log("WebSocket connection established");
      };
    }

    // Increment connection counter
    connectionCount++;
    
    setIsLoading(true);
    setError(null);

    // Handler for incoming messages
    const handleMessage = (event: MessageEvent) => {
      try {
        const receivedData = JSON.parse(event.data);
        console.log("Received WebSocket data:", receivedData);
        
        if (receivedData.status === "connected") {
          sharedWebSocket?.send(JSON.stringify({ action: action }));
        }
        
        // Überprüfen, ob es sich um eine Antwort auf unsere Aktion handelt
        if (receivedData.status === action) {
          console.log(`Received data for action: ${action}`);
          
          // Für showChannels-Aktion: Direkt das message-Array verwenden
          if (action === "showChannels" && Array.isArray(receivedData.message)) {
            console.log("Setting showChannels data:", receivedData.message);
            setData(receivedData.message);
            setError(null);
          } 
          // Für andere Aktionen: Versuchen, auf das angegebene Feld zuzugreifen
          else if (receivedData.message) {
            const response: T = receivedData.message;
            console.log(`Accessing data via key '${String(dataKey)}':`, response[dataKey]);
            setData(response[dataKey]);
            setError(null);
          }
        }
      } catch (parseError) {
        console.error("Error parsing JSON response:", parseError);
        setError("Fehler beim Verarbeiten der Daten.");
      } finally {
        setIsLoading(false);
      }
    };

    // Handler for errors
    const handleError = (error: Event) => {
      console.error("WebSocket error:", error);
      setError("Fehler beim Laden der Daten. Bitte versuchen Sie es später erneut.");
      setIsLoading(false);
    };

    // Handler for connection close
    const handleClose = (event: CloseEvent) => {
      console.log("WebSocket connection closed:", event.code, event.reason);
      setIsLoading(false);
      sharedWebSocket = null;
    };

    // Add event listeners
    sharedWebSocket.addEventListener('message', handleMessage);
    sharedWebSocket.addEventListener('error', handleError);
    sharedWebSocket.addEventListener('close', handleClose);

    // If connection is already open, send the action right away
    if (sharedWebSocket.readyState === WebSocket.OPEN) {
      sharedWebSocket.send(JSON.stringify({ action: action }));
    }

    // Cleanup function that removes event listeners but doesn't close the connection
    return () => {
      sharedWebSocket?.removeEventListener('message', handleMessage);
      sharedWebSocket?.removeEventListener('error', handleError);
      sharedWebSocket?.removeEventListener('close', handleClose);
      
      // Decrement connection counter
      connectionCount--;
      
      // Only close the WebSocket if no components are using it
      if (connectionCount === 0 && sharedWebSocket) {
        console.log("Closing WebSocket as no components are using it");
        sharedWebSocket.close();
        sharedWebSocket = null;
      }
    };
  }, [memoizedAction, memoizedDataKey]);

  return { data, isLoading, error };
}

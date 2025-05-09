import React, { createContext, useState, useEffect, useContext } from 'react';

interface WebSocketContextProps {
  sendMessage: (message: string) => void;
  message: string | null;
}

const WebSocketContext = createContext<WebSocketContextProps | undefined>(undefined);

interface WebSocketProviderProps {
  children: React.ReactNode;
}

const WebSocketProvider: React.FC<WebSocketProviderProps> = ({ children }) => {
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const ws = new WebSocket('wss://dev.dial24.net/ai');

    ws.onopen = () => {
      console.log('WebSocket connected');
      setSocket(ws);
    };

    ws.onmessage = (event) => {
      setMessage(event.data);
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
      setSocket(null);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    return () => {
      ws.close();
    };
  }, []);

  const sendMessage = (message: string) => {
    if (socket) {
      socket.send(message);
    } else {
      console.log('WebSocket not connected');
    }
  };

  return (
    <WebSocketContext.Provider value={{ sendMessage, message }}>
      {children}
    </WebSocketContext.Provider>
  );
};

const useWebSocket = () => {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
};

export { WebSocketProvider, useWebSocket };

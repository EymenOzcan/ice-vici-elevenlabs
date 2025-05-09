import { FadeIn } from "@/components/animations/FadeIn";
import { CallsList } from "@/components/dashboard/CallsList";
import { CallMetrics } from "@/components/dashboard/CallMetrics";
import { CallPlayer } from "@/components/dashboard/CallPlayer";
import { Header } from "@/components/dashboard/Header";
import { PerformanceChart } from "@/components/dashboard/PerformanceChart";
import { SettingsPanel } from "@/components/dashboard/SettingsPanel";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { AgentsCard } from "@/components/dashboard/AgentsCard";
import { ActiveCallsCard } from "@/components/dashboard/ActiveCallsCard";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import { WebSocketProvider } from "@/contexts/WebSocketContext";

const Index = () => {
  const [showSidebar, setShowSidebar] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  
  useEffect(() => {
    const checkIsMobile = () => {
      setIsMobile(window.innerWidth < 768);
      setShowSidebar(window.innerWidth >= 768);
    };
    
    checkIsMobile();
    window.addEventListener('resize', checkIsMobile);
    
    return () => {
      window.removeEventListener('resize', checkIsMobile);
    };
  }, []);
  
  const toggleSidebar = () => {
    setShowSidebar(!showSidebar);
  };
  
  return (
    <WebSocketProvider>
      <div className="min-h-screen flex flex-col">
        <Header onMenuClick={toggleSidebar} />
        
        <div className="flex flex-1 overflow-hidden">
          {showSidebar && <Sidebar onClose={() => isMobile && setShowSidebar(false)} />}
          
          <main className="flex-1 overflow-y-auto p-4 md:p-6">
            <FadeIn>
              <h2 className="text-xl md:text-2xl font-semibold mb-4 md:mb-6">Dashboard Overview</h2>
            </FadeIn>
            
            <CallMetrics />
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6 mt-4 md:mt-6">
              <AgentsCard />
              <ActiveCallsCard />
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6 mt-4 md:mt-6">
              <PerformanceChart />
              <CallsList />
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6 mt-4 md:mt-6">
              <div className="grid grid-cols-1 gap-4 md:gap-6">
                <CallPlayer />
                <SettingsPanel />
              </div>
            </div>
          </main>
        </div>
      </div>
    </WebSocketProvider>
  );
}

export default Index;

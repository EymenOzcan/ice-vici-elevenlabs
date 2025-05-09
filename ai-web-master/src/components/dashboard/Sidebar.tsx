
import { FadeIn } from "@/components/animations/FadeIn";
import { cn } from "@/lib/utils";
import { 
  BarChart2, 
  Calendar, 
  Headphones, 
  Home, 
  MessageSquare, 
  Mic, 
  PhoneCall, 
  Settings, 
  Users,
  X
} from "lucide-react";
import { useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";

const navItems = [
  { icon: Home, label: "Dashboard", path: "/" },
  { icon: PhoneCall, label: "Calls", path: "/calls" },
  { icon: Mic, label: "Agents", path: "/agents" },
  { icon: Users, label: "Customers", path: "/customers" },
  { icon: MessageSquare, label: "Scripts", path: "/scripts" },
  { icon: BarChart2, label: "Analytics", path: "/analytics" },
  { icon: Calendar, label: "Scheduling", path: "/scheduling" },
  { icon: Headphones, label: "Training", path: "/training" },
];

interface SidebarProps {
  onClose?: () => void;
}

export function Sidebar({ onClose }: SidebarProps) {
  const location = useLocation();
  
  return (
    <div className="fixed inset-y-0 left-0 w-64 border-r h-screen py-4 md:py-6 px-3 overflow-y-auto bg-background md:static z-40 transition-all duration-300 md:h-[calc(100vh-4rem)]">
      {/* Mobile close button */}
      <div className="flex justify-end md:hidden mb-2">
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-8 w-8" 
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      
      <FadeIn delay={0.1}>
        <div className="space-y-1">
          {navItems.map((item, index) => (
            <FadeIn key={item.path} delay={0.05 * (index + 1)} direction="right">
              <a 
                href={item.path}
                className={cn(
                  "nav-item",
                  location.pathname === item.path && "active"
                )}
              >
                <item.icon className="w-5 h-5" />
                <span>{item.label}</span>
              </a>
            </FadeIn>
          ))}
        </div>
      </FadeIn>
      
      <FadeIn delay={0.5}>
        <div className="mt-auto pt-6 border-t mt-6">
          <a href="/settings" className="nav-item">
            <Settings className="w-5 h-5" />
            <span>Settings</span>
          </a>
        </div>
      </FadeIn>
    </div>
  );
}

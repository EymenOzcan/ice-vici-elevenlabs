
import { FadeIn } from "@/components/animations/FadeIn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { 
  BellRing, 
  Headphones, 
  Languages, 
  Mic, 
  Settings, 
  Sliders, 
  Volume 
} from "lucide-react";

const settingsItems = [
  {
    icon: BellRing,
    title: "Notifications",
    description: "Control alert preferences",
    action: "switch",
    active: true
  },
  {
    icon: Volume,
    title: "Voice Settings",
    description: "Adjust AI voice properties",
    action: "button",
    badge: "New"
  },
  {
    icon: Languages,
    title: "Language Support",
    description: "Manage supported languages",
    action: "button"
  },
  {
    icon: Sliders,
    title: "Response Time",
    description: "Set agent response delay",
    action: "switch",
    active: true
  }
];

export function SettingsPanel() {
  return (
    <FadeIn delay={0.5}>
      <div className="glass-card">
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings className="h-4 w-4 text-primary" />
            <h3 className="text-lg font-medium">Quick Settings</h3>
          </div>
          <Button variant="ghost" size="sm">View All</Button>
        </div>
        
        <div className="divide-y divide-border">
          {settingsItems.map((item, index) => (
            <FadeIn key={index} delay={0.1 * (index + 1)}>
              <div className="px-5 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <item.icon className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium">{item.title}</h4>
                      {item.badge && <Badge variant="info" size="sm">{item.badge}</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">{item.description}</p>
                  </div>
                </div>
                
                {item.action === "switch" ? (
                  <Switch checked={item.active} />
                ) : (
                  <Button variant="ghost" size="sm">Configure</Button>
                )}
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </FadeIn>
  );
}

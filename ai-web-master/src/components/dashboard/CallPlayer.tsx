
import { FadeIn } from "@/components/animations/FadeIn";
import { 
  ChevronLeft, 
  ChevronRight, 
  Pause, 
  Play, 
  Volume2 
} from "lucide-react";
import { useState } from "react";

export function CallPlayer() {
  const [isPlaying, setIsPlaying] = useState(false);
  
  return (
    <FadeIn delay={0.4}>
      <div className="glass-card p-5">
        <h3 className="text-lg font-medium mb-4">Last Call Recording</h3>
        
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-medium">David Kim</h4>
              <p className="text-sm text-muted-foreground">Product Information</p>
            </div>
            <div className="text-sm text-right">
              <div className="font-medium">08:10</div>
              <div className="text-muted-foreground">Yesterday, 11:20 AM</div>
            </div>
          </div>
          
          <div>
            <div className="relative w-full h-12 bg-secondary/50 rounded-lg overflow-hidden">
              <div 
                className="absolute h-full bg-primary/20 transition-all duration-300"
                style={{ width: "35%" }}
              />
              <div 
                className="absolute w-1.5 h-full bg-primary"
                style={{ left: "35%" }}
              />
              
              {/* Waveform visualization (simplified) */}
              <div className="absolute inset-0 flex items-center justify-around px-4 pointer-events-none">
                {Array.from({ length: 50 }).map((_, i) => (
                  <div 
                    key={i}
                    className="w-0.5 bg-primary/40 rounded-full"
                    style={{ 
                      height: `${Math.sin(i * 0.5) * 30 + 40}%`,
                      opacity: i < 18 ? 0.8 : 0.2
                    }}
                  />
                ))}
              </div>
            </div>
            
            <div className="flex items-center justify-between mt-3">
              <span className="text-xs text-muted-foreground">02:51</span>
              <div className="flex items-center gap-2">
                <button className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button 
                  className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center shadow-md hover:bg-primary/90 transition-colors"
                  onClick={() => setIsPlaying(!isPlaying)}
                >
                  {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
                </button>
                <button className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
              <span className="text-xs text-muted-foreground">08:10</span>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Volume2 className="h-4 w-4 text-muted-foreground" />
            <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
              <div className="h-full bg-primary w-3/4" />
            </div>
          </div>
        </div>
      </div>
    </FadeIn>
  );
}

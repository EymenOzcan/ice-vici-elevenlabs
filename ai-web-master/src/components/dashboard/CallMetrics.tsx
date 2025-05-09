
import { FadeIn } from "@/components/animations/FadeIn";
import { cn } from "@/lib/utils";
import { 
  Clock, 
  PhoneCall, 
  PhoneMissed, 
  TrendingDown, 
  TrendingUp, 
  UserCheck
} from "lucide-react";

interface MetricCardProps {
  title: string;
  value: string;
  icon: React.ElementType;
  trend?: "up" | "down" | "neutral";
  trendValue?: string;
  delay?: number;
}

function MetricCard({ 
  title, 
  value, 
  icon: Icon, 
  trend, 
  trendValue,
  delay = 0
}: MetricCardProps) {
  return (
    <FadeIn delay={delay} direction="up">
      <div className="glass-card p-3 md:p-5 flex flex-col gap-2">
        <div className="flex justify-between items-start">
          <p className="text-xs md:text-sm font-medium text-muted-foreground">{title}</p>
          <div className="p-1.5 md:p-2 rounded-full bg-primary/10">
            <Icon className="h-3 w-3 md:h-4 md:w-4 text-primary" />
          </div>
        </div>
        <div className="mt-1">
          <h3 className="text-lg md:text-2xl font-semibold">{value}</h3>
          {trend && trendValue && (
            <div className="flex items-center mt-1 md:mt-1.5 text-xs">
              {trend === "up" ? (
                <>
                  <TrendingUp className="h-3 w-3 mr-1 text-green-500" />
                  <span className="text-green-500">{trendValue} increase</span>
                </>
              ) : trend === "down" ? (
                <>
                  <TrendingDown className="h-3 w-3 mr-1 text-red-500" />
                  <span className="text-red-500">{trendValue} decrease</span>
                </>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </FadeIn>
  );
}

export function CallMetrics() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-5">
      <MetricCard
        title="Total Calls"
        value="1,284"
        icon={PhoneCall}
        trend="up"
        trendValue="12%"
        delay={0.1}
      />
      <MetricCard
        title="Avg. Duration"
        value="4:32"
        icon={Clock}
        trend="down"
        trendValue="5%"
        delay={0.2}
      />
      <MetricCard
        title="Resolution Rate"
        value="78%"
        icon={UserCheck}
        trend="up"
        trendValue="3%"
        delay={0.3}
      />
      <MetricCard
        title="Missed Calls"
        value="24"
        icon={PhoneMissed}
        trend="down"
        trendValue="8%"
        delay={0.4}
      />
    </div>
  );
}

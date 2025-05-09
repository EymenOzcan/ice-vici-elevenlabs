
import { FadeIn } from "@/components/animations/FadeIn";
import { useEffect, useState } from "react";
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip 
} from "recharts";

// Sample data
const generateData = () => {
  const today = new Date();
  const data = [];
  
  for (let i = 6; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    
    data.push({
      date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      calls: Math.floor(Math.random() * 50) + 100,
      duration: Math.floor(Math.random() * 30) + 150,
      resolution: Math.floor(Math.random() * 20) + 70,
    });
  }
  
  return data;
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="glass-panel p-3 rounded-lg shadow-lg border">
        <p className="font-medium">{label}</p>
        <p className="text-sm text-blue-500">{`Calls: ${payload[0].value}`}</p>
        <p className="text-sm text-purple-500">{`Avg Duration: ${payload[1].value}s`}</p>
        <p className="text-sm text-teal-500">{`Resolution Rate: ${payload[2].value}%`}</p>
      </div>
    );
  }

  return null;
};

export function PerformanceChart() {
  const [data, setData] = useState<any[]>([]);
  
  useEffect(() => {
    setData(generateData());
  }, []);
  
  return (
    <FadeIn delay={0.3}>
      <div className="glass-card p-3 md:p-5">
        <h3 className="text-base md:text-lg font-medium mb-3 md:mb-5">Weekly Performance</h3>
        <div className="h-60 md:h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={data}
              margin={{ top: 10, right: 5, left: -10, bottom: 0 }}
            >
              <defs>
                <linearGradient id="colorCalls" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorDuration" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorResolution" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#14b8a6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#14b8a6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
              <XAxis 
                dataKey="date" 
                tick={{ fontSize: 10 }} 
                tickLine={false}
                axisLine={{ stroke: 'rgba(0,0,0,0.1)' }}
                tickFormatter={(value) => {
                  // On small screens, show shorter date format
                  return window.innerWidth < 640 
                    ? value.split(' ')[0] // Just show month
                    : value;
                }}
              />
              <YAxis 
                tick={{ fontSize: 10 }} 
                tickLine={false} 
                axisLine={false}
                tickFormatter={(value) => `${value}`}
                width={20}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="calls"
                stroke="#2563eb"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorCalls)"
              />
              <Area
                type="monotone"
                dataKey="duration"
                stroke="#8b5cf6"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorDuration)"
              />
              <Area
                type="monotone"
                dataKey="resolution"
                stroke="#14b8a6"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorResolution)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </FadeIn>
  );
}

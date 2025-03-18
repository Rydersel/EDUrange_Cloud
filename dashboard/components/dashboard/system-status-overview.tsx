'use client';

import React, { useEffect, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

// Define the type for our data
interface SystemStatusData {
  time: string;
  ingressHealth: number;
  dbApiHealth: number;
  dbSyncHealth: number;
}

// Custom tooltip component for a more minimal look
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-background border border-border rounded-md shadow-sm p-2 text-xs">
        <p className="font-medium text-foreground">{`${label}`}</p>
        {payload.map((entry: any, index: number) => (
          <p key={`item-${index}`} style={{ color: entry.color }}>
            {`${entry.name}: ${entry.value}%`}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

export function SystemStatusOverview() {
  const [data, setData] = useState<SystemStatusData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const response = await fetch('/api/system-health/history?type=status&period=24h');
        
        if (!response.ok) {
          throw new Error('Failed to fetch system status data');
        }
        
        const result = await response.json();
        
        // Check if the result is an array of data points
        if (Array.isArray(result)) {
          setData(result);
        } else {
          console.error('Unexpected data format:', result);
          throw new Error('Unexpected data format');
        }
      } catch (err) {
        console.error('Error fetching system status data:', err);
        setError('Failed to load system status data');
        // Generate fallback data
        setData(generateFallbackData());
      } finally {
        setLoading(false);
      }
    }

    fetchData();
    
    // Set up polling every 30 seconds (reduced from 5 minutes)
    const intervalId = setInterval(fetchData, 30 * 1000);
    
    return () => clearInterval(intervalId);
  }, []);

  // Generate fallback data if API call fails
  const generateFallbackData = (): SystemStatusData[] => {
    const now = new Date();
    const data: SystemStatusData[] = [];
    
    for (let i = 24; i >= 0; i--) {
      const time = new Date(now.getTime() - i * 3600000);
      const timeStr = `${time.getHours()}:00`;
      
      data.push({
        time: timeStr,
        ingressHealth: 0,
        dbApiHealth: 0,
        dbSyncHealth: 0,
      });
    }
    
    return data;
  };

  if (loading && data.length === 0) {
    return <div className="flex items-center justify-center h-[300px]">Loading system status data...</div>;
  }

  if (error && data.length === 0) {
    return <div className="flex items-center justify-center h-[300px] text-red-500">{error}</div>;
  }

  return (
    <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{
            top: 5,
            right: 30,
            left: 20,
            bottom: 5,
          }}
        >
          <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
          <XAxis 
            dataKey="time" 
            stroke="#888888" 
            fontSize={12} 
            tickLine={false} 
            axisLine={false}
          />
          <YAxis 
            stroke="#888888" 
            fontSize={12} 
            tickLine={false} 
            axisLine={false}
            domain={[0, 100]}
            label={{ value: 'Health (%)', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle' } }}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend />
          <Line
            type="monotone"
            dataKey="ingressHealth"
            name="Instance Manager"
            stroke="#8884d8"
            activeDot={{ r: 6 }}
            strokeWidth={2}
          />
          <Line 
            type="monotone" 
            dataKey="dbApiHealth" 
            name="Database API"
            stroke="#82ca9d" 
            strokeWidth={2}
          />
          <Line 
            type="monotone" 
            dataKey="dbSyncHealth" 
            name="Database Sync"
            stroke="#ffc658" 
            strokeWidth={2}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
} 
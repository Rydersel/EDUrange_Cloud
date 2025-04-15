'use client';

import React, { useEffect, useState } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Legend,
  Tooltip
} from 'recharts';

// Custom tooltip component for a more minimal look
const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-background border border-border rounded-md shadow-sm p-2 text-xs">
        <p className="font-medium text-foreground">{payload[0].name}</p>
        <p style={{ color: payload[0].color || payload[0].fill }}>
          {`${payload[0].value}%`}
        </p>
      </div>
    );
  }
  return null;
};

export function CPUUsagePieChart() {
  const [cpuData, setCpuData] = useState<{ name: string; value: number; color: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const response = await fetch('/api/system-health/current');
        
        if (!response.ok) {
          throw new Error('Failed to fetch current CPU usage data');
        }
        
        const result = await response.json();
        console.log('CPU Usage Data:', result);
        
        if (result && typeof result.cpu === 'number') {
          // The monitoring service returns CPU usage as a percentage value already
          // We just need to ensure it's a valid number between 0 and 100
          let cpuUsage = result.cpu;
          
          // Ensure it's within valid range and rounded to an integer for display
          cpuUsage = Math.min(100, Math.max(0, Math.round(cpuUsage * 10) / 10));
          
          console.log('Processed CPU usage for pie chart:', cpuUsage);
          
          setCpuData([
            { name: 'Used', value: cpuUsage, color: '#8884d8' },
            { name: 'Free', value: 100 - cpuUsage, color: '#82ca9d' }
          ]);
        } else if (result.error) {
          throw new Error(result.error);
        } else {
          throw new Error('Invalid CPU usage data format');
        }
      } catch (err) {
        console.error('Error fetching CPU usage data:', err);
        setError('Failed to load CPU usage data');
        setCpuData([
          { name: 'Used', value: 0, color: '#8884d8' },
          { name: 'Free', value: 100, color: '#82ca9d' }
        ]);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
    
    // Set up polling every 30 seconds
    const intervalId = setInterval(fetchData, 30 * 1000);
    
    return () => clearInterval(intervalId);
  }, []);

  if (loading && cpuData.length === 0) {
    return <div className="flex items-center justify-center h-[250px]">Loading CPU usage data...</div>;
  }

  if (error && cpuData.length === 0) {
    return <div className="flex items-center justify-center h-[250px] text-muted-foreground">No data available</div>;
  }

  return (
    <div className="h-[250px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={cpuData}
            cx="50%"
            cy="50%"
            labelLine={false}
            outerRadius={80}
            fill="#8884d8"
            dataKey="value"
            label={({ name, percent }) => {
              // Only show label if segment is 5% or more
              return percent >= 0.05 ? `${name} ${(percent * 100).toFixed(0)}%` : '';
            }}
          >
            {cpuData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
} 
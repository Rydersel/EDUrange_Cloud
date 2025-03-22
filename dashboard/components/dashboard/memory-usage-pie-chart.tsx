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

export function MemoryUsagePieChart() {
  const [memoryData, setMemoryData] = useState<{ name: string; value: number; color: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const response = await fetch('/api/system-health/current');
        
        if (!response.ok) {
          throw new Error('Failed to fetch current memory usage data');
        }
        
        const result = await response.json();
        console.log('Memory Usage Data:', result);
        
        if (result && typeof result.memory === 'number') {
          // The monitoring service returns memory usage as a percentage value already
          // We just need to ensure it's a valid number between 0 and 100
          let memoryUsage = result.memory;
          
          // Ensure it's within valid range and round to 1 decimal place for display
          memoryUsage = Math.min(100, Math.max(0, Math.round(memoryUsage * 10) / 10));
          
          console.log('Processed memory usage for pie chart:', memoryUsage);
          
          setMemoryData([
            { name: 'Used', value: memoryUsage, color: '#8884d8' },
            { name: 'Free', value: 100 - memoryUsage, color: '#82ca9d' }
          ]);
        } else if (result.error) {
          throw new Error(result.error);
        } else {
          throw new Error('Invalid memory usage data format');
        }
      } catch (err) {
        console.error('Error fetching memory usage data:', err);
        setError('Failed to load memory usage data');
        setMemoryData([
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

  if (loading && memoryData.length === 0) {
    return <div className="flex items-center justify-center h-[250px]">Loading memory usage data...</div>;
  }

  if (error && memoryData.length === 0) {
    return <div className="flex items-center justify-center h-[250px] text-muted-foreground">No data available</div>;
  }

  return (
    <div className="h-[250px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={memoryData}
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
            {memoryData.map((entry, index) => (
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
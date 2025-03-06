'use client';

import React, { useEffect, useState } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Legend,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis
} from 'recharts';

interface DeployedChallengesChartProps {
  showDetails?: boolean;
  showByType?: boolean;
}

// Define types for our data
interface StatusData {
  name: string;
  value: number;
  color: string;
}

interface TypeData {
  name: string;
  value: number;
  color: string;
}

interface DetailedData {
  name: string;
  type: string;
  status: string;
  users: number;
}

// Custom tooltip component for a more minimal look
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-background border border-border rounded-md shadow-sm p-2 text-xs">
        <p className="font-medium text-foreground">{label ? `${label}` : payload[0].name}</p>
        {payload.map((entry: any, index: number) => (
          <p key={`item-${index}`} style={{ color: entry.color || entry.fill }}>
            {entry.name === payload[0].name ? 
              `Count: ${entry.value} instances` : 
              `${entry.name}: ${entry.value}`}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

export function DeployedChallengesChart({ 
  showDetails = false,
  showByType = false
}: DeployedChallengesChartProps) {
  const [statusData, setStatusData] = useState<StatusData[]>([]);
  const [typeData, setTypeData] = useState<TypeData[]>([]);
  const [detailedData, setDetailedData] = useState<DetailedData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [instanceManagerNotFound, setInstanceManagerNotFound] = useState(false);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const response = await fetch('/api/system-health/history?type=challenges');
        
        if (!response.ok) {
          if (response.status === 404) {
            setInstanceManagerNotFound(true);
            throw new Error('Instance manager not found');
          }
          throw new Error('Failed to fetch challenge data');
        }
        
        const result = await response.json();
        
        // Process the data for our different chart types
        if (result && result.length > 0) {
          // For status pie chart - use the latest data point
          const latestData = result[result.length - 1];
          
          // Map the API data to our chart format
          setStatusData([
            { name: 'Running', value: latestData.running || 0, color: '#10B981' },
            { name: 'Pending', value: latestData.pending || 0, color: '#F59E0B' },
            { name: 'Failed', value: latestData.failed || 0, color: '#EF4444' },
            { name: 'Completed', value: latestData.completed || 0, color: '#6366F1' }
          ]);
          
          // For type pie chart
          setTypeData([
            { name: 'Full OS', value: latestData.types?.fullOS || 0, color: '#8B5CF6' },
            { name: 'Web', value: latestData.types?.web || 0, color: '#EC4899' },
            { name: 'Metasploit', value: latestData.types?.metasploit || 0, color: '#14B8A6' }
          ]);
          
          // For detailed table/bar chart
          if (latestData.details) {
            setDetailedData(latestData.details);
          }
        } else {
          // If no data, set empty arrays instead of mock data
          setStatusData([]);
          setDetailedData([]);
          setTypeData([]);
        }
      } catch (err) {
        console.error('Error fetching challenge data:', err);
        setError('Failed to load challenge data');
        
        // Set empty arrays instead of mock data when there's an error
        setStatusData([]);
        setDetailedData([]);
        setTypeData([]);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
    
    // Set up polling every 30 seconds (reduced from 60 seconds)
    const intervalId = setInterval(fetchData, 30 * 1000);
    
    return () => clearInterval(intervalId);
  }, []);

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D'];

  if (loading) {
    return <div className="flex items-center justify-center h-[300px]">Loading challenge data...</div>;
  }

  if (error || instanceManagerNotFound) {
    return (
      <div className="flex flex-col items-center justify-center h-[300px]">
        <p className="text-red-500 mb-2">{instanceManagerNotFound ? 'Instance manager not found' : error}</p>
        <p className="text-sm text-muted-foreground">No challenge data available</p>
      </div>
    );
  }

  if (statusData.length === 0 && typeData.length === 0) {
    return (
      <div className="flex items-center justify-center h-[300px]">
        <p className="text-sm text-muted-foreground">No challenge data available</p>
      </div>
    );
  }

  if (showDetails) {
    if (detailedData.length === 0) {
      return (
        <div className="flex items-center justify-center h-[300px]">
          <p className="text-sm text-muted-foreground">No detailed challenge data available</p>
        </div>
      );
    }
    
    return (
      <div className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={detailedData}
            margin={{
              top: 20,
              right: 30,
              left: 20,
              bottom: 5,
            }}
          >
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Bar 
              dataKey="users" 
              fill="#8884d8" 
              name="Active Users"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  const data = showByType ? typeData : statusData;
  
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[300px]">
        <p className="text-sm text-muted-foreground">No challenge data available</p>
      </div>
    );
  }

  return (
    <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            labelLine={false}
            outerRadius={80}
            fill="#8884d8"
            dataKey="value"
            label={({ name, percent }) => {
              // Only show label if segment is 10% or more
              return percent >= 0.1 ? `${name} ${(percent * 100).toFixed(0)}%` : '';
            }}
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color || COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
} 
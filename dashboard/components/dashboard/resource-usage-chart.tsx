'use client';

import React, { useEffect, useState } from 'react';
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
  ReferenceLine
} from 'recharts';

interface ResourceUsageChartProps {
  resourceType: 'cpu' | 'memory' | 'network';
  showLegend?: boolean;
}

// Define types for our data
interface ResourceData {
  time: string;
  [key: string]: string | number;
}

// Custom tooltip component for a more minimal look
const CustomTooltip = ({ active, payload, label, formatter }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-background border border-border rounded-md shadow-sm p-2 text-xs">
        <p className="font-medium text-foreground">{`${label}`}</p>
        {payload.map((entry: any, index: number) => {
          const [value, name] = formatter(entry.value);
          return (
            <p key={`item-${index}`} style={{ color: entry.color }}>
              {`${entry.name}: ${value}`}
            </p>
          );
        })}
      </div>
    );
  }
  return null;
};

export function ResourceUsageChart({ resourceType, showLegend = true }: ResourceUsageChartProps) {
  const [data, setData] = useState<ResourceData[]>([]);
  const [currentTime, setCurrentTime] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const response = await fetch(`/api/system-health/history?type=${resourceType}&period=24h`);

        if (!response.ok) {
          throw new Error(`Failed to fetch ${resourceType} usage data`);
        }

        const result = await response.json();

        // Handle the new response format with current_time and data fields
        if (result && result.data && Array.isArray(result.data)) {
          // Sort data by time to ensure correct display
          const sortedData = [...result.data].sort((a, b) => {
            // Convert time strings to comparable values (assuming HH:MM format)
            const timeA = a.time.split(':').map(Number);
            const timeB = b.time.split(':').map(Number);

            // Compare hours first, then minutes
            if (timeA[0] !== timeB[0]) {
              return timeA[0] - timeB[0];
            }
            return timeA[1] - timeB[1];
          });

          setData(sortedData);
          setCurrentTime(result.current_time);
        } else if (Array.isArray(result)) {
          // For backward compatibility
          const sortedData = [...result].sort((a, b) => {
            const timeA = a.time.split(':').map(Number);
            const timeB = b.time.split(':').map(Number);

            if (timeA[0] !== timeB[0]) {
              return timeA[0] - timeB[0];
            }
            return timeA[1] - timeB[1];
          });

          setData(sortedData);
          setCurrentTime(null);
        } else {
          throw new Error(`Invalid response format for ${resourceType} usage data`);
        }
      } catch (err) {
        console.error(`Error fetching ${resourceType} usage data:`, err);

      } finally {
        setLoading(false);
      }
    }

    fetchData();

    // Set up polling every 30 seconds (reduced from 5 minutes)
    const intervalId = setInterval(fetchData, 30 * 1000);

    return () => clearInterval(intervalId);
  }, [resourceType]);



  const getChartConfig = () => {
    switch (resourceType) {
      case 'cpu':
        return {
          areas: [
            { dataKey: 'system', stroke: '#8884d8', fill: '#8884d8', fillOpacity: 0.3, name: 'System' },
            { dataKey: 'challenges', stroke: '#82ca9d', fill: '#82ca9d', fillOpacity: 0.3, name: 'Challenges' }
          ],
          yAxisLabel: 'CPU (%)',
          tooltipFormatter: (value: number) => [`${value}%`, 'Usage']
        };
      case 'memory':
        return {
          areas: [
            { dataKey: 'used', stroke: '#8884d8', fill: '#8884d8', fillOpacity: 0.3, name: 'Used' },
            { dataKey: 'available', stroke: '#82ca9d', fill: '#82ca9d', fillOpacity: 0.3, name: 'Available' }
          ],
          yAxisLabel: 'Memory (%)',
          tooltipFormatter: (value: number) => [`${value}%`, 'Usage']
        };
      case 'network':
        return {
          areas: [
            { dataKey: 'inbound', stroke: '#8884d8', fill: '#8884d8', fillOpacity: 0.3, name: 'Inbound' },
            { dataKey: 'outbound', stroke: '#82ca9d', fill: '#82ca9d', fillOpacity: 0.3, name: 'Outbound' }
          ],
          yAxisLabel: 'Traffic (MB/s)',
          tooltipFormatter: (value: number) => [`${value.toFixed(2)} MB/s`, 'Traffic']
        };
      default:
        return {
          areas: [],
          yAxisLabel: '',
          tooltipFormatter: (value: number) => [value, '']
        };
    }
  };

  const config = getChartConfig();

  if (loading && data.length === 0) {
    return <div className="flex items-center justify-center h-[300px]">Loading resource usage data...</div>;
  }

  if (error && data.length === 0) {
    return <div className="flex items-center justify-center h-[300px] text-red-500">{error}</div>;
  }

  return (
    <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{
            top: 10,
            right: 30,
            left: 0,
            bottom: 0,
          }}
        >
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
            tickFormatter={(value) => `${value}`}
            label={{ value: config.yAxisLabel, angle: -90, position: 'insideLeft', style: { textAnchor: 'middle' } }}
          />
          <Tooltip
            content={<CustomTooltip formatter={config.tooltipFormatter} />}
          />
          {showLegend && <Legend />}
          {config.areas.map((area, index) => (
            <Area
              key={index}
              type="monotone"
              dataKey={area.dataKey}
              stroke={area.stroke}
              fill={area.fill}
              fillOpacity={area.fillOpacity}
              name={area.name}
            />
          ))}

          {/* Add a reference line for the current time */}
          {currentTime && (
            <ReferenceLine
              x={currentTime}
              stroke="#ff0000"
              strokeDasharray="3 3"
              label={{
                value: 'Now',
                position: 'top',
                fill: '#ff0000',
                fontSize: 10
              }}
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

'use client';

import React, { useEffect, useState } from 'react';
import { Cpu, HardDrive, Server, Database } from 'lucide-react';

interface NodeSpec {
  cpuCores: number;
  cpuModel: string;
  memoryTotal: string;
  diskTotal: string;
  osType: string;
  hostname: string;
}

export function NodeSpecifications() {
  const [specs, setSpecs] = useState<NodeSpec | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const response = await fetch('/api/system-health/node-specs');

        if (!response.ok) {
          throw new Error('Failed to fetch node specifications');
        }

        const result = await response.json();

        if (result) {
          setSpecs({
            cpuCores: result.cpu_cores || 0,
            cpuModel: result.cpu_model || 'Unknown CPU',
            memoryTotal: result.memory_total || '0 GB',
            diskTotal: result.disk_total || '0 GB',
            osType: result.os_type || 'Unknown OS',
            hostname: result.hostname || 'Unknown Host'
          });
        } else {
          throw new Error('Invalid node specifications format');
        }
      } catch (err) {
        console.error('Error fetching node specifications:', err);
        setError('Failed to load node specifications');
        setSpecs(null);
      } finally {
        setLoading(false);
      }
    }

    fetchData();

    // Fetch once per hour as these specs rarely change
    const intervalId = setInterval(fetchData, 60 * 60 * 1000);

    return () => clearInterval(intervalId);
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center h-[250px]">Loading node specifications...</div>;
  }

  if (error || !specs) {
    return <div className="flex items-center justify-center h-[250px] text-muted-foreground">No data available</div>;
  }

  return (
    <div className="space-y-4 h-[250px] overflow-auto p-1">


      <div className="flex items-center space-x-2">
        <Cpu className="h-5 w-5 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium">CPU</p>
          <p className="text-xs text-muted-foreground">{specs.cpuModel}</p>
          <p className="text-xs text-muted-foreground">{specs.cpuCores} Cores</p>
        </div>
      </div>

      <div className="flex items-center space-x-2">
        <Database className="h-5 w-5 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium">Memory</p>
          <p className="text-xs text-muted-foreground">Total: {specs.memoryTotal}</p>
        </div>
      </div>

      <div className="flex items-center space-x-2">
        <HardDrive className="h-5 w-5 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium">Storage</p>
          <p className="text-xs text-muted-foreground">Total: {specs.diskTotal}</p>
        </div>
      </div>

      <div className="flex items-center space-x-2">
        <Server className="h-5 w-5 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium">Operating System</p>
          <p className="text-xs text-muted-foreground">{specs.osType}</p>
        </div>
      </div>
    </div>
  );
}

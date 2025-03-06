/**
 * Monitoring Service API Client
 * 
 * This module provides functions to interact with the monitoring service API
 * for retrieving real-time and historical metrics data.
 */

// Get the monitoring service URL from environment or use default
export function getMonitoringServiceUrl(): string {
  // In production, use the external URL from environment variable
  if (process.env.NODE_ENV === 'production') {
    return process.env.MONITORING_SERVICE_URL || 'https://eductf.rydersel.cloud/metrics';
  }
  
  // In development, use localhost with port forwarding
  return process.env.MONITORING_SERVICE_URL || 'http://localhost:5000';
}

/**
 * Fetch current metrics from the monitoring service
 */
export async function fetchCurrentMetrics() {
  try {
    const monitoringServiceUrl = getMonitoringServiceUrl();
    
    if (!monitoringServiceUrl) {
      console.error('Monitoring service URL is undefined');
      return null;
    }
    
    const response = await fetch(`${monitoringServiceUrl}/api/metrics/current`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
      next: { revalidate: 15 }, // Revalidate every 15 seconds
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch metrics: ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error fetching metrics from monitoring service:', error);
    return null;
  }
}

/**
 * Fetch historical metrics from the monitoring service
 * 
 * @param type - The type of metrics to fetch (cpu, memory, network, challenges)
 * @param period - The time period to fetch (24h, 7d, etc.)
 */
export async function fetchMetricsHistory(type: string, period: string = '24h') {
  try {
    const monitoringServiceUrl = getMonitoringServiceUrl();
    
    if (!monitoringServiceUrl) {
      console.error('Monitoring service URL is undefined');
      return null;
    }
    
    const response = await fetch(`${monitoringServiceUrl}/api/metrics/history?type=${type}&period=${period}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
      next: { revalidate: 60 }, // Revalidate every minute for historical data
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch metrics history: ${response.statusText}`);
    }
    
    const result = await response.json();
    
    // Handle the new response format that includes current_time and data fields
    if (result && result.data && Array.isArray(result.data)) {
      // Return the new format with current_time and data
      return result;
    } else if (Array.isArray(result)) {
      // For backward compatibility, if the result is an array, wrap it in the new format
      return {
        current_time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
        data: result
      };
    }
    
    return null;
  } catch (error) {
    console.error(`Error fetching ${type} metrics history from monitoring service:`, error);
    return null;
  }
}

/**
 * Generate mock metrics data for fallback when the monitoring service is unavailable
 */
export function generateMockMetrics() {
  return {
    cpu: {
      system: Math.floor(Math.random() * 30) + 10,
      challenges: Math.floor(Math.random() * 40) + 20,
      total: Math.floor(Math.random() * 70) + 30,
    },
    memory: {
      used: Math.floor(Math.random() * 40) + 30,
      available: Math.floor(Math.random() * 30) + 30,
      total_bytes: 8 * 1024 * 1024 * 1024, // 8 GB
      used_bytes: (Math.floor(Math.random() * 40) + 30) * 0.08 * 1024 * 1024 * 1024,
    },
    network: {
      inbound: Math.random() * 5,
      outbound: Math.random() * 3,
      total: Math.random() * 8,
    },
    challenges: {
      total: Math.floor(Math.random() * 20) + 10,
      running: Math.floor(Math.random() * 15) + 5,
      pending: Math.floor(Math.random() * 5),
      failed: Math.floor(Math.random() * 3),
    },
    timestamp: new Date().toISOString(),
  };
}

/**
 * Generate mock metrics history data for fallback when the monitoring service is unavailable
 */
export function generateMockMetricsHistory(type: string, period: string = '24h') {
  const now = new Date();
  const data = [];
  const hours = period === '24h' ? 24 : period === '7d' ? 168 : 24;
  const interval = period === '24h' ? 1 : period === '7d' ? 6 : 1;
  
  for (let i = hours; i >= 0; i -= interval) {
    const time = new Date(now.getTime() - i * 3600000);
    const timeStr = `${time.getHours()}:00`;
    
    if (type === 'cpu') {
      data.push({
        time: timeStr,
        system: Math.floor(Math.random() * 30) + 10,
        challenges: Math.floor(Math.random() * 40) + 20,
      });
    } else if (type === 'memory') {
      data.push({
        time: timeStr,
        used: Math.floor(Math.random() * 40) + 30,
        available: 100 - (Math.floor(Math.random() * 40) + 30),
      });
    } else if (type === 'network') {
      data.push({
        time: timeStr,
        inbound: Math.floor(Math.random() * 100) + 50,
        outbound: Math.floor(Math.random() * 80) + 20,
      });
    } else if (type === 'challenges') {
      data.push({
        time: timeStr,
        running: Math.floor(Math.random() * 15) + 5,
        pending: Math.floor(Math.random() * 5),
        failed: Math.floor(Math.random() * 3),
        total: Math.floor(Math.random() * 20) + 10,
      });
    }
  }
  
  // Return mock data in the new format with current_time
  return {
    current_time: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
    data: data
  };
} 
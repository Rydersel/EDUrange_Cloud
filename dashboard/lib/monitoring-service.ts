/**
 * Monitoring Service API Client
 * 
 * This module provides functions to interact with the monitoring service API
 * for retrieving real-time and historical metrics data.
 */

import { getMonitoringServiceUrl } from './api-config';

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
    
    console.log('Fetching metrics using Monitoring Service URL:', monitoringServiceUrl);
    
    // The monitoring service uses '/current' endpoint
    // The URL already contains /metrics, so just append /current to it
    const url = ensureEndpointUrl(monitoringServiceUrl, 'current');
    
    console.log('Fetching current metrics from:', url);
    
    const response = await fetch(url, {
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
 * Helper function to ensure the URL has the correct endpoint
 */
function ensureEndpointUrl(baseUrl: string, endpoint: string): string {
  // If URL ends with /metrics, append the endpoint (legacy support)
  if (baseUrl.endsWith('/metrics')) {
    return `${baseUrl}/${endpoint}`;
  }
  
  // If URL already includes the endpoint, return as is
  if (baseUrl.includes(`/${endpoint}`)) {
    return baseUrl;
  }
  
  // Make sure the URL ends with a slash if needed
  const normalizedUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  
  // Simply join the base URL and endpoint
  return `${normalizedUrl}${endpoint}`;
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
    
    console.log('Fetching metrics history using Monitoring Service URL:', monitoringServiceUrl);
    
    // The monitoring service uses '/history' endpoint for metrics history
    // and '/status-history' for system status history
    const endpoint = type === 'status' ? 'status-history' : 'history';
    const url = ensureEndpointUrl(monitoringServiceUrl, endpoint) + `?type=${type}&period=${period}`;
    
    console.log('Fetching metrics from:', url);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
      next: { revalidate: 60 }, // Revalidate every minute for historical data
    });
    
    if (!response.ok) {
      console.error(`Failed to fetch metrics history: ${response.status} ${response.statusText}`);
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
    
    console.log('No valid data returned from metrics history endpoint');
    return null;
  } catch (error) {
    console.error(`Error fetching ${type} metrics history from monitoring service:`, error);
    return null;
  }
}

/**
 * Generate default metrics data for fallback when the monitoring service is unavailable
 */
export function generateFallbackMetrics() {
  return {
    cpu: {
      system: 0,
      challenges: 0,
      total: 0,
    },
    memory: {
      used: 0,
      available: 0,
      total_bytes: 0,
      used_bytes: 0,
    },
    network: {
      inbound: 0,
      outbound: 0,
      total: 0,
    },
    challenges: {
      total: 0,
      running: 0,
      pending: 0,
      failed: 0,
    },
    timestamp: new Date().toISOString(),
  };
}

/**
 * Generate default metrics history data for fallback when the monitoring service is unavailable
 */
export function generateFallbackMetricsHistory(type: string, period: string = '24h') {
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
        system: 0,
        challenges: 0,
      });
    } else if (type === 'memory') {
      data.push({
        time: timeStr,
        used: 0,
        available: 0,
      });
    } else if (type === 'network') {
      data.push({
        time: timeStr,
        inbound: 0,
        outbound: 0,
      });
    } else if (type === 'challenges') {
      data.push({
        time: timeStr,
        running: 0,
        pending: 0,
        failed: 0,
        total: 0,
      });
    }
  }
  
  // Return fallback data in the new format with current_time
  return {
    current_time: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
    data: data
  };
}

/**
 * Fetch system status health history data from the monitoring service
 * 
 * @param period - The time period to fetch (24h, 7d, etc.)
 */
export async function fetchSystemStatusHistory(period: string = '24h') {
  try {
    const monitoringServiceUrl = getMonitoringServiceUrl();
    
    if (!monitoringServiceUrl) {
      console.error('Monitoring service URL is undefined');
      return null;
    }
    
    console.log('Fetching system status history using Monitoring Service URL:', monitoringServiceUrl);
    
    // The monitoring service uses '/status-history' endpoint
    const url = ensureEndpointUrl(monitoringServiceUrl, 'status-history') + `?period=${period}`;
    
    console.log('Fetching status history from:', url);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
      next: { revalidate: 60 }, // Revalidate every minute for historical data
    });
    
    if (!response.ok) {
      console.error(`Failed to fetch system status history: ${response.status} ${response.statusText}`);
      throw new Error(`Failed to fetch system status history: ${response.statusText}`);
    }
    
    const result = await response.json();
    
    // Handle the response format
    if (result && result.data && Array.isArray(result.data)) {
      return result.data;
    } else if (Array.isArray(result)) {
      return result;
    }
    
    console.log('No valid data returned from status history endpoint');
    return null;
  } catch (error) {
    console.error(`Error fetching system status history from monitoring service:`, error);
    return null;
  }
}

/**
 * Generate default system status health history data for fallback
 */
export function generateFallbackSystemStatusHistory(period: string = '24h') {
  const now = new Date();
  const data = [];
  const hours = period === '24h' ? 24 : period === '7d' ? 168 : 24;
  const interval = period === '24h' ? 1 : period === '7d' ? 6 : 1;
  
  // Generate random but realistic health values
  let ingressHealth = 95 + Math.random() * 5; // Start with high health (95-100%)
  let dbApiHealth = 90 + Math.random() * 10; // Start with high health (90-100%)
  let dbSyncHealth = 85 + Math.random() * 15; // Start with high health (85-100%)
  
  for (let i = hours; i >= 0; i -= interval) {
    const time = new Date(now.getTime() - i * 3600000);
    const timeStr = `${time.getHours()}:00`;
    
    // Add small random variations to simulate realistic health fluctuations
    ingressHealth = Math.min(100, Math.max(70, ingressHealth + (Math.random() * 6 - 3)));
    dbApiHealth = Math.min(100, Math.max(60, dbApiHealth + (Math.random() * 8 - 4)));
    dbSyncHealth = Math.min(100, Math.max(50, dbSyncHealth + (Math.random() * 10 - 5)));
    
    data.push({
      time: timeStr,
      ingressHealth: Math.round(ingressHealth),
      dbApiHealth: Math.round(dbApiHealth),
      dbSyncHealth: Math.round(dbSyncHealth),
    });
  }
  
  return data;
} 
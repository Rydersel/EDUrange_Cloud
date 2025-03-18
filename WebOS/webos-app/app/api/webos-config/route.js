import { NextResponse } from 'next/server';

/**
 * Consolidated API endpoint for WebOS configuration
 * This provides all necessary URLs and configuration values without exposing environment variables directly
 */
export async function GET(req) {
  // Get hostname from request for better debugging
  const hostname = req.headers.get('host') || 'unknown';
  const instanceId = hostname.split('.')[0];
  
  // Determine domain from environment variables with fallbacks
  const domainName = process.env.DOMAIN_NAME || process.env.NEXT_PUBLIC_DOMAIN_NAME || '';
  
  // Always use internal Kubernetes DNS names as these will not change between clusters
  const databaseApiUrl = `http://database-api-service.default.svc.cluster.local`;
  const instanceManagerUrl = `http://instance-manager.default.svc.cluster.local/api`;
  
  // Construct terminal URL based on instance ID and domain
  let terminalUrl = process.env.TERMINAL_URL;
  if (!terminalUrl && domainName && instanceId !== 'unknown') {
    terminalUrl = `https://terminal-${instanceId}.${domainName}`;
  }
  
  // Create proxy URLs for client-side use - use absolute URLs with the current host
  const protocol = req.headers.get('x-forwarded-proto') || 'https';
  const baseUrl = `${protocol}://${hostname}`;
  const databaseApiProxyUrl = `${baseUrl}/api/database-proxy`;
  const instanceManagerProxyUrl = `${baseUrl}/api/instance-manager-proxy`;
  
  // Construct response with all configuration values
  const config = {
    urls: {
      databaseApi: databaseApiUrl,
      instanceManager: instanceManagerUrl,
      databaseApiProxy: databaseApiProxyUrl,
      instanceManagerProxy: instanceManagerProxyUrl,
      terminal: terminalUrl,
    },
    challenge: {
      instanceId: instanceId !== 'unknown' ? instanceId : null,
    },
    system: {
      hostname: instanceId,
      domain: domainName,
    }
  };
  
  return NextResponse.json(config);
} 
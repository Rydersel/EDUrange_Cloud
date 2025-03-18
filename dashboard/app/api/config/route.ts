import { NextResponse } from 'next/server';
import { getClientConfig } from '@/lib/api-config';

/**
 * API endpoint to provide configuration to client components
 * This keeps sensitive environment variables on the server side
 * while still allowing client components to access necessary configuration
 */

export async function GET() {
  // Get client-safe configuration
  const config = getClientConfig();

  // Return the configuration as JSON
  return NextResponse.json(config);
}

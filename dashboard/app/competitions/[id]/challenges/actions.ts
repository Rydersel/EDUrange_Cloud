'use server';

import { headers } from 'next/headers';
import { cookies } from 'next/headers';

export async function terminateChallenge(instanceId: string): Promise<void> {
  try {
    const headersList = await headers();
    const protocol = process.env.NODE_ENV === 'development' ? 'http' : 'https';
    const host = headersList.get('host') || 'localhost:3000';
    const baseUrl = `${protocol}://${host}`;

    // Get the session token from cookies
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get('next-auth.session-token')?.value;

    const response = await fetch(`${baseUrl}/api/challenges/terminate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cookie": `next-auth.session-token=${sessionToken}`,
      },
      body: JSON.stringify({ instanceId }),
      credentials: 'include',
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to terminate challenge: ${error}`);
    }
  } catch (error) {
    console.error("Error terminating challenge:", error);
    throw error;
  }
} 
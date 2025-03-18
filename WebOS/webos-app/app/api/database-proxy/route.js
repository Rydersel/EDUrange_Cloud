import { NextResponse } from 'next/server';

// Function to get the database API URL with better fallbacks
const getDatabaseApiUrl = () => {
  // Always use internal Kubernetes DNS name for reliability inside pods
  const constructedUrl = `http://database-api-service.default.svc.cluster.local`;
  console.log('Using internal Kubernetes DNS name for database API:', constructedUrl);
  return constructedUrl;
};

/**
 * Proxy API endpoint for database API requests
 * This allows client-side code to make requests to the database API without CORS or mixed content issues
 */
export async function GET(req) {
  try {
    // Get the URL parameters from the request URL
    const url = new URL(req.url);
    const searchParams = url.searchParams;
    const path = searchParams.get('path') || '';
    const challengeInstanceId = searchParams.get('challenge_instance_id') || '';
    const challengeId = searchParams.get('challenge_id') || '';
    const userId = searchParams.get('user_id') || '';
    const groupChallengeId = searchParams.get('group_challenge_id') || '';
    const groupId = searchParams.get('group_id') || '';
    const questionId = searchParams.get('question_id') || '';

    // Construct the database API URL
    const databaseApiUrl = getDatabaseApiUrl();
    let apiUrl = `${databaseApiUrl}/${path}`;

    // Build query parameters
    const queryParams = new URLSearchParams();
    if (challengeInstanceId) {
      queryParams.append('challenge_instance_id', challengeInstanceId);
    }
    if (challengeId) {
      queryParams.append('challenge_id', challengeId);
    }
    if (userId) {
      queryParams.append('user_id', userId);
    }
    if (groupChallengeId) {
      queryParams.append('group_challenge_id', groupChallengeId);
    }
    if (groupId) {
      queryParams.append('group_id', groupId);
    }
    if (questionId) {
      queryParams.append('question_id', questionId);
    }

    // Add query parameters if any exist
    const queryString = queryParams.toString();
    if (queryString) {
      apiUrl += `?${queryString}`;
    }

    console.log(`Database proxy: Forwarding GET request to ${apiUrl}`);

    // Make the request to the database API
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Get the response data
    const data = await response.json();

    // Return the response
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Error in database proxy:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST method for database API requests
 * This allows client-side code to make POST requests to the database API without CORS or mixed content issues
 */
export async function POST(req) {
  try {
    // Get the URL parameters from the request URL
    const url = new URL(req.url);
    const searchParams = url.searchParams;
    const path = searchParams.get('path') || '';

    // Get the request body
    const body = await req.json();

    // Construct the database API URL
    const databaseApiUrl = getDatabaseApiUrl();
    const apiUrl = `${databaseApiUrl}/${path}`;

    console.log(`Database proxy: Forwarding POST request to ${apiUrl}`);

    // Make the request to the database API
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    // Get the response data
    const data = await response.json();

    // Return the response
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Error in database proxy POST:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

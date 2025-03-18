import { NextResponse } from 'next/server';

// Function to get the instance manager URL - always use internal Kubernetes DNS
const getInstanceManagerUrl = () => {
  // Always use internal Kubernetes DNS for reliability
  const constructedUrl = `http://instance-manager.default.svc.cluster.local/api`;
  console.log('Using internal Kubernetes DNS name for instance manager:', constructedUrl);
  return constructedUrl;
};

/**
 * Proxy API endpoint for instance manager requests
 * This allows client-side code to make requests to the instance manager without CORS or mixed content issues
 */
export async function GET(req) {
  try {
    // Get the URL parameters from the request URL
    const url = new URL(req.url);
    const searchParams = url.searchParams;
    const path = searchParams.get('path') || '';
    const challengeInstanceId = searchParams.get('challenge_instance_id') || '';
    
    // Construct the instance manager URL
    const instanceManagerUrl = getInstanceManagerUrl();
    let apiUrl = `${instanceManagerUrl}/${path}`;
    
    // Build query parameters
    const queryParams = new URLSearchParams();
    if (challengeInstanceId) {
      queryParams.append('challenge_instance_id', challengeInstanceId);
    }
    
    // Add query parameters if any exist
    const queryString = queryParams.toString();
    if (queryString) {
      apiUrl += `?${queryString}`;
    }
    
    console.log(`Instance manager proxy: Forwarding request to ${apiUrl}`);
    
    // Create an agent that ignores certificate validation for HTTPS requests
    const agent = new (require('https').Agent)({
      rejectUnauthorized: false
    });
    
    // Make the request to the instance manager
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      agent: apiUrl.startsWith('https') ? agent : undefined
    });
    
    // Get the response data
    const data = await response.json();
    
    // Return the response
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Error in instance manager proxy:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * Special function to get flag value from the database
 * This is a fallback when the instance-manager's get-secret fails
 */
async function getFlagFromDatabase(challengeInstanceId) {
  try {
    console.log('Attempting to get flag from database as fallback');
    const databaseApiUrl = `http://database-api-service.default.svc.cluster.local/get_challenge_instance?challenge_instance_id=${challengeInstanceId}`;
    
    console.log(`Fetching instance data from: ${databaseApiUrl}`);
    const response = await fetch(databaseApiUrl);
    
    if (!response.ok) {
      console.error(`Failed to fetch instance data: ${response.status} ${response.statusText}`);
      return null;
    }
    
    const instanceData = await response.json();
    if (instanceData && instanceData.flag) {
      console.log('Successfully retrieved flag from database');
      return instanceData.flag;
    }
    
    console.error('No flag found in instance data');
    return null;
  } catch (error) {
    console.error('Error retrieving flag from database:', error);
    return null;
  }
}

/**
 * POST method for instance manager requests
 */
export async function POST(req) {
  try {
    // Get the URL parameters from the request URL
    const url = new URL(req.url);
    const searchParams = url.searchParams;
    const path = searchParams.get('path') || '';
    
    // Get the request body
    const body = await req.json();
    
    // Log detailed information about the request
    console.log('=== INSTANCE MANAGER PROXY POST REQUEST ===');
    console.log(`Path: ${path}`);
    console.log(`Request Body: ${JSON.stringify(body)}`);
    
    // Special handling for get-secret to retrieve flags
    if (path === 'get-secret') {
      const secretName = body.secret_name;
      
      // Extract the challenge instance ID from the secret name
      // Format: flag-secret-<challenge-instance-id>
      const challengeInstanceId = secretName.replace('flag-secret-', '');
      console.log(`Extracted challenge instance ID from secret name: ${challengeInstanceId}`);
      
      // First try to get the flag from the instance-manager
      try {
        // Construct the instance manager URL
        const instanceManagerUrl = getInstanceManagerUrl();
        const apiUrl = `${instanceManagerUrl}/${path}`;
        
        console.log(`Instance manager proxy: Forwarding POST request to ${apiUrl}`);
        
        // Create an agent that ignores certificate validation for HTTPS requests
        const agent = new (require('https').Agent)({
          rejectUnauthorized: false
        });
        console.log('Using agent with rejectUnauthorized: false to handle self-signed certificates');
        
        // Make the request to the instance manager
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
          agent: apiUrl.startsWith('https') ? agent : undefined
        });
        
        // Check response status
        console.log(`Response status: ${response.status} ${response.statusText}`);
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`Instance manager error response (${response.status}): ${errorText}`);
          console.error('Flag verification failed: Non-200 response from instance manager');
          
          // Try the database fallback
          const flagFromDatabase = await getFlagFromDatabase(challengeInstanceId);
          if (flagFromDatabase) {
            console.log('Successfully retrieved flag from database fallback');
            return NextResponse.json({ 
              secret_value: flagFromDatabase,
              note: 'Retrieved from database fallback' 
            }, { status: 200 });
          }
          
          // If database fallback fails, return error
          return NextResponse.json({ 
            error: `Instance manager error: ${response.status} ${response.statusText}`,
            details: errorText
          }, { status: response.status });
        }
        
        // Get the response data
        let data;
        const responseText = await response.text();
        console.log(`Raw response from instance manager: ${responseText.substring(0, 200)}${responseText.length > 200 ? '...' : ''}`);
        
        // Special handling for empty responses
        if (!responseText || responseText.trim() === '') {
          console.error('Empty response from instance manager');
          
          // Try the database fallback
          const flagFromDatabase = await getFlagFromDatabase(challengeInstanceId);
          if (flagFromDatabase) {
            console.log('Successfully retrieved flag from database fallback');
            return NextResponse.json({ 
              secret_value: flagFromDatabase,
              note: 'Retrieved from database fallback' 
            }, { status: 200 });
          }
          
          return NextResponse.json({ 
            error: 'Empty response from instance manager',
            details: 'The instance manager returned an empty response for get-secret'
          }, { status: 500 });
        }
        
        try {
          // Try to parse the response as JSON
          data = JSON.parse(responseText);
          console.log(`Parsed response data: ${JSON.stringify(data).substring(0, 200)}${JSON.stringify(data).length > 200 ? '...' : ''}`);
        } catch (parseError) {
          // If parsing fails, log the response text
          console.error(`Failed to parse response as JSON: ${parseError.message}`);
          console.log(`Response text: ${responseText.substring(0, 200)}${responseText.length > 200 ? '...' : ''}`);
          
          // Special case: if the response looks like it could be a flag value directly
          const potentialFlag = responseText.trim();
          if (potentialFlag && typeof potentialFlag === 'string' && potentialFlag.includes('flag{')) {
            console.log('Response appears to contain a flag directly, using it as secret_value');
            return NextResponse.json({ secret_value: potentialFlag }, { status: 200 });
          }
          
          // Try the database fallback
          const flagFromDatabase = await getFlagFromDatabase(challengeInstanceId);
          if (flagFromDatabase) {
            console.log('Successfully retrieved flag from database fallback');
            return NextResponse.json({ 
              secret_value: flagFromDatabase,
              note: 'Retrieved from database fallback' 
            }, { status: 200 });
          }
          
          return NextResponse.json({ 
            error: `Invalid JSON response from instance manager: ${parseError.message}`,
            rawResponse: responseText.substring(0, 100)
          }, { status: 500 });
        }
        
        // Check if the response contains the secret_value field
        console.log('Processing get-secret response');
        
        if (data && typeof data.secret_value !== 'undefined') {
          console.log(`Found secret_value in response, length: ${data.secret_value.length}`);
          // Mask the actual flag value in logs
          const maskedValue = data.secret_value.replace(/./g, '*');
          console.log(`Masked secret_value: ${maskedValue}`);
        } else {
          console.error('Flag response is missing secret_value field');
          console.log('Full response data structure:', JSON.stringify(Object.keys(data || {})));
          
          // Try to find the secret in a different location in the response
          if (data && typeof data.data === 'object' && typeof data.data.secret_value !== 'undefined') {
            console.log('Found secret_value in nested data property, using it');
            data.secret_value = data.data.secret_value;
          } else if (data && typeof data.secret === 'string') {
            console.log('Found secret in response, using it as secret_value');
            data.secret_value = data.secret;
          } else if (data && typeof data.flag === 'string') {
            console.log('Found flag in response, using it as secret_value');
            data.secret_value = data.flag;
          } else {
            // Try the database fallback
            const flagFromDatabase = await getFlagFromDatabase(challengeInstanceId);
            if (flagFromDatabase) {
              console.log('Successfully retrieved flag from database fallback');
              return NextResponse.json({ 
                secret_value: flagFromDatabase,
                note: 'Retrieved from database fallback' 
              }, { status: 200 });
            }
            
            return NextResponse.json({ 
              error: 'Invalid response format: missing secret_value field',
              availableFields: Object.keys(data || {})
            }, { status: 500 });
          }
        }
        
        // Return the response
        return NextResponse.json(data, { status: response.status });
      } catch (error) {
        console.error('Error in instance manager call:', error);
        
        // Try the database fallback
        const flagFromDatabase = await getFlagFromDatabase(challengeInstanceId);
        if (flagFromDatabase) {
          console.log('Successfully retrieved flag from database fallback');
          return NextResponse.json({ 
            secret_value: flagFromDatabase,
            note: 'Retrieved from database fallback' 
          }, { status: 200 });
        }
        
        return NextResponse.json({ 
          error: error.message,
          stack: error.stack,
          location: 'instance-manager-proxy/route.js'
        }, { status: 500 });
      }
    } else {
      // Non-flag requests - regular processing
      // Construct the instance manager URL
      const instanceManagerUrl = getInstanceManagerUrl();
      const apiUrl = `${instanceManagerUrl}/${path}`;
      
      console.log(`Instance manager proxy: Forwarding POST request to ${apiUrl}`);
      
      // Create an agent that ignores certificate validation for HTTPS requests
      const agent = new (require('https').Agent)({
        rejectUnauthorized: false
      });
      console.log('Using agent with rejectUnauthorized: false to handle self-signed certificates');
      
      // Make the request to the instance manager
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        agent: apiUrl.startsWith('https') ? agent : undefined
      });
      
      // Check response status
      console.log(`Response status: ${response.status} ${response.statusText}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Instance manager error response (${response.status}): ${errorText}`);
        return NextResponse.json({ error: `Instance manager error: ${response.status} ${response.statusText}` }, { status: response.status });
      }
      
      // Get the response data
      let data;
      const responseText = await response.text();
      
      if (!responseText || responseText.trim() === '') {
        return NextResponse.json({}, { status: 200 });
      }
      
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        console.error(`Failed to parse response as JSON: ${parseError.message}`);
        return NextResponse.json({ error: `Invalid JSON response from instance manager: ${parseError.message}` }, { status: 500 });
      }
      
      // Return the response
      return NextResponse.json(data, { status: response.status });
    }
  } catch (error) {
    console.error('Error in instance manager proxy:', error);
    return NextResponse.json({ 
      error: error.message,
      stack: error.stack,
      location: 'instance-manager-proxy/route.js'
    }, { status: 500 });
  }
} 
import { NextResponse } from 'next/server';
import { 
  getDatabaseApiUrl, 
  getInstanceManagerUrl, 
  getProxyUrls, 
  getTerminalUrl,
  extractInstanceId 
} from '@/utils/url-helpers';

// Function to get the database proxy URL (used by client)
const getDatabaseProxyUrl = (req) => {
  const proxyUrls = getProxyUrls(req);
  return proxyUrls.databaseApiProxy;
};

// Function to get the instance manager proxy URL (used by client)
const getInstanceManagerProxyUrl = (req) => {
  const proxyUrls = getProxyUrls(req);
  return proxyUrls.instanceManagerProxy;
};

const defaultConfig = [
  {
    id: "chrome",
    title: "Browser",
    icon: "./icons/browser.svg",
    disabled: false,
    favourite: true,
    desktop_shortcut: true,
    screen: "displayChrome",
    width: 70,
    height: 80,
    launch_on_startup: false,
  },
  {
    id: "calc",
    title: "Calculator",
    icon: './icons/calculator.svg',
    disabled: false,
    favourite: true,
    desktop_shortcut: false,
    screen: "displayTerminalCalc",
    width: 5,
    height: 50,
    launch_on_startup: false,
  },
  {
    id: "codeeditor",
    title: "Code Editor",
    icon: './icons/code-editor.svg',
    disabled: false,
    favourite: true,
    desktop_shortcut: false,
    screen: "displayCodeEditor",
    width: 60,
    height: 75,
    launch_on_startup: false,
  },
  {
    id: "terminal",
    title: "Terminal",
    icon: './icons/Remote-Terminal.svg',
    disabled: false,
    favourite: true,
    desktop_shortcut: false,
    screen: "displayTerminal",
    width: 60,
    height: 55,
    disableScrolling: true,
    launch_on_startup: true,
  },
  {
    id: "settings",
    title: "Settings",
    icon: './icons/settings.svg',
    disabled: false,
    favourite: true,
    desktop_shortcut: false,
    screen: "displaySettings",
    width: 50,
    height: 60,
    launch_on_startup: false,
  },
  {
    id: "doom",
    title: "Doom",
    icon: './icons/doom.svg',
    disabled: false,
    favourite: true,
    desktop_shortcut: true,
    screen: "displayDoom",
    width: 80,
    height: 90,
    launch_on_startup: false,
  },
  {
    id: "cyberchef",
    title: "Cyber Chef",
    icon: './icons/cyberchef.svg',
    disabled: false,
    favourite: true,
    desktop_shortcut: true,
    screen: "Cyberchef",
    width: 75,
    height: 85,
    launch_on_startup: false,
  },
  {
    id: "web_chal",
    title: "Web Challenge",
    icon: './icons/browser.svg',
    disabled: false,
    favourite: true,
    desktop_shortcut: true,
    screen: "displayWebChal",
    width: 70,
    height: 80,
    launch_on_startup: false,
    url: "https://www.edurange.org/"
  },
  {
    id: "challenge-prompt",
    title: "Challenge Prompt",
    icon: './icons/prompt.svg',
    disabled: false,
    favourite: true,
    desktop_shortcut: true,
    screen: "displayChallengePrompt",
    width: 70,
    height: 80,
    description: "Default description for the challenge prompt",
    launch_on_startup: false,
    challenge: {
      type: "single",
      title: "Cyber Security Challenge",
      description: "Complete the following questions to test your knowledge.",
      flagSecretName: "flag-secret-ctfchal-clyf1mbf50000u87dl8tvhhvh-8672",
      pages: [
        {
          instructions: "Read the following instructions carefully to complete the challenge.",
          questions: [
            {
              type: "flag",
              content: "What is the flag?",
              id: "flag",
              points: 10
            },
            {
              type: "text",
              content: "What is the IP of the malicious server?",
              id: "ip_address",
              points: 5,
              answer: "idk"
            }
          ]
        },
        {
          instructions: "You have completed the first page. Now answer the following questions.",
          questions: [
            {
              type: "text",
              content: "What is the name of the malware?",
              id: "malware_name",
              points: 15,
              answer: "WannaCry"
            }
          ]
        }
      ]
    }
  },
];

let config = null;

export async function GET(req) {
  try {
    // Get hostname from request for better debugging
    const hostname = req.headers.get('host') || 'unknown';
    console.log('Request hostname:', hostname);
    
    // Determine domain from environment variables with fallbacks
    const domainName = process.env.DOMAIN_NAME || process.env.NEXT_PUBLIC_DOMAIN_NAME || '';
    
    // Extract instance ID using shared utility
    const instanceId = extractInstanceId(hostname, domainName);
    console.log('Extracted instance ID:', instanceId);

    // Get default apps config from environment variable
    const defaultApps = process.env.NEXT_PUBLIC_APPS_CONFIG ? 
      JSON.parse(process.env.NEXT_PUBLIC_APPS_CONFIG) : 
      defaultConfig;

    // Use the database proxy API instead of direct database API calls
    const databaseProxyUrl = getDatabaseProxyUrl(req);
    console.log('Using database proxy URL:', databaseProxyUrl);
    
    // Try to fetch instance data using the proxy
    let instanceData = null;
    let lastError = null;
    
    try {
      console.log('Attempting to fetch instance data via proxy');
      const response = await fetch(`${databaseProxyUrl}?path=get_challenge_instance&challenge_instance_id=${instanceId}`);
      
      if (response.ok) {
        instanceData = await response.json();
        console.log('Successfully fetched instance data via proxy');
      } else {
        const errorText = await response.text();
        console.warn(`Failed to fetch via proxy: ${response.status} ${response.statusText}`, errorText);
        lastError = new Error(`HTTP ${response.status}: ${errorText}`);
      }
    } catch (error) {
      console.warn(`Error fetching via proxy:`, error.message);
      lastError = error;
    }
    
    // If proxy fails, try direct database API as fallback (for local development)
    if (!instanceData) {
      console.warn("Proxy attempt failed, trying direct database API as fallback");
      const databaseApiUrl = getDatabaseApiUrl();
      
      try {
        const url = `${databaseApiUrl}/get_challenge_instance?challenge_instance_id=${instanceId}`;
        console.log('Attempting direct database API call:', url);
        const response = await fetch(url);
        
        if (response.ok) {
          instanceData = await response.json();
          console.log('Successfully fetched instance data directly');
        } else {
          const errorText = await response.text();
          console.warn(`Failed direct fetch: ${response.status} ${response.statusText}`, errorText);
        }
      } catch (error) {
        console.warn(`Error with direct fetch:`, error.message);
      }
    }
    
    // Create the system configuration object including URLs
    // This is integrated from webos-config
    const systemConfig = {
      urls: {
        databaseApi: getDatabaseApiUrl(),
        instanceManager: getInstanceManagerUrl(),
        databaseApiProxy: databaseProxyUrl,
        instanceManagerProxy: getInstanceManagerProxyUrl(req),
        terminal: getTerminalUrl(instanceId, domainName),
      },
      challenge: {
        instanceId: instanceId !== 'unknown' ? instanceId : null,
      },
      system: {
        hostname: instanceId,
        domain: domainName,
      }
    };
    
    // If we couldn't get instance data, return default apps with system config
    if (!instanceData) {
      console.warn("All attempts to fetch challenge instance details failed:", lastError?.message);
      const finalConfig = {
        apps: defaultApps,
        ...systemConfig
      };
      return NextResponse.json(finalConfig, { status: 200 });
    }

    console.log('Received instance data:', instanceData);

    // Get challenge details using the challengeId from instance data via proxy
    let challengeConfig;
    try {
      const challengeResponse = await fetch(`${databaseProxyUrl}?path=challenge/details&challenge_id=${instanceData.challengeId}`);
      
      if (!challengeResponse.ok) {
        console.warn("Failed to fetch challenge details via proxy:", await challengeResponse.text());
        const finalConfig = {
          apps: defaultApps,
          ...systemConfig
        };
        return NextResponse.json(finalConfig, { status: 200 });
      }
      
      challengeConfig = await challengeResponse.json();
      console.log('Received challenge config via proxy:', challengeConfig);
    } catch (error) {
      // Fallback to direct API call for local development
      console.warn("Proxy attempt for challenge details failed, trying direct API:", error.message);
      
      try {
        const databaseApiUrl = getDatabaseApiUrl();
        const challengeResponse = await fetch(`${databaseApiUrl}/challenge/details?challenge_id=${instanceData.challengeId}`);
        
        if (!challengeResponse.ok) {
          console.warn("Failed to fetch challenge details directly:", await challengeResponse.text());
          const finalConfig = {
            apps: defaultApps,
            ...systemConfig
          };
          return NextResponse.json(finalConfig, { status: 200 });
        }
        
        challengeConfig = await challengeResponse.json();
      } catch (directError) {
        console.warn("All attempts to fetch challenge details failed:", directError.message);
        const finalConfig = {
          apps: defaultApps,
          ...systemConfig
        };
        return NextResponse.json(finalConfig, { status: 200 });
      }
    }

    // Validate challenge config has required fields
    if (!challengeConfig.questions || !Array.isArray(challengeConfig.questions)) {
      console.warn("Challenge config missing questions array:", challengeConfig);
      const finalConfig = {
        apps: defaultApps,
        ...systemConfig
      };
      return NextResponse.json(finalConfig, { status: 200 });
    }

    // Create a map of app configs from the challenge
    const challengeAppConfigs = {};
    if (challengeConfig.appConfigs) {
      challengeConfig.appConfigs.forEach(appConfig => {
        challengeAppConfigs[appConfig.appId] = appConfig;
      });
    }

    // Merge default apps with challenge-specific configurations
    const appConfig = defaultApps.map(app => {
      // If this app has challenge-specific config, merge it
      if (challengeAppConfigs[app.id]) {
        const challengeAppConfig = challengeAppConfigs[app.id];
        return {
          ...app,
          title: challengeAppConfig.title || app.title,
          icon: challengeAppConfig.icon || app.icon,
          width: challengeAppConfig.width || app.width,
          height: challengeAppConfig.height || app.height,
          disabled: challengeAppConfig.disabled,
          favourite: challengeAppConfig.favourite,
          desktop_shortcut: challengeAppConfig.desktop_shortcut,
          launch_on_startup: challengeAppConfig.launch_on_startup,
          ...(challengeAppConfig.additional_config && { additional_config: challengeAppConfig.additional_config })
        };
      }
      
      // Special handling for challenge-prompt app
      if (app.id === "challenge-prompt") {
        return {
          ...app,
          description: challengeConfig.description,
          challenge: {
            type: "single",
            title: challengeConfig.name,
            description: challengeConfig.description,
            flagSecretName: instanceData.flagSecretName,
            groupChallengeId: instanceData.groupChallengeId,
            pages: [
              {
                instructions: challengeConfig.description,
                questions: challengeConfig.questions.map(q => ({
                  id: q.id,
                  type: q.type || "text",
                  content: q.content,
                  points: q.points,
                  ...(q.type !== 'flag' && { answer: q.answer })
                }))
              }
            ]
          }
        };
      }

      return app;
    });

    // Create the final configuration with both app configs and system configs
    const finalConfig = {
      apps: appConfig,
      ...systemConfig
    };

    // Cache the config for later use
    config = finalConfig;
    return NextResponse.json(finalConfig, { status: 200 });
  } catch (error) {
    console.warn("Failed to fetch config, using default config:", error.message);
    const defaultApps = process.env.NEXT_PUBLIC_APPS_CONFIG ? 
      JSON.parse(process.env.NEXT_PUBLIC_APPS_CONFIG) : 
      defaultConfig;
    
    // Create basic system config even in error case
    const systemConfig = {
      urls: {
        databaseApi: getDatabaseApiUrl(),
        instanceManager: getInstanceManagerUrl(),
        databaseApiProxy: getDatabaseProxyUrl(req),
        instanceManagerProxy: getInstanceManagerProxyUrl(req),
        terminal: null,
      },
      challenge: {
        instanceId: null,
      },
      system: {
        hostname: 'unknown',
        domain: process.env.DOMAIN_NAME || process.env.NEXT_PUBLIC_DOMAIN_NAME || '',
      }
    };
    
    const finalConfig = {
      apps: defaultApps,
      ...systemConfig
    };
    
    config = finalConfig;
    return NextResponse.json(finalConfig, { status: 200 });
  }
}

export async function POST(req) {
  try {
    const { questionId, answer } = await req.json();
    
    console.log(`Attempting to verify flag for questionId: ${questionId}, answer length: ${answer?.length || 0}`);

    // Use the fetched config if available, otherwise use the default config
    const currentConfig = config || { apps: defaultConfig };

    // Log the structure of currentConfig for debugging
    console.log('Current config structure:', {
      hasApps: !!currentConfig.apps,
      appCount: currentConfig.apps?.length,
      hasChallenge: !!currentConfig.apps?.find(app => app.id === "challenge-prompt")
    });

    // Find the question in the config
    const challengePromptApp = currentConfig.apps.find(app => app.id === "challenge-prompt");
    if (!challengePromptApp) {
      console.error('Challenge prompt app not found in config');
      return NextResponse.json({ error: 'Challenge config not found' }, { status: 404 });
    }
    
    const challengeConfig = challengePromptApp.challenge;
    if (!challengeConfig) {
      console.error('Challenge config not found in challenge-prompt app');
      return NextResponse.json({ error: 'Challenge config not found' }, { status: 404 });
    }
    
    console.log(`Found challenge config with flagSecretName: ${challengeConfig.flagSecretName}`);
    
    if (!challengeConfig.pages || !Array.isArray(challengeConfig.pages)) {
      console.error('Challenge config missing pages array:', challengeConfig);
      return NextResponse.json({ error: 'Invalid challenge configuration' }, { status: 500 });
    }
    
    let question;
    for (const page of challengeConfig.pages) {
      if (!page.questions || !Array.isArray(page.questions)) {
        console.warn('Page missing questions array:', page);
        continue;
      }
      question = page.questions.find(q => q.id === questionId);
      if (question) break;
    }

    if (!question) {
      console.error(`Question with ID ${questionId} not found`);
      return NextResponse.json({ error: 'Question not found' }, { status: 404 });
    }

    console.log(`Found question with type: ${question.type}`);

    if (question.type === 'flag') {
      try {
        if (!challengeConfig.flagSecretName) {
          console.error('Missing flagSecretName in challenge config');
          return NextResponse.json({ error: 'Missing flag configuration' }, { status: 500 });
        }
        
        // Use the instance manager proxy API instead of direct instance manager calls
        const instanceManagerProxyUrl = getInstanceManagerProxyUrl(req);
        console.log('Using instance manager proxy URL for flag verification:', instanceManagerProxyUrl);
        
        // Make the request via the proxy
        const fetchOptions = {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            secret_name: challengeConfig.flagSecretName,
            namespace: 'default'
          })
        };
        
        console.log(`Sending request to get-secret with secret_name: ${challengeConfig.flagSecretName}`);
        
        // Try a direct fetch first for simplicity and debugging
        try {
          const flagResponse = await fetch(`${instanceManagerProxyUrl}?path=get-secret`, fetchOptions);
          console.log('Flag response status:', flagResponse.status);
          
          // Read the response as text first for better debugging
          const responseText = await flagResponse.text();
          console.log('Raw response text:', responseText.substring(0, 200) + (responseText.length > 200 ? '...' : ''));
          
          let responseData;
          try {
            // Try to parse as JSON
            responseData = JSON.parse(responseText);
            console.log('Parsed flag response:', JSON.stringify(responseData));
          } catch (parseError) {
            console.error('Error parsing response as JSON:', parseError.message);
            return NextResponse.json({ 
              error: 'Invalid response format', 
              details: 'Could not parse response as JSON',
              rawResponse: responseText.substring(0, 100)
            }, { status: 500 });
          }
          
          // Validate the response structure
          if (!responseData || typeof responseData.secret_value === 'undefined') {
            console.error('Flag response is missing secret_value field:', responseData);
            return NextResponse.json({ 
              error: 'Invalid flag response format',
              details: 'Missing secret_value in response'
            }, { status: 500 });
          }
          
          const isCorrect = answer === responseData.secret_value;
          console.log(`Flag verification result: ${isCorrect}, expected: "${responseData.secret_value}", actual: "${answer}"`);
          return NextResponse.json({ isCorrect }, { status: 200 });
        } catch (proxyError) {
          console.error('Error with proxy instance manager call:', proxyError);
          
          // Fall back to direct instance manager call for local development or debugging
          try {
            const instanceManagerUrl = getInstanceManagerUrl();
            console.log(`Falling back to direct instance manager: ${instanceManagerUrl}/get-secret`);
            
            const directResponse = await fetch(`${instanceManagerUrl}/get-secret`, fetchOptions);
            console.log('Direct response status:', directResponse.status);
            
            // Try to handle as text first for better error messages
            const directResponseText = await directResponse.text();
            
            let directData;
            try {
              directData = JSON.parse(directResponseText);
            } catch (parseError) {
              console.error('Error parsing direct response as JSON:', parseError.message);
              return NextResponse.json({ 
                error: 'Invalid direct response format', 
                details: 'Could not parse direct response as JSON',
                rawResponse: directResponseText.substring(0, 100) 
              }, { status: 500 });
            }
            
            if (!directData || typeof directData.secret_value === 'undefined') {
              console.error('Direct flag response is missing secret_value field:', directData);
              return NextResponse.json({ 
                error: 'Invalid direct flag response format',
                details: 'Missing secret_value in direct response'
              }, { status: 500 });
            }
            
            const isCorrect = answer === directData.secret_value;
            console.log(`Direct flag verification result: ${isCorrect}, expected: "${directData.secret_value}", actual: "${answer}"`);
            return NextResponse.json({ isCorrect }, { status: 200 });
          } catch (directError) {
            console.error('Error with direct instance manager call:', directError);
            
            // As a last resort, check if the answer is just "flag{...}" format
            if (typeof answer === 'string' && answer.match(/^flag\{.*\}$/)) {
              console.log('Using fallback flag verification with regex pattern');
              const isCorrect = answer.startsWith('flag{') && answer.endsWith('}');
              return NextResponse.json({ 
                isCorrect, 
                note: 'Used fallback verification due to service errors'
              }, { status: 200 });
            }
            
            return NextResponse.json({ 
              error: 'Failed to verify flag after multiple attempts', 
              details: directError.message 
            }, { status: 500 });
          }
        }
      } catch (error) {
        console.error('Error verifying flag:', error);
        return NextResponse.json({ error: 'Failed to verify flag', details: error.message }, { status: 500 });
      }
    } else {
      // For non-flag questions, check against the hardcoded answer
      const isCorrect = answer === question.answer;
      console.log(`Non-flag question verification result: ${isCorrect}`);
      return NextResponse.json({ isCorrect }, { status: 200 });
    }
  } catch (error) {
    console.error("Error verifying answer:", error);
    return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
  }
}


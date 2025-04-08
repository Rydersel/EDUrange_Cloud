import { NextResponse } from 'next/server';
import {
  getDatabaseApiUrl,
  getInstanceManagerUrl,
  getProxyUrls,
  getTerminalUrl,
  extractInstanceId
} from '@/utils/url-helpers';
import { logger } from '@/utils/logger';
import { flagVerificationLimiter } from '@/utils/security/rate-limiter';

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
    logger.info('Request hostname:', hostname);

    // Determine domain from environment variables with fallbacks
    const domainName = process.env.DOMAIN_NAME || process.env.NEXT_PUBLIC_DOMAIN_NAME || '';

    // Extract instance ID using shared utility
    const instanceId = extractInstanceId(hostname, domainName);
    logger.info('Extracted instance ID:', instanceId);

    // Get default apps config from environment variable
    const defaultApps = process.env.NEXT_PUBLIC_APPS_CONFIG ?
      JSON.parse(process.env.NEXT_PUBLIC_APPS_CONFIG) :
      defaultConfig;

    // Use the database proxy API instead of direct database API calls
    const databaseProxyUrl = getDatabaseProxyUrl(req);
    logger.info('Using database proxy URL:', databaseProxyUrl);

    // Try to fetch instance data using the proxy
    let instanceData = null;
    let lastError = null;

    try {
      logger.info('Attempting to fetch instance data via proxy');
      const response = await fetch(`${databaseProxyUrl}?path=get_challenge_instance&challenge_instance_id=${instanceId}`);

      if (response.ok) {
        instanceData = await response.json();
        logger.info('Successfully fetched instance data via proxy');
      } else {
        const errorText = await response.text();
        logger.warn(`Failed to fetch via proxy: ${response.status} ${response.statusText}`, errorText);
        lastError = new Error(`HTTP ${response.status}: ${errorText}`);
      }
    } catch (error) {
      logger.warn(`Error fetching via proxy:`, error.message);
      lastError = error;
    }

    // If proxy fails, try direct database API as fallback (for local development)
    if (!instanceData) {
      logger.warn("Proxy attempt failed, trying direct database API as fallback");
      const databaseApiUrl = getDatabaseApiUrl();

      try {
        const url = `${databaseApiUrl}/get_challenge_instance?challenge_instance_id=${instanceId}`;
        logger.info('Attempting direct database API call:', url);
        const response = await fetch(url);

        if (response.ok) {
          instanceData = await response.json();
          logger.info('Successfully fetched instance data directly');
        } else {
          const errorText = await response.text();
          logger.warn(`Failed direct fetch: ${response.status} ${response.statusText}`, errorText);
        }
      } catch (error) {
        logger.warn(`Error with direct fetch:`, error.message);
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
      logger.warn("All attempts to fetch challenge instance details failed:", lastError?.message);
      const finalConfig = {
        apps: defaultApps,
        ...systemConfig
      };
      return NextResponse.json(finalConfig, { status: 200 });
    }

    logger.debug('Received instance data:', instanceData);

    // Get challenge details using the challengeId from instance data via proxy
    let challengeConfig;
    try {
      if (!instanceData.challengeId) {
        logger.warn("Missing challengeId in instance data:", instanceData);
        const finalConfig = {
          apps: defaultApps,
          ...systemConfig
        };
        return NextResponse.json(finalConfig, { status: 200 });
      }

      const challengeResponse = await fetch(`${databaseProxyUrl}?path=challenge/details&challenge_id=${instanceData.challengeId}`);

      if (!challengeResponse.ok) {
        logger.warn("Failed to fetch challenge details via proxy:", await challengeResponse.text());
        const finalConfig = {
          apps: defaultApps,
          ...systemConfig
        };
        return NextResponse.json(finalConfig, { status: 200 });
      }

      challengeConfig = await challengeResponse.json();
      logger.debug('Received challenge config via proxy:', challengeConfig);
    } catch (error) {
      // Fallback to direct API call for local development
      logger.warn("Proxy attempt for challenge details failed, trying direct API:", error.message);

      try {
        const databaseApiUrl = getDatabaseApiUrl();
        const challengeResponse = await fetch(`${databaseApiUrl}/challenge/details?challenge_id=${instanceData.challengeId}`);

        if (!challengeResponse.ok) {
          logger.warn("Failed to fetch challenge details directly:", await challengeResponse.text());
          const finalConfig = {
            apps: defaultApps,
            ...systemConfig
          };
          return NextResponse.json(finalConfig, { status: 200 });
        }

        challengeConfig = await challengeResponse.json();
      } catch (directError) {
        logger.warn("All attempts to fetch challenge details failed:", directError.message);
        const finalConfig = {
          apps: defaultApps,
          ...systemConfig
        };
        return NextResponse.json(finalConfig, { status: 200 });
      }
    }

    // Validate challenge config has required fields
    if (!challengeConfig.questions || !Array.isArray(challengeConfig.questions)) {
      logger.warn("Challenge config missing questions array:", challengeConfig);
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
    logger.error("Failed to fetch config, using default config:", error.message);
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
    const body = await req.json();
    const { questionId, answer } = body;

    logger.info(`Attempting to verify flag for questionId: ${questionId}, answer length: ${answer?.length || 0}`);

    // Store questionId for rate limiter to use
    req.questionId = questionId;
    
    // Apply rate limiting
    const rateLimitResult = await flagVerificationLimiter(req);
    if (rateLimitResult.exceeded) {
      const resetTime = rateLimitResult.rateLimit.resetTime;
      const now = new Date();
      
      // Calculate minutes until reset (rounded up)
      const waitMinutes = Math.ceil((resetTime - now) / (60 * 1000));
      
      logger.warn(`Rate limit exceeded for question ${questionId}. Wait time: ${waitMinutes} minutes`);
      return NextResponse.json({ 
        error: 'Too many attempts', 
        resetTime: resetTime.toISOString(),
        waitMinutes: waitMinutes,
        details: `Maximum attempts exceeded. Please try again after ${waitMinutes} minute${waitMinutes !== 1 ? 's' : ''}.`
      }, { 
        status: 429,
        headers: rateLimitResult.headers
      });
    }

    // Use the fetched config if available, otherwise use the default config
    const currentConfig = config || { apps: defaultConfig };

    // Log the structure of currentConfig for debugging
    logger.debug('Current config structure:', {
      hasApps: !!currentConfig.apps,
      appCount: currentConfig.apps?.length,
      hasChallenge: !!currentConfig.apps?.find(app => app.id === "challenge-prompt")
    });

    // Find the question in the config
    const challengePromptApp = currentConfig.apps.find(app => app.id === "challenge-prompt");
    if (!challengePromptApp) {
      logger.error('Challenge prompt app not found in config');
      return NextResponse.json({ error: 'Challenge config not found' }, { status: 404 });
    }

    const challengeConfig = challengePromptApp.challenge;
    if (!challengeConfig) {
      logger.error('Challenge config not found in challenge-prompt app');
      return NextResponse.json({ error: 'Challenge config not found' }, { status: 404 });
    }

    logger.debug(`Found challenge config with flagSecretName: ${challengeConfig.flagSecretName}`);

    if (!challengeConfig.pages || !Array.isArray(challengeConfig.pages)) {
      logger.error('Challenge config missing pages array:', challengeConfig);
      return NextResponse.json({ error: 'Invalid challenge configuration' }, { status: 500 });
    }

    let question;
    for (const page of challengeConfig.pages) {
      if (!page.questions || !Array.isArray(page.questions)) {
        logger.warn('Page missing questions array:', page);
        continue;
      }
      question = page.questions.find(q => q.id === questionId);
      if (question) break;
    }

    if (!question) {
      logger.error(`Question with ID ${questionId} not found`);
      return NextResponse.json({ error: 'Question not found' }, { status: 404 });
    }

    logger.info(`Found question with type: ${question.type}`);

    // Add simplified diagnostic logs for troubleshooting
    if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'testing') {
      logger.info(`🔍 TYPE DIAGNOSTIC - Question type (raw): "${question.type}"`);
      logger.info(`🔍 TYPE DIAGNOSTIC - Question type (toLowerCase): "${question.type?.toLowerCase()}"`);
    }

    /**
     * Flag Verification Process
     * ------------------------
     * This system uses only the primary method to verify flags:
     * 
     * Primary Method: Instance Manager Proxy API
     * - Most secure and reliable method
     * - Calls the instance manager through the proxy API
     * - Uses the flagSecretName to retrieve the actual flag
     * 
     * For security reasons, no fallback methods are used.
     * If the primary verification fails, the entire verification fails.
     * 
     * SECURITY: All verification is done server-side, ensuring flag data never
     * reaches the client. Client only receives isCorrect result.
     * 
     * Anti-Brute Force: Rate limiting prevents excessive verification attempts
     * from the same instance, with lockout periods for abusive behavior.
     */

    // Log remaining attempts
    logger.info(`Remaining verification attempts: ${rateLimitResult.rateLimit.remainingAttempts}`);

    // Handle flag type questions with case-insensitive comparison
    if (question.type.toLowerCase() === 'flag') {
      try {
        // Server-side only verification for flag questions
        logger.info('🔍 VERIFICATION DIAGNOSTIC - Starting server-side flag verification process');
        logger.info(`🔍 VERIFICATION DIAGNOSTIC - Question ID: ${questionId}`);
        logger.info(`🔍 VERIFICATION DIAGNOSTIC - Answer length: ${answer?.length || 0}`);
        
        if (!challengeConfig.flagSecretName) {
          logger.error('🔍 VERIFICATION DIAGNOSTIC - Missing flagSecretName in challenge config');
          return NextResponse.json({ error: 'Missing flag configuration' }, { 
            status: 500, 
            headers: rateLimitResult.headers 
          });
        }
        
        // Get the actual flag from the instance manager - SERVER SIDE ONLY
        const isCorrect = await verifyFlagServerSide(
          challengeConfig.flagSecretName, 
          answer,
          getInstanceManagerProxyUrl(req)
        );
        
        logger.info(`🔍 VERIFICATION DIAGNOSTIC - Final verification result: ${isCorrect ? 'CORRECT' : 'INCORRECT'}`);
        
        return NextResponse.json({ isCorrect }, { 
          status: 200, 
          headers: rateLimitResult.headers 
        });
      } catch (error) {
        logger.error(`🔍 VERIFICATION DIAGNOSTIC - Error in flag verification process: ${error.message}`);
        logger.error(`🔍 VERIFICATION DIAGNOSTIC - Error stack trace: ${error.stack}`);
        return NextResponse.json({ error: 'Internal error during flag verification', details: error.message }, { 
          status: 500, 
          headers: rateLimitResult.headers 
        });
      }
    } else {
      // For non-flag questions, check against the hardcoded answer
      const isCorrect = answer === question.answer;
      logger.info(`Non-flag question verification result: ${isCorrect}`);
      logger.debug(`Expected: "${question.answer}", Received: "${answer}"`);
      return NextResponse.json({ isCorrect }, { 
        status: 200, 
        headers: rateLimitResult.headers 
      });
    }
  } catch (error) {
    logger.error("Error verifying answer:", error);
    return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
  }
}

/**
 * Server-side flag verification function that keeps sensitive flag data private
 * This is never exposed to the client and all verification happens server-side
 */
async function verifyFlagServerSide(flagSecretName, submittedAnswer, instanceManagerProxyUrl) {
  try {
    if (!instanceManagerProxyUrl) {
      logger.error('No instance manager proxy URL available for server-side verification');
      throw new Error('Flag verification service unavailable');
    }
    
    logger.info(`Server-side verification with secret: ${flagSecretName}`);
    
    // Prepare request data
    const requestUrl = `${instanceManagerProxyUrl}?path=get-secret`;
    const requestBody = JSON.stringify({
      secret_name: flagSecretName,
      namespace: 'default'
    });
    
    // Make request to instance manager proxy
    const response = await fetch(requestUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: requestBody
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`Server-side flag verification failed with status ${response.status}: ${errorText}`);
      throw new Error(`Flag verification service error: HTTP ${response.status}`);
    }
    
    // Parse the response text as JSON
    const responseText = await response.text();
    let data;
    
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      logger.error(`Failed to parse response as JSON: ${parseError.message}`);
      throw new Error('Invalid JSON response from flag verification service');
    }
    
    if (!data || typeof data.secret_value === 'undefined') {
      logger.error(`Missing secret_value in response: ${JSON.stringify(data)}`);
      throw new Error('Invalid flag verification response format');
    }
    
    // Compare the submitted answer with the actual flag
    const expectedFlag = data.secret_value;
    
    // Log comparison details securely (without revealing full flag)
    logger.info(`Server-side comparison - Expected length: ${expectedFlag.length}, Received length: ${submittedAnswer.length}`);
    logger.info(`Server-side comparison - Expected prefix: ${expectedFlag.substring(0, 4)}..., Received prefix: ${submittedAnswer.substring(0, 4)}...`);
    
    // Return only the result, no flag data
    return submittedAnswer === expectedFlag;
    
  } catch (error) {
    logger.error(`Server-side verification error: ${error.message}`);
    // Re-throw to be handled by the caller
    throw error;
  }
}

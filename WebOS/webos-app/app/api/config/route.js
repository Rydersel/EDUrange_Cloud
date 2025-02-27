import { NextResponse } from 'next/server';

// Function to get the instance manager URL
const getInstanceManagerUrl = () => {
  return process.env.INSTANCE_MANAGER_URL || 'https://eductf.rydersel.cloud/instance-manager/api';
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
    // Get challenge instance ID from hostname
    const hostname = req.headers.get('host');
    const instanceId = hostname.split('.')[0];

    // Get default apps config from environment variable
    const defaultApps = process.env.NEXT_PUBLIC_APPS_CONFIG ? 
      JSON.parse(process.env.NEXT_PUBLIC_APPS_CONFIG) : 
      defaultConfig;

    // Get challenge instance details first
    const instanceResponse = await fetch(`https://database.rydersel.cloud/get_challenge_instance?challenge_instance_id=${instanceId}`);
    if (!instanceResponse.ok) {
      console.warn("Failed to fetch challenge instance details");
      return NextResponse.json(defaultApps, { status: 200 });
    }

    const instanceData = await instanceResponse.json();
    console.log('Received instance data:', instanceData);

    // Get challenge details using the challengeId from instance data
    const challengeResponse = await fetch(`https://database.rydersel.cloud/challenge/details?challenge_id=${instanceData.challengeId}`);
    if (!challengeResponse.ok) {
      console.warn("Failed to fetch challenge details:", await challengeResponse.text());
      return NextResponse.json(defaultApps, { status: 200 });
    }

    const challengeConfig = await challengeResponse.json();
    console.log('Received challenge config:', challengeConfig);

    // Validate challenge config has required fields
    if (!challengeConfig.questions || !Array.isArray(challengeConfig.questions)) {
      console.warn("Challenge config missing questions array:", challengeConfig);
      return NextResponse.json(defaultApps, { status: 200 });
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

    config = appConfig;
    return NextResponse.json(appConfig, { status: 200 });
  } catch (error) {
    console.warn("Failed to fetch config, using default config:", error.message);
    const defaultApps = process.env.NEXT_PUBLIC_APPS_CONFIG ? 
      JSON.parse(process.env.NEXT_PUBLIC_APPS_CONFIG) : 
      defaultConfig;
    config = defaultApps;
    return NextResponse.json(defaultApps, { status: 200 });
  }
}

export async function POST(req) {
  try {
    const { questionId, answer } = await req.json();

    // Use the fetched config if available, otherwise use the default config
    const currentConfig = config || defaultConfig;

    // Find the question in the config
    const challengeConfig = currentConfig.find(app => app.id === "challenge-prompt").challenge;
    let question;
    for (const page of challengeConfig.pages) {
      question = page.questions.find(q => q.id === questionId);
      if (question) break;
    }

    if (!question) {
      return NextResponse.json({ error: 'Question not found' }, { status: 404 });
    }

    if (question.type === 'flag') {
      try {
        // Verify flag using the instance manager API
        const instanceManagerUrl = getInstanceManagerUrl();
        const flagResponse = await fetch(`${instanceManagerUrl}/get-secret`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            secret_name: challengeConfig.flagSecretName,
            namespace: 'default'
          }),
        });

        if (!flagResponse.ok) {
          console.error('Failed to fetch flag:', await flagResponse.text());
          return NextResponse.json({ error: 'Failed to verify flag' }, { status: 500 });
        }

        const { secret_value } = await flagResponse.json();
        return NextResponse.json({ isCorrect: answer === secret_value }, { status: 200 });
      } catch (error) {
        console.error('Error verifying flag:', error);
        return NextResponse.json({ error: 'Failed to verify flag' }, { status: 500 });
      }
    } else {
      // For non-flag questions, check against the hardcoded answer
      return NextResponse.json({ isCorrect: answer === question.answer }, { status: 200 });
    }
  } catch (error) {
    console.error("Error verifying answer:", error);
    return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
  }
}

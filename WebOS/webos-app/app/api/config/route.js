import { NextResponse } from 'next/server';

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
    const response = await fetch('http://127.0.0.1:5000/config', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch config from bridge');
    }

    const data = await response.json();
    config = data;
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.warn("Failed to fetch config, using default config:", error.message);
    config = defaultConfig;
    return NextResponse.json(defaultConfig, { status: 200 });
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
      // Verify flag using the provided API
      const flagResponse = await fetch('https://eductf.rydersel.cloud/instance-manager/api/get-secret', {
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
        throw new Error('Failed to fetch flag');
      }

      const { secret_value } = await flagResponse.json();
      const isCorrect = answer === secret_value;

      return NextResponse.json({ isCorrect }, { status: 200 });
    } else {
      // For non-flag questions, check against the hardcoded answer
      const isCorrect = answer === question.answer;
      return NextResponse.json({ isCorrect }, { status: 200 });
    }
  } catch (error) {
    console.error("Error verifying answer:", error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

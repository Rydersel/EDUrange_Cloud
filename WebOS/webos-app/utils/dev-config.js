/**
 * Development-only configuration for WebOS
 * This file contains mock data and configuration that will be used when running in development mode
 * to avoid network errors and long loading times when services are not available.
 */

/**
 * Default apps configuration for development mode
 */
export const defaultApps = [
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
    width: 50,
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
    icon: './icons/web-chal.svg',
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
    description: "Development mode challenge prompt",
    launch_on_startup: false,
    challenge: {
      type: "single",
      title: "Dev Mode Challenge",
      description: "This is a sample challenge for development mode.",
      flagSecretName: "dev-flag-secret",
      pages: [
        {
          instructions: "These are development mode sample questions.",
          questions: [
            {
              type: "flag",
              content: "What is the flag?",
              id: "flag",
              points: 10
            },
            {
              type: "text",
              content: "What is the best cybersecurity platform?",
              id: "platform",
              points: 5,
              answer: "EDURange"
            }
          ]
        }
      ]
    }
  },
];

/**
 * Complete development configuration object
 */
export const devConfig = {
  apps: defaultApps,
  urls: {
    databaseApi: 'http://localhost:8000',
    instanceManager: 'http://localhost:8000/api',
    databaseApiProxy: 'http://localhost:3000/api/database-proxy',
    instanceManagerProxy: 'http://localhost:3000/api/instance-manager-proxy',
    terminal: 'http://localhost:3001',
    webChallengeUrl: 'http://localhost:8080',
    doomUrl: 'http://localhost:8080/doom',
  },
  challenge: {
    instanceId: 'dev-instance',
  },
  system: {
    hostname: 'dev-webos',
    domain: 'localhost',
  }
};

/**
 * Mock data for flag verification in development mode
 */
export const mockFlags = {
  'dev-flag-secret': 'flag{development_mode_flag}',
};

/**
 * Checks if the application is running in development mode
 * @returns {boolean} True if running in development mode
 */
export const isDevMode = () => {
  return process.env.NODE_ENV === 'development';
};

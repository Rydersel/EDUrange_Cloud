import { NavItem } from '@/types';

export type Challenge = {
  id: string;
  user_id: string;
  user_email?: string;
  challenge_id: string;
  challenge_image: string;
  challenge_url: string;
  status: string;
  flag: string;
  app_config: string;
  time_alive: string;
};


export interface AppConfig {
  id: string;
  title: string;
  icon: string;
  disabled: boolean;
  favourite: boolean;
  desktop_shortcut: boolean;
  screen: string;
  width: number;
  height: number;
  disableScrolling?: boolean;
  url?: string;
  description?: string;
  questions?: any[];
  launch_on_startup?: boolean;
  pages?: Array<{
    instructions: string;
    questions?: Array<{
      type?: string;
      content: string;
      id?: string;
      points: number;
    }>;
  }>;
}

export type User = {
  id: string;
  name: string;
  company?: string;
  role?: string;
  verified?: boolean;
  status?: string;
};

export const users: User[] = [
  // Hardcoded users (demo account etc)
];

export const challengeTypes = [
  { id: 'fullos', name: 'Full OS' },
  { id: 'web', name: 'Web Challenge' },
  // Add more challenge images as needed with their default app configs
];

export const defaultAppsConfig: AppConfig[] = [
  { id: 'chrome', title: 'Browser', icon: './icons/browser.svg', disabled: false, favourite: true, desktop_shortcut: false, screen: 'displayChrome', width: 70, height: 80, launch_on_startup: false },
  { id: 'calc', title: 'Calculator', icon: './icons/calculator.svg', disabled: false, favourite: true, desktop_shortcut: false, screen: 'displayTerminalCalc', width: 5, height: 50, launch_on_startup: false },
  { id: 'codeeditor', title: 'Code Editor', icon: './icons/code-editor.svg', disabled: false, favourite: true, desktop_shortcut: false, screen: 'displayCodeEditor', width: 60, height: 75, launch_on_startup: false },
  { id: 'terminal', title: 'Terminal', icon: './icons/Remote-Terminal.svg', disabled: false, favourite: true, desktop_shortcut: false, screen: 'displayTerminal', width: 60, height: 55, disableScrolling: true, launch_on_startup: true },
  { id: 'settings', title: 'Settings', icon: './icons/settings.svg', disabled: false, favourite: true, desktop_shortcut: false, screen: 'displaySettings', width: 50, height: 60, launch_on_startup: false },
  { id: 'doom', title: 'Doom', icon: './icons/doom.svg', disabled: false, favourite: true, desktop_shortcut: true, screen: 'displayDoom', width: 80, height: 90, launch_on_startup: false },
  { id: 'cyberchef', title: 'Cyber Chef', icon: './icons/cyberchef.svg', disabled: false, favourite: true, desktop_shortcut: true, screen: 'Cyberchef', width: 75, height: 85, launch_on_startup: false },
  { id: 'web_chal', title: 'Web Challenge', icon: './icons/browser.svg', disabled: false, favourite: true, desktop_shortcut: true, screen: 'displayWebChal', width: 70, height: 80, url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', launch_on_startup: false },
  {
    id: 'challenge_prompt',
    title: 'Challenge Prompt',
    icon: './icons/prompt.svg',
    disabled: false,
    favourite: true,
    desktop_shortcut: true,
    screen: 'displayChallengePrompt',
    width: 70,
    height: 80,
    description: 'Solve the challenge',
    pages: [
      {
        instructions: 'Read the instructions carefully and answer the questions.',
        questions: [
          { id: 'q1', content: 'What is the IP of the malicious server?', points: 10 },
          { id: 'q2', content: 'What is the flag?', points: 50 }
        ]
      },
      {
        instructions: 'Answer the following questions based on your findings.',
        questions: [
          { id: 'q3', content: 'What is the attack vector used?', points: 20 },
          { id: 'q4', content: 'What remediation steps would you suggest?', points: 20 }
        ]
      }
    ],
    launch_on_startup: true
  }
];

export const navItems: NavItem[] = [
  {
    title: 'Home',
    href: '/home',
    icon: 'logo',
    label: 'home'
  },
  {
    title: 'Dashboard',
    href: '/dashboard',
    icon: 'dashboard',
    label: 'Dashboard'
  },
  {
    title: 'Challenges',
    href: '/dashboard/challenge',
    icon: 'laptop',
    label: 'Challenges'
  },
  {
    title: 'Competitions',
    href: '/dashboard/competitions',
    icon: 'trophy',
    label: 'competitions'
  },
  {
    title: 'Users',
    href: '/dashboard/users',
    icon: 'user',
    label: 'users'
  }
];

export const IMG_MAX_LIMIT = 3;

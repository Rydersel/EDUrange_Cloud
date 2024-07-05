import { NavItem} from '@/types';

export type Challenge = {
  id: string;
  user_id: string;
  challenge_image: string;
  challenge_url: string;
  status?: string;
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
  url: string;
}



export type User = {
  id: number;
  name: string;
  company: string;
  role: string;
  verified: boolean;
  status: string;
};

export const users: User[] = [
  // Hardcoded users (demo account etc)
];








export const challengeTypes = [
  { id: 'fullos', name: 'Full OS'},
  { id: 'web', name:'Web Challenge'},
  // Add more challenge images as needed with their default app configs
];




export const defaultAppsConfig = [
  { id: 'chrome', title: 'Browser', icon: './icons/browser.svg', disabled: false, favourite: true, desktop_shortcut: false, screen: 'displayChrome', width: 70, height: 80 },
  { id: 'calc', title: 'Calculator', icon: './icons/calculator.svg', disabled: false, favourite: true, desktop_shortcut: false, screen: 'displayTerminalCalc', width: 5, height: 50 },
  { id: 'codeeditor', title: 'Code Editor', icon: './icons/code-editor.svg', disabled: false, favourite: true, desktop_shortcut: false, screen: 'displayCodeEditor', width: 60, height: 75 },
  { id: 'terminal', title: 'Terminal', icon: './icons/Remote-Terminal.svg', disabled: false, favourite: true, desktop_shortcut: false, screen: 'displayTerminal', width: 60, height: 55, disableScrolling: true },
  { id: 'settings', title: 'Settings', icon: './icons/settings.svg', disabled: false, favourite: true, desktop_shortcut: false, screen: 'displaySettings', width: 50, height: 60 },
  { id: 'doom', title: 'Doom', icon: './icons/doom.svg', disabled: false, favourite: true, desktop_shortcut: true, screen: 'displayDoom', width: 80, height: 90 },
  { id: 'cyberchef', title: 'Cyber Chef', icon: './icons/cyberchef.svg', disabled: false, favourite: true, desktop_shortcut: true, screen: 'Cyberchef', width: 75, height: 85 },
  { id: 'web_chal', title: 'Web Challenge', icon: './icons/browser.svg', disabled: false, favourite: true, desktop_shortcut: true, screen: 'displayWebChal', width: 70, height: 80, url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }

];


export const navItems: NavItem[] = [
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
    title: 'Users',
    href: '/dashboard/users',
    icon: 'user',
    label: 'users'
  }

];

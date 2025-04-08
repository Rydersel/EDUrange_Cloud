import { NavItem } from '@/types';

export type Challenge = {
  id: string;
  user_id: string;
  userEmail?: string;
  challenge_id?: string;
  challenge_image: string;
  challenge_url: string;
  status: string;
  flag?: string;
  flag_secret_name?: string;
  app_config?: string;
  time_alive: string;
  challengeType?: string;
  groupId?: string | null;
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
export const navItems: NavItem[] = [
  {
    title: 'Dashboard',
    href: '/admin',
    icon: 'dashboard',
    label: 'Dashboard'
  },
  {
    title: 'Challenge Instances',
    href: '/admin/challenge',
    icon: 'laptop',
    label: 'challenge-instances'
  },
  {
    title: 'Installed Challenges',
    href: '/admin/challenges',
    icon: 'settings',
    label: 'installed-challenges',
    adminOnly: true
  },
  {
    title: 'Installed Types',
    href: '/admin/types',
    icon: 'kanban',
    label: 'installed-types',
    adminOnly: true
  },
  {
    title: 'Competitions',
    href: '/admin/competitions',
    icon: 'trophy',
    label: 'competitions'
  },
  {
    title: 'Users',
    href: '/admin/users',
    icon: 'user',
    label: 'users',
    adminOnly: true
  },
  {
    title: 'Logs',
    href: '/admin/logs',
    icon: 'circuit',
    label: 'logs',
    adminOnly: true
  },
   {
    title: 'Docs',
    href: process.env.DOCS_URL,
    icon: 'help',
    label: 'docs',
    adminOnly: true,
    target: '_blank',
    rel: 'noopener noreferrer'
  }
];

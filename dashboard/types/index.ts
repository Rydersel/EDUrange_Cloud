import { Icons } from '@/components/icons';
// Export environment variable typing
export { env } from './env';

export interface NavItem {
  title: string;
  href?: string;
  disabled?: boolean;
  external?: boolean;
  icon?: keyof typeof Icons;
  label?: string;
  description?: string;
  adminOnly?: boolean;
  target?: string;
  rel?: string;
}

export interface NavItemWithChildren extends NavItem {
  items: NavItemWithChildren[];
}

export interface NavItemWithOptionalChildren extends NavItem {
  items?: NavItemWithChildren[];
}

export interface FooterItem {
  title: string;
  items: {
    title: string;
    href: string;
    external?: boolean;
  }[];
}

export type MainNavItem = NavItemWithOptionalChildren;

export type SidebarNavItem = NavItemWithChildren;

export interface Question {
  id: string;
  content: string;
  points: number;
}

export interface Page {
  instructions: string;
  questions: Question[];
}

export interface ChallengeInstance {
  id: string;
  userId: string;
  userEmail?: string;
  userName?: string;
  challengeImage: string;
  challengeUrl: string;
  creationTime: string;
  status?: string;
  flagSecretName: string;
  flag?: string;
  challengeType?: string;
  groupId?: string;
  groupName?: string;
  competitionId?: string;
}

export interface Scenario {
  id: string;
  name: string;
  description: string;
  image: string;
  type: string;
  difficulty: string;
  category: string;
}

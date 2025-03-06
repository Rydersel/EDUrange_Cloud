/* eslint-disable no-console */
import type { Session, User as AuthUser, Account, Profile } from 'next-auth';
import type { AuthOptions } from 'next-auth';
import type { Adapter } from 'next-auth/adapters';
import CredentialsProvider from 'next-auth/providers/credentials';
import GithubProvider from 'next-auth/providers/github';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { UserRole } from '@prisma/client';
import { ActivityLogger, ActivityEventType } from './lib/activity-logger';
import { User } from 'next-auth';
import { prisma } from './lib/prisma';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role: UserRole;
    }
  }

  interface User {
    id: string;
    name?: string | null;
    email: string;
    role: UserRole;
  }
}

interface OAuthUser extends User {
  email: string;
  name?: string | null;
  image?: string | null;
}

const authConfig: AuthOptions = {
  adapter: PrismaAdapter(prisma) as Adapter,
  session: {
    strategy: "database",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  providers: [
    GithubProvider({
      clientId: process.env.AUTH_GITHUB_ID ?? '',
      clientSecret: process.env.AUTH_GITHUB_SECRET ?? '',
    }),
  ],
  pages: {
    signIn: '/' // Sign-in page
  },
  cookies: {
    sessionToken: {
      name: `next-auth.session-token`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
    callbackUrl: {
      name: `next-auth.callback-url`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
    csrfToken: {
      name: `next-auth.csrf-token`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
  },
  callbacks: {
    async redirect({ url, baseUrl }: { url: string; baseUrl: string }) {
      return url.startsWith(baseUrl) ? '/home' : baseUrl;
    },
    async session({ session, user }: { session: Session; user: AuthUser & { role: UserRole } }) {
      if (session.user) {
        session.user.id = user.id;
        session.user.role = user.role;
      }
      return session;
    },
    async signIn({ user, account, profile }) {
      try {
        if (account?.type === 'oauth') {
          const oauthUser = user as OAuthUser;
          const existingUser = await prisma.user.findUnique({ where: { email: oauthUser.email } });

          if (!existingUser) {
            // This is a new user registration
            const newUser = await prisma.user.create({
              data: {
                email: oauthUser.email,
                name: oauthUser.name || null,
                image: oauthUser.image || null,
              },
            });

            // Log the registration
            await ActivityLogger.logUserEvent(
              ActivityEventType.USER_REGISTERED,
              newUser.id,
              {
                email: oauthUser.email,
                name: oauthUser.name,
                timestamp: new Date().toISOString()
              }
            );

            // Create OAuth account
            await prisma.account.create({
              data: {
                userId: newUser.id,
                provider: account.provider,
                providerAccountId: account.providerAccountId,
                type: account.type,
                access_token: account.access_token,
                token_type: account.token_type,
                scope: account.scope,
                id_token: account.id_token,
                session_state: account.session_state,
                refresh_token: account.refresh_token,
                expires_at: account.expires_at,
              }
            });
          } else {
            // This is a login
            await ActivityLogger.logUserEvent(
              ActivityEventType.USER_LOGGED_IN,
              existingUser.id,
              {
                email: existingUser.email,
                name: existingUser.name,
                timestamp: new Date().toISOString()
              }
            );
          }
        }
        return true;
      } catch (error) {
        console.error('Error in signIn callback:', error);
        return false;
      }
    }
  }
}

export default authConfig;

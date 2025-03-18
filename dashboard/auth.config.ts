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
import { getDevAuthProvider } from './lib/dev-auth-provider';

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

// Only include the GitHub provider by default
const providers = [
  GithubProvider({
    clientId: process.env.AUTH_GITHUB_ID ?? '',
    clientSecret: process.env.AUTH_GITHUB_SECRET ?? '',
  }),
];

// Add development login provider in non-production environments
const devProviders = getDevAuthProvider();
if (devProviders.length > 0) {
  // Use type assertion to avoid type errors with different provider types
  providers.push(...(devProviders as any[]));
}

// Ensure we have a valid NEXTAUTH_SECRET
if (!process.env.NEXTAUTH_SECRET) {
  throw new Error("NEXTAUTH_SECRET is not defined. Please set this environment variable.");
}

const authConfig: AuthOptions = {
  adapter: PrismaAdapter(prisma) as Adapter,
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  providers,
  pages: {
    signIn: '/signin',
  },
  secret: process.env.NEXTAUTH_SECRET,
  jwt: {
    // Force JWT encoding/decoding to use the secret directly
    encode: ({ secret, token }) => {
      if (!token) return "";
      return require('jsonwebtoken').sign(token, secret);
    },
    decode: ({ secret, token }) => {
      if (!token) return null;
      
      const jwt = require('jsonwebtoken');
      
      try {
        // Try to verify the token with the current secret
        return jwt.verify(token, secret);
      } catch (error: any) {
        // Log the error for debugging
        console.error("JWT verification failed:", error.message);
        
        // Return null to force re-authentication
        // This is safer than trying to use old secrets
        return null;
      }
    }
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
    async jwt({ token, user, account }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }
      return token;
    },
    async redirect({ url, baseUrl }) {
      // Redirect to home instead of dashboard
      if (url.includes('/dashboard')) {
        return `${baseUrl}/home`;
      }
      
      // Allow relative URLs
      if (url.startsWith('/')) {
        return `${baseUrl}${url}`;
      }
      
      // Allow callback URLs on the same origin
      if (new URL(url).origin === baseUrl) {
        return url;
      }
      
      return baseUrl;
    },
    async session({ session, token }) {
      if (session.user && token) {
        session.user.id = token.id as string;
        session.user.role = token.role as UserRole;
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
  },
  debug: process.env.NODE_ENV !== 'production',
}

export default authConfig;

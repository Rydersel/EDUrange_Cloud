/* eslint-disable no-console */
import type { Session, User as AuthUser, Account, Profile } from 'next-auth';
import type { AuthOptions } from 'next-auth';
import type { Adapter } from 'next-auth/adapters';
import CredentialsProvider from 'next-auth/providers/credentials';
import GithubProvider from 'next-auth/providers/github';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { PrismaClient, UserRole } from '@prisma/client';

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

const prisma = new PrismaClient();

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
    CredentialsProvider({
      credentials: {
        email: { type: 'email', label: 'Email', placeholder: 'your-email@example.com' },
        password: { type: 'password', label: 'Password', placeholder: 'your-password' }
      },
      async authorize(credentials) {
        const { email, password } = credentials ?? {};

        if (!email || !password) {
          console.log("Missing email or password");
          return null;
        }

        // First find the user without password to check if they exist
        const user = await prisma.user.findUnique({ 
          where: { email }
        });

        if (!user) {
          console.log("User not found");
          return null;
        }

        // For demo purposes, we're doing a simple password check
        // In production, you should use proper password hashing
        if (password === 'demo-password') {
          console.log("User authenticated successfully", user);
          return {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role
          };
        } else {
          console.log("Incorrect password");
          return null;
        }
      }
    })
  ],
  pages: {
    signIn: '/' // Sign-in page
  },
  callbacks: {
    async redirect({ url, baseUrl }: { url: string; baseUrl: string }) {
      console.log("Redirecting to Home");
      return url.startsWith(baseUrl) ? '/home' : baseUrl;
    },
    async session({ session, user }: { session: Session; user: AuthUser & { role: UserRole } }) {
      if (session.user) {
        session.user.id = user.id;
        session.user.role = user.role;
        console.log("Session created with role", session);
      }
      return session;
    },
    async signIn({ user, account, profile }: { 
      user: (AuthUser & { name?: string | null; image?: string | null }) | { email: string; id?: string }; 
      account: Account | null; 
      profile?: Profile 
    }) {
      console.log("SignIn callback invoked", { user, account, profile });

      if (!account) return false;

      const existingAccount = await prisma.account.findUnique({
        where: {
          provider_providerAccountId: {
            provider: account.provider,
            providerAccountId: account.providerAccountId,
          },
        },
      });

      if (existingAccount) {
        console.log("Account already exists", existingAccount);
        return true;
      } else {
        const existingUser = await prisma.user.findUnique({ where: { email: user.email } });

        if (existingUser) {
          await prisma.account.create({
            data: {
              userId: existingUser.id,
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
          console.log("Linked new OAuth account to existing user", existingUser);
          return true;
        }
        const newUser = await prisma.user.create({
          data: {
            name: 'name' in user ? user.name : null,
            email: user.email,
            image: 'image' in user ? user.image : null,
            role: "STUDENT"
          },
        });
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
        console.log("Created new user and linked OAuth account", newUser);
        return true;
      }
    }
  }
}

export default authConfig;

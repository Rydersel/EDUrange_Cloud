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
            role: "STUDENT" // Default Role
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

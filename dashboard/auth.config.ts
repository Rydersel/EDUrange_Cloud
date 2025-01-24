/* eslint-disable no-console */
// @ts-ignore
import { NextAuthConfig } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GithubProvider from 'next-auth/providers/github';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const authConfig: NextAuthConfig = {
  adapter: PrismaAdapter(prisma),
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
      async authorize(credentials, req) {
        const { email, password } = credentials ?? {};

        if (!email || !password) {
          console.log("Missing email or password");
          return null;
        }

        const user = await prisma.user.findUnique({ where: { email } });

        if (user && user.password === password) {
          console.log("User authenticated successfully", user);
          return { id: user.id.toString(), name: user.name, email: user.email, admin: user.admin };
        } else {
          console.log("User not found or incorrect password");
          return null;
        }
      }
    })
  ],
  pages: {
    signIn: '/' // Sign-in page
  },
  callbacks: {
    async redirect({ url, baseUrl }) {
      console.log("Redirecting to Home");
      return url.startsWith(baseUrl) ? '/home' : baseUrl;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id;
        session.user.admin = token.admin;
        console.log("Session created", session);
      }
      return session;
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.admin = user.admin;
        console.log("JWT token created", token);
      }
      return token;
    },
    async signIn({ user, account, profile }) {
      console.log("SignIn callback invoked", { user, account, profile });

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
        } else {
          const newUser = await prisma.user.create({
            data: {
              name: user.name,
              email: user.email,
              image: user.image,
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
};

export default authConfig;

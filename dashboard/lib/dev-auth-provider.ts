import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";

/**
 * Development-only authentication provider
 * This provider is only used in development mode and allows creating test users
 * or logging in as existing users without passwords.
 * For security reasons, all new accounts are created with STUDENT role.
 * 
 * Multiple security checks ensure this is never available in production:
 * 1. The provider is only returned in non-production environments
 * 2. The authorize function has an additional check to reject all requests in production
 */
export const getDevAuthProvider = () => {
  // First security check: Only return the provider in development
  if (process.env.NODE_ENV === 'production') {
    return [];
  }
  
  return [
    CredentialsProvider({
      id: "credentials",
      name: 'Development Login',
      credentials: {
        name: { label: "Name", type: "text", placeholder: "Test User" },
        email: { label: "Email", type: "email", placeholder: "test@example.com" },
        role: { label: "Role", type: "text" }, // Kept for backward compatibility but ignored
        existingUser: { label: "Existing User", type: "text" }
      },
      async authorize(credentials) {
        // Second security check: Reject all requests in production
        // This provides defense in depth in case the provider somehow gets included in production
        if (process.env.NODE_ENV === 'production') {
          console.error("Development login attempted in production environment");
          return null;
        }

        if (!credentials?.email) {
          return null;
        }

        try {
          // For existing user login
          if (credentials.existingUser === 'true') {
            const existingUser = await prisma.user.findUnique({
              where: { email: credentials.email }
            });
            
            if (!existingUser) {
              return null;
            }
            
            return {
              id: existingUser.id,
              name: existingUser.name,
              email: existingUser.email,
              role: existingUser.role,
              image: existingUser.image
            };
          }
          
          // For new user creation
          if (!credentials.name) {
            return null;
          }
          
          // Check if user already exists
          let user = await prisma.user.findUnique({
            where: { email: credentials.email }
          });

          // Create user if it doesn't exist - always with STUDENT role
          if (!user) {
            user = await prisma.user.create({
              data: {
                name: credentials.name,
                email: credentials.email,
                role: 'STUDENT', // Always create with STUDENT role for security
              }
            });
          }

          return {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            image: user.image
          };
        } catch (error) {
          console.error("Error in development login:", error);
          return null;
        }
      }
    })
  ];
}; 
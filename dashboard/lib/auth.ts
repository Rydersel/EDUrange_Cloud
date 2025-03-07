// Re-export the auth configuration from the root auth.config.ts file
// This ensures we have a single source of truth for auth configuration
import authConfig from '@/auth.config';

export const authOptions = authConfig;

// Export types for convenience
export type { Session, User } from 'next-auth';

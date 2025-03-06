import NextAuth from "next-auth";
import authConfig from '@/auth.config';

// Create and export the handler directly instead of re-exporting
const handler = NextAuth(authConfig);

export const GET = handler;
export const POST = handler;

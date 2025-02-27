/**
 * API configuration utilities for EDURange Cloud
 * Provides consistent access to API endpoints across the application
 */

/**
 * Get the base URL for the instance manager API
 * Uses environment variable if available, falls back to a default
 */
export const getInstanceManagerUrl = (): string => {
  // For server components
  if (typeof process !== 'undefined' && process.env) {
    return process.env.INSTANCE_MANAGER_URL || 'https://eductf.rydersel.cloud/instance-manager/api';
  }
  
  // For client components
  return (
    typeof window !== 'undefined' && 
    (window as any).__ENV?.INSTANCE_MANAGER_URL
  ) || 'https://eductf.rydersel.cloud/instance-manager/api';
}; 
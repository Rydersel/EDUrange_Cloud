/**
 * Utility for conditional logging based on environment
 * Prevents sensitive information from being logged in production
 */

/**
 * Logs messages only in development environment
 * In production, this function does nothing
 */
export const devLog = (...args: any[]): void => {
  if (process.env.NODE_ENV !== 'production') {
    console.log(...args);
  }
};

/**
 * Logs errors in any environment, but sanitizes sensitive data in production
 */
export const errorLog = (message: string, error?: any): void => {
  if (process.env.NODE_ENV === 'production') {
    // In production, log only the error message without sensitive details
    console.error(message);
  } else {
    // In development, log full error details
    console.error(message, error);
  }
};

/**
 * Logs warnings in any environment, but sanitizes sensitive data in production
 */
export const warnLog = (message: string, data?: any): void => {
  if (process.env.NODE_ENV === 'production') {
    // In production, log only the warning message without sensitive details
    console.warn(message);
  } else {
    // In development, log full warning details
    console.warn(message, data);
  }
}; 
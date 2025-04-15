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

/**
 * Simple logging utility for the application
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

class Logger {
  private prefix: string;

  constructor(prefix: string = '') {
    this.prefix = prefix ? `[${prefix}]` : '';
  }

  debug(message: string, ...args: any[]): void {
    if (process.env.NODE_ENV === 'development') {
      console.debug(`${this.prefix} ${message}`, ...args);
    }
  }

  info(message: string, ...args: any[]): void {
    console.info(`${this.prefix} ${message}`, ...args);
  }

  warn(message: string, ...args: any[]): void {
    console.warn(`${this.prefix} ${message}`, ...args);
  }

  error(message: string, ...args: any[]): void {
    console.error(`${this.prefix} ${message}`, ...args);
  }

  /**
   * Create a new logger with a specific prefix
   */
  createSubLogger(prefix: string): Logger {
    return new Logger(`${this.prefix ? this.prefix + ':' : ''}${prefix}`);
  }
}

export const logger = new Logger('app');
export const createLogger = (prefix: string) => new Logger(prefix); 
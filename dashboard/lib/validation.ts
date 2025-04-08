import { z } from 'zod';

/**
 * Sanitize a string to prevent XSS attacks
 */
export function sanitizeString(input: string): string {
  if (!input) return '';
  
  // Replace potentially dangerous characters
  return input
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;')
    .replace(/\\/g, '&#x5C;')
    .replace(/`/g, '&#96;');
}

/**
 * Common validation schemas
 */
export const validationSchemas = {
  // User input validation
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(2, 'Name must be at least 2 characters'),
  
  // Challenge validation
  challengeName: z.string().min(3, 'Challenge name must be at least 3 characters'),
  challengeDescription: z.string().min(10, 'Description must be at least 10 characters'),
  
  // Competition validation
  competitionName: z.string().min(3, 'Competition name must be at least 3 characters'),
  competitionDescription: z.string().min(3, 'Description must be at least 3 characters'),
  
  // URL validation
  url: z.string().url('Invalid URL'),
  
  // ID validation
  id: z.string().uuid('Invalid ID format'),
};

/**
 * Validate and sanitize user input
 */
export function validateAndSanitize<T>(
  schema: z.ZodType<T>,
  data: unknown
): { success: true; data: T } | { success: false; error: string } {
  try {
    const validatedData = schema.parse(data);
    
    // Sanitize string fields
    if (typeof validatedData === 'object' && validatedData !== null) {
      Object.keys(validatedData).forEach((key) => {
        const value = (validatedData as Record<string, unknown>)[key];
        if (typeof value === 'string') {
          (validatedData as Record<string, unknown>)[key] = sanitizeString(value);
        }
      });
    } else if (typeof validatedData === 'string') {
      return { success: true, data: sanitizeString(validatedData) as unknown as T };
    }
    
    return { success: true, data: validatedData };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessage = error.errors.map(err => `${err.path.join('.')}: ${err.message}`).join(', ');
      return { success: false, error: errorMessage };
    }
    return { success: false, error: 'Validation failed' };
  }
} 
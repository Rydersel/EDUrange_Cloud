export const CODE_REGEX = /^[A-Za-z0-9-]+$/;
export const CODE_MAX_LENGTH = 20;

export interface ValidationResult {
  isValid: boolean;
  error: string | null;
}

export function validateCompetitionCode(code: string): ValidationResult {
  if (!code) {
    return {
      isValid: false,
      error: 'Competition code is required'
    };
  }
  
  if (code.length > CODE_MAX_LENGTH) {
    return {
      isValid: false,
      error: `Code must be ${CODE_MAX_LENGTH} characters or less`
    };
  }
  
  if (!CODE_REGEX.test(code)) {
    return {
      isValid: false,
      error: 'Code can only contain letters, numbers, and hyphens'
    };
  }
  
  return {
    isValid: true,
    error: null
  };
} 
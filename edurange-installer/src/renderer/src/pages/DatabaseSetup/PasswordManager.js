import { generatePassword as generateRandomPasswordUtil } from '../../utils/helpers';

/**
 * Generates a random password for the database
 * @returns {string} - Generated password
 */
export const generateRandomPassword = () => {
  return generateRandomPasswordUtil(16);
}; 
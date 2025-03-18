/**
 * Combines multiple class names into a single string
 * @param  {...string} classes - Class names to combine
 * @returns {string} - Combined class names
 */
export function classNames(...classes) {
  return classes.filter(Boolean).join(' ');
}

/**
 * Formats a command and its arguments for display
 * @param {string} command - The command to format
 * @param {string[]} args - The command arguments
 * @returns {string} - Formatted command string
 */
export function formatCommand(command, args = []) {
  return `${command} ${args.join(' ')}`;
}

/**
 * Retrieves the domain from the wildcard certificate in the cluster
 * @returns {Promise<string|null>} - The domain name or null if not found
 */
export async function getDomainFromCertificate() {
  try {
    // Check if the wildcard certificate exists
    const certResult = await window.api.executeCommand('kubectl', [
      'get',
      'certificate',
      'wildcard-certificate-prod',
      '-n',
      'default',
      '--ignore-not-found'
    ]);

    if (certResult.code !== 0 || !certResult.stdout.includes('wildcard-certificate-prod')) {
      console.log('Wildcard certificate not found');
      return null;
    }

    // Get the certificate details in YAML format
    const certDetailsResult = await window.api.executeCommand('kubectl', [
      'get',
      'certificate',
      'wildcard-certificate-prod',
      '-n',
      'default',
      '-o',
      'yaml'
    ]);

    if (certDetailsResult.code !== 0) {
      console.error('Failed to get certificate details:', certDetailsResult.stderr);
      return null;
    }

    // Parse the YAML output to extract the domain
    const dnsNamesMatch = certDetailsResult.stdout.match(/dnsNames:\s*-\s*'\*\.(.*?)'/);
    if (dnsNamesMatch && dnsNamesMatch[1]) {
      return dnsNamesMatch[1];
    }

    // Alternative approach if the above regex doesn't match
    const lines = certDetailsResult.stdout.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('dnsNames:')) {
        // Look for wildcard entry in the next lines
        for (let j = i + 1; j < lines.length && lines[j].trim().startsWith('-'); j++) {
          const dnsEntry = lines[j].trim();
          const wildcardMatch = dnsEntry.match(/- ['"]?\*\.(.+?)['"]?$/);
          if (wildcardMatch && wildcardMatch[1]) {
            return wildcardMatch[1];
          }
        }
      }
    }

    console.log('Could not extract domain from certificate');
    return null;
  } catch (error) {
    console.error('Error getting domain from certificate:', error);
    return null;
  }
}

/**
 * Validates a domain name
 * @param {string} domain - Domain name to validate
 * @returns {boolean} - Whether the domain is valid
 */
export function isValidDomain(domain) {
  const pattern = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$/i;
  return pattern.test(domain);
}

/**
 * Validates an email address
 * @param {string} email - Email to validate
 * @returns {boolean} - Whether the email is valid
 */
export function isValidEmail(email) {
  const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return pattern.test(email);
}

/**
 * Generates a random password
 * @param {number} length - Length of the password
 * @returns {string} - Generated password
 */
export function generatePassword(length = 16) {
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let password = '';
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * charset.length);
    password += charset[randomIndex];
  }
  return password;
}

/**
 * Formats a timestamp
 * @param {string} timestamp - ISO timestamp
 * @returns {string} - Formatted timestamp
 */
export function formatTimestamp(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleTimeString();
}

/**
 * Checks if a string is a valid JSON
 * @param {string} str - String to check
 * @returns {boolean} - Whether the string is valid JSON
 */
export function isValidJson(str) {
  try {
    JSON.parse(str);
    return true;
  } catch (e) {
    return false;
  }
}

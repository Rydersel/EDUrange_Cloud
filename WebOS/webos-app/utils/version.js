// Import version directly from package.json
import packageJson from '../package.json';

// Export the version for use throughout the application
export const version = packageJson.version;

// Helper function to get a shortened version (e.g., v1.1 instead of 1.1.0)
export const getShortVersion = () => {
  const parts = packageJson.version.split('.');
  return `v${parts[0]}.${parts[1]}`;
}; 
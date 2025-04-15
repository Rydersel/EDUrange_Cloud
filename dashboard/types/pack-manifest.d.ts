export interface PackManifest {
  $schema?: string; // Optional schema URL
  id: string;        // Unique identifier for the pack
  name: string;      // Display name of the pack
  version: string;   // Pack version (e.g., semantic versioning)
  description?: string; // Optional description
  author?: string;    // Optional author name
  license?: string;   // Optional license identifier (e.g., "MIT")
  challenges: string[]; // Array of relative paths to challenge CDF files
  // Add any other fields expected in pack.json here
  website?: string;
  prerequisites?: string[];
  shared_resources?: string[];
} 
import { NextRequest, NextResponse } from 'next/server'; // Use App Router types
import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import { PackManifest } from '@/types/pack-manifest';
import { getServerSession } from 'next-auth/next'; // Correct import for App Router
import authConfig from '@/auth.config'; // Assuming this is your auth config

// Interface for basic challenge metadata extracted from CDF
interface ChallengeMetadata {
  id: string;
  name: string;
  description?: string;
  difficulty?: string;
}

// Updated interface for the API response
interface FeaturedPackInfo {
  filename: string; 
  metadata: PackManifest;
  challenges: ChallengeMetadata[];
}

const FEATURED_PACKS_DIR = path.resolve(process.cwd(), 'featured-packs');

// Use named export GET for App Router
export async function GET(req: NextRequest): Promise<NextResponse> {
  // Method check is implicit for GET export

  // --- Authentication and Authorization ---
  const session = await getServerSession(authConfig); 
  if (!session?.user) { 
    return NextResponse.json({ error: 'Unauthorized: No valid session found' }, { status: 401 });
  }
  if ((session.user as any).role !== 'ADMIN') {
    console.warn(`User ${session.user.email || session.user.id} attempted to list featured packs without ADMIN role.`);
    return NextResponse.json({ error: 'Forbidden: Requires ADMIN role' }, { status: 403 });
  }
  // --- End Auth --- 

  try {
    console.log(`[Featured Packs API] Reading directory: ${FEATURED_PACKS_DIR}`);
    if (!fs.existsSync(FEATURED_PACKS_DIR)) {
        console.warn(`[Featured Packs API] Directory not found: ${FEATURED_PACKS_DIR}`);
        return NextResponse.json({ packs: [] }, { status: 200 }); 
    }

    const dirents = await fs.promises.readdir(FEATURED_PACKS_DIR, { withFileTypes: true });
    const zipFiles = dirents
      .filter(dirent => dirent.isFile() && dirent.name.endsWith('.zip'))
      .map(dirent => dirent.name);

    console.log(`[Featured Packs API] Found zip files: ${zipFiles.join(', ')}`);

    const featuredPacks: FeaturedPackInfo[] = [];

    for (const zipFilename of zipFiles) {
      const zipFilePath = path.join(FEATURED_PACKS_DIR, zipFilename);
      try {
        const zip = new AdmZip(zipFilePath);
        // const packJsonEntry = zip.getEntry('pack.json'); // Original line
        // Find pack.json potentially nested in a directory
        const entries = zip.getEntries();
        const packJsonEntry = entries.find(entry => !entry.isDirectory && entry.entryName.endsWith('pack.json'));

        if (packJsonEntry) {
          console.log(`[Featured Packs API] Found pack.json entry: ${packJsonEntry.entryName} in ${zipFilename}`); // Added log
          const packJsonContent = packJsonEntry.getData().toString('utf8');
          const packMetadata = JSON.parse(packJsonContent) as PackManifest;
          
          // Determine the base path within the zip where pack.json was found
          const packJsonPathParts = packJsonEntry.entryName.split('/');
          const packJsonBaseDir = packJsonPathParts.length > 1 ? packJsonPathParts.slice(0, -1).join('/') + '/' : ''; // e.g., "edurange-web-basics/" or ""
          console.log(`[Featured Packs API] Base directory for challenges in ${zipFilename}: '${packJsonBaseDir}'`);

          if (packMetadata.id && packMetadata.name && packMetadata.version && packMetadata.challenges) {
              const challengeMetadatas: ChallengeMetadata[] = [];
              
              for (const relativeChallengePath of packMetadata.challenges) {
                  // Construct the full path relative to the zip root
                  const fullChallengePath = packJsonBaseDir + relativeChallengePath;
                  console.log(`[Featured Packs API] Looking for challenge entry: ${fullChallengePath}`); // Log the path we're looking for
                  
                  const challengeEntry = zip.getEntry(fullChallengePath); // Use the full path
                  if (challengeEntry) {
                      try {
                          const challengeContent = challengeEntry.getData().toString('utf8');
                          const challengeCdf = JSON.parse(challengeContent);
                          if (challengeCdf.metadata) {
                              challengeMetadatas.push({
                                  id: challengeCdf.metadata.id || relativeChallengePath,
                                  name: challengeCdf.metadata.name || 'Unnamed Challenge',
                                  description: challengeCdf.metadata.description,
                                  difficulty: challengeCdf.metadata.difficulty,
                              });
                          }
                      } catch (cdfError: any) {
                          console.warn(`[Featured Packs API] Error parsing CDF ${relativeChallengePath} in ${zipFilename}:`, cdfError.message);
                          challengeMetadatas.push({
                              id: relativeChallengePath,
                              name: `${relativeChallengePath} (Error Reading)`,
                              description: 'Could not load challenge details.'
                          });
                      }
                  } else {
                     console.warn(`[Featured Packs API] Challenge file ${relativeChallengePath} not found in ${zipFilename}`);
                      challengeMetadatas.push({
                          id: relativeChallengePath,
                          name: `${relativeChallengePath} (Not Found)`,
                          description: 'Challenge file missing from pack.'
                      });
                  }
              }
              
              featuredPacks.push({
                filename: zipFilename,
                metadata: packMetadata,
                challenges: challengeMetadatas,
              });
              console.log(`[Featured Packs API] Successfully read metadata and ${challengeMetadatas.length} challenges from ${zipFilename}`);
          } else {
             console.warn(`[Featured Packs API] Invalid or missing required fields in pack.json from ${zipFilename}`);
          }
        } else {
          console.warn(`[Featured Packs API] Could not find pack.json in ${zipFilename}`);
        }
      } catch (error: any) {
        console.error(`[Featured Packs API] Error processing ${zipFilename}:`, error);
      }
    }
    // Use NextResponse
    return NextResponse.json({ packs: featuredPacks }, { status: 200 });

  } catch (error: any) {
    console.error('[Featured Packs API] Failed to list featured packs:', error);
    // Use NextResponse
    return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
  }
} 
import { NextRequest, NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth'; // Import authOptions from lib/auth
import { getServerSession } from 'next-auth'; // Import getServerSession for server-side auth
import { Session } from 'next-auth'; // Import Session type
import fs from 'fs';
import path from 'path';
import FormData from 'form-data';
import fetch from 'node-fetch'; // Use node-fetch for server-side fetch
// Import CDF validation utilities
import { validateCdfZip, ValidationOptions, ZipValidationResult } from '@/lib/cdf';
import { prisma } from '@/lib/prisma';
import AdmZip from 'adm-zip';
// Import pack manifest type
import { PackManifest } from '@/types/pack-manifest';

// Disable Next.js body parsing for this route
export const config = {
  api: {
    bodyParser: false,
  },
};

// Directory where featured packs (zips) are stored relative to the project root
const FEATURED_PACKS_DIR = path.join(process.cwd(), 'featured-packs');

// Get the backend URL from environment variable or use our local proxy
const USE_PROXY = true; // Set to false in development if needed
// Use query parameter approach with path parameter
const PROXY_ENDPOINT = '/api/proxy/database?path=packs/upload';

// Define extended pack info type that includes optional fields not in ZipValidationResult
interface ExtendedPackInfo {
  name: string;
  version: string;
  description?: string;
  author?: string;
  license?: string;
  website?: string;
}

export async function POST(req: NextRequest) {
  const session = (await getServerSession(authOptions)) as Session | null;
  if (!session || !session.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id; // Get the authenticated user's ID

  try {
    const contentType = req.headers.get('content-type') || '';
    console.log(`[Pack Upload API] Handling ${contentType} upload...`);

    let fileBuffer: Buffer;
    let fileName: string = '';

    // Check if it's a request to install a featured pack (sent as JSON)
    if (contentType.includes('application/json')) {
      const body = await req.json();
      const featuredPackFilename = body.filename; // e.g., "overthewire-bandit.zip"

      if (!featuredPackFilename || typeof featuredPackFilename !== 'string' || !featuredPackFilename.endsWith('.zip')) {
        return NextResponse.json({ error: 'Invalid request format for featured pack' }, { status: 400 });
      }

      const filePath = path.join(FEATURED_PACKS_DIR, featuredPackFilename);
      console.log(`[Pack Upload API] Reading featured pack: ${filePath}`);

      if (!fs.existsSync(filePath)) {
        console.error(`[Pack Upload API] Featured pack file not found: ${filePath}`);
        return NextResponse.json({ error: 'Featured pack not found' }, { status: 404 });
      }
      fileBuffer = fs.readFileSync(filePath);
      fileName = featuredPackFilename;

    } else if (contentType.includes('multipart/form-data')) {
      // Handle direct file upload
      const formData = await req.formData();
      const file = formData.get('file') as Blob | null;

      if (!file) {
        return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
      }

      const fileArrayBuffer = await file.arrayBuffer();
      fileBuffer = Buffer.from(fileArrayBuffer);
      
      // Get filename property safely
      const fileNameFromHeaders = formData.get('filename') as string || 'uploaded-file.zip';
      fileName = fileNameFromHeaders;
    } else {
      return NextResponse.json({ error: 'Unsupported Content-Type' }, { status: 415 });
    }

    // Validate the ZIP file as a CDF pack using our shared utility
    // Use the remote schema validation with fallback to local validation
    const validationOptions: ValidationOptions = { 
      useRemoteSchema: true,
      allowFormatWarnings: true
    };
    
    const validation = await validateCdfZip(fileBuffer, validationOptions);
    if (!validation.isValid) {
      console.error(`[Pack Upload API] CDF pack validation failed: ${JSON.stringify(validation.errors)}`);
      return NextResponse.json({ 
        error: 'Invalid CDF pack format', 
        validationErrors: validation.errors,
        formatWarnings: validation.formatWarnings,
        packInfo: validation.packInfo // Include any partial pack info we were able to extract
      }, { status: 400 });
    }

    // If there are format warnings, include them in the successful response
    let formatWarnings = null;
    if (validation.formatWarnings && validation.formatWarnings.length > 0) {
      const legacyWarnings = validation.formatWarnings.filter(w => w.message.includes('Legacy'));
      const otherWarnings = validation.formatWarnings.filter(w => !w.message.includes('Legacy'));
      
      if (legacyWarnings.length > 0) {
        console.log(`[Pack Upload API] Pack has ${legacyWarnings.length} legacy component format warnings`);
      }
      
      if (otherWarnings.length > 0) {
        console.log(`[Pack Upload API] Pack has ${otherWarnings.length} format warnings`);
      }
      
      formatWarnings = validation.formatWarnings;
    }

    // Log successful validation with pack info
    console.log(`[Pack Upload API] Validated pack "${validation.packInfo.name}" (version ${validation.packInfo.version}) with ${validation.packInfo.numChallenges} challenges`);

    // Try using the proxy first
    try {
      // Create an in-memory form data object for request forwarding  
      const backendFormData = new FormData();
      backendFormData.append('file', fileBuffer, {
        filename: fileName,
        contentType: 'application/zip'
      });

      // Get the base URL for proxy (empty string for relative URL on the same server)
      const baseUrl = globalThis.window ? '' : process.env.NEXTAUTH_URL || 'http://localhost:3000';
      
      // Forward using our local proxy route
      const proxyUrl = `${baseUrl}${PROXY_ENDPOINT}`;
      console.log(`[Pack Upload API] Forwarding pack request via proxy: ${proxyUrl}`);
      
      // Try to connect to the database API directly when running in Kubernetes
      // This bypasses all the proxy-related issues
      let apiResponse;
      
      if (typeof window === 'undefined' && process.env.KUBERNETES_SERVICE_HOST) {
        // We're running server-side in Kubernetes, so we can use the internal service DNS directly
        console.log('[Pack Upload API] Running in Kubernetes, trying direct database API connection');
        const databaseApiUrl = 'http://database-api-service.default.svc.cluster.local';
        const directApiUrl = `${databaseApiUrl}/packs/upload`;
        
        apiResponse = await fetch(directApiUrl, {
          method: 'POST',
          headers: {
            'X-Uploader-User-Id': userId,
          },
          body: backendFormData,
        });
        
        console.log(`[Pack Upload API] Direct API response status: ${apiResponse.status}`);
      } else {
        // Use proxy in non-Kubernetes environments
        apiResponse = await fetch(proxyUrl, {
          method: 'POST',
          headers: {
            'X-Uploader-User-Id': userId,
          },
          body: backendFormData,
        });
        
        console.log(`[Pack Upload API] Proxy response status: ${apiResponse.status}`);
      }

      if (apiResponse.ok) {
        console.log(`[Pack Upload API] Pack upload successful`);
        const responseData = await apiResponse.json();
        
        // Log the successful pack installation
        try {
          const activityEndpoint = typeof window === 'undefined' && process.env.KUBERNETES_SERVICE_HOST ? 
            'http://database-api-service.default.svc.cluster.local/activity/log' : 
            '/api/proxy/database?path=activity/log';
            
          await fetch(activityEndpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              eventType: 'CHALLENGE_PACK_INSTALLED',
              userId: userId,
              severity: 'INFO',
              metadata: {
                packName: validation.packInfo.name,
                packVersion: validation.packInfo.version,
                packChallengeCount: validation.packInfo.numChallenges,
                installTime: new Date().toISOString()
              }
            })
          });
          console.log(`[Pack Upload API] Successfully logged pack installation activity`);
        } catch (logError) {
          console.error(`[Pack Upload API] Failed to log activity:`, logError);
        }
        
        return NextResponse.json({
          ...responseData,
          packInfo: validation.packInfo,
          formatWarnings: formatWarnings
        });
      } else {
        // If API fails, try direct fallback (saving pack record to local database)
        console.error(`[Pack Upload API] API error: ${apiResponse.status} ${apiResponse.statusText}`);
        throw new Error(`API returned status ${apiResponse.status}`);
      }
    } catch (proxyError: unknown) {
      // DIRECT FALLBACK: Create the pack record directly in the database
      const errorMessage = proxyError instanceof Error ? proxyError.message : 'Unknown proxy error';
      console.warn(`[Pack Upload API] Request failed, using direct database access: ${errorMessage}`);
      
      try {
        // Extract pack info from the parsed pack.json (which might have more fields than validation.packInfo)
        const zip = new AdmZip(fileBuffer);
        const packInfo: Partial<PackManifest> = {
          name: validation.packInfo.name,
          version: validation.packInfo.version,
          challenges: [],
        };
        
        // Try to extract more metadata from pack.json
        try {
          const packJsonEntry = zip.getEntries().find(entry => 
            entry.entryName === 'pack.json' || entry.entryName.endsWith('/pack.json')
          );
          
          if (packJsonEntry) {
            const rawPackJson = JSON.parse(packJsonEntry.getData().toString('utf8'));
            const packJson = rawPackJson as PackManifest;
            
            // Update packInfo with all available fields from the pack.json
            if (packJson.name) packInfo.name = packJson.name;
            if (packJson.version) packInfo.version = packJson.version;
            if (packJson.description) packInfo.description = packJson.description;
            if (packJson.author) packInfo.author = packJson.author;
            if (packJson.license) packInfo.license = packJson.license;
            if (packJson.website) packInfo.website = packJson.website;
            if (packJson.challenges) packInfo.challenges = packJson.challenges;
          }
        } catch (parseError) {
          console.warn('[Pack Upload API] Could not extract extended metadata from pack.json');
        }
        
        // Create the pack record in the database
        const pack = await prisma.challengePack.create({
          data: {
            name: packInfo.name!,
            description: packInfo.description || '',
            version: packInfo.version!,
            author: packInfo.author || '',
            license: packInfo.license || 'Unknown',
            website: packInfo.website || '',
          }
        });

        // Return successful response with direct database fallback info
        return NextResponse.json({
          message: "Challenge pack installed successfully (direct database fallback)",
          pack: {
            id: pack.id,
            name: pack.name,
            description: pack.description,
            version: pack.version
          },
          packInfo: validation.packInfo,
          formatWarnings: formatWarnings,
          source: 'direct'
        });
      } catch (directDbError: unknown) {
        const dbErrorMessage = directDbError instanceof Error ? directDbError.message : 'Unknown database error';
        console.error('[Pack Upload API] Direct database fallback failed:', dbErrorMessage);
        throw new Error(`Direct database fallback failed: ${dbErrorMessage}`);
      }
    }
  } catch (error: any) {
    console.error('[Pack Upload API] Error processing pack upload:', error);
    return NextResponse.json({ error: 'Failed to process pack upload', details: error.message }, { status: 500 });
  }
}

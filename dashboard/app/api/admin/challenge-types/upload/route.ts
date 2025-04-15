import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { ActivityLogger, ActivityEventType } from '@/lib/activity-logger';
import { getInstanceManagerUrl } from '@/lib/api-config';
import { writeFile, mkdir, readFile } from 'fs/promises';
import path from 'path';
import os from 'os';
import JSZip from 'jszip';

// Temporary file upload handling
async function saveTempFile(formData: FormData): Promise<string> {
  const file = formData.get('file') as File;
  if (!file) {
    throw new Error('No file provided');
  }

  // Create a temporary directory
  const tmpDirPath = path.join(os.tmpdir(), 'edurange-uploads');
  await mkdir(tmpDirPath, { recursive: true });
  const fileName = typeof file.name === 'string' ? file.name : `upload-${Date.now()}.json`;
  const filePath = path.join(tmpDirPath, fileName);
  
  // Write the file
  const bytes = await file.arrayBuffer();
  await writeFile(filePath, Buffer.from(bytes));
  
  return filePath;
}

// Create a temp ZIP file from a JSON file for the instance manager
async function createTempZipFromJson(jsonPath: string): Promise<string> {
  const zip = new JSZip();
  
  // Read the JSON file
  const jsonContent = await readFile(jsonPath, 'utf-8');
  
  // Get the filename
  const fileName = path.basename(jsonPath);
  
  // Add the JSON file to the zip
  zip.file(fileName, jsonContent);
  
  // Generate the zip content
  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
  
  // Write the zip file
  const zipPath = jsonPath + '.zip';
  await writeFile(zipPath, zipBuffer);
  
  return zipPath;
}

export async function POST(req: NextRequest) {
  try {
    // Check if user is authenticated and has admin role
    console.log('[CTD Upload] Getting server session for authentication check');
    const session = await getServerSession(authOptions);
    console.log(`[CTD Upload] Authentication check - Session exists: ${!!session}, User exists: ${!!session?.user}`);
    
    if (session?.user) {
      console.log(`[CTD Upload] User role: ${session.user.role}, User ID: ${session.user.id}`);
    }
    
    if (!session?.user) {
      console.log('[CTD Upload] Authentication failed - No valid session or user');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (session.user.role !== 'ADMIN') {
      console.log(`[CTD Upload] Authorization failed - User role is ${session.user.role}, not ADMIN`);
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    
    console.log('[CTD Upload] Authentication and authorization passed');

    // Parse the form data
    const formData = await req.formData();
    const filePath = await saveTempFile(formData);
    
    // Get the instance manager URL
    const instanceManagerUrl = getInstanceManagerUrl();
    
    // Check if this is a JSON file that needs to be zipped
    const isJsonFile = filePath.endsWith('.json') || filePath.endsWith('.ctd.json');
    let fileToSend = filePath;
    
    if (isJsonFile) {
      // Create a ZIP file from the JSON file
      fileToSend = await createTempZipFromJson(filePath);
    }
    
    // Read the file directly from the file system
    const fileBuffer = await readFile(fileToSend);
    const fileBlob = new Blob([fileBuffer]);
    
    // Create a new FormData object to send to the instance manager
    const managerFormData = new FormData();
    managerFormData.append('file', fileBlob, path.basename(fileToSend));
    managerFormData.append('type', 'ctd'); // Mark this as a CTD upload
    
    // Send to instance manager's upload-ctd endpoint via the proxy
    // Get the base URL for proxy (empty string for relative URL on the same server)
    const baseUrl = globalThis.window ? '' : process.env.NEXTAUTH_URL || '';
      
    // Use our instance-manager-proxy endpoint instead of direct instance manager URL
    const proxyUrl = `${baseUrl}/api/instance-manager-proxy/upload-ctd`;
    
    console.log(`Forwarding CTD upload request to proxy: ${proxyUrl}`);
    
    // Extract cookies and authorization headers from the original request
    const headers = new Headers();
    
    // Copy the cookie header to maintain session information
    const cookies = req.headers.get('cookie');
    if (cookies) {
      headers.set('cookie', cookies);
      console.log('[CTD Upload] Forwarding cookie header to maintain session');
    } else {
      console.log('[CTD Upload] Warning: No cookie header found in request');
    }
    
    // Get any authorization header if present
    const authorization = req.headers.get('authorization');
    if (authorization) {
      headers.set('authorization', authorization);
    }
    
    // Make the proxy request with the headers
    const response = await fetch(proxyUrl, {
      method: 'POST',
      headers: headers,
      body: managerFormData,
    });
    
    if (!response.ok) {
      // Try to get error message from response
      let errorMessage = `Failed to upload CTD file: ${response.status}`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorMessage;
      } catch (e) {
        // If we can't parse JSON, use the text response
        errorMessage = await response.text() || errorMessage;
      }
      throw new Error(errorMessage);
    }
    
    const result = await response.json();
    
    // Extract the type information from the result
    const typeName = result.typeName || 'Unknown Type';
    const isUpdate = result.isUpdate || false;
    
    // Use findFirst instead of findUnique to avoid unique constraint issues
    const existingType = await prisma.challengeType.findFirst({
      where: {
        name: {
          equals: typeName
        }
      }
    });
    
    let challengeType;
    let databaseAction = 'none';
    
    if (existingType) {
      // Type already exists, just return it
      challengeType = existingType;
      databaseAction = 'existing';
      
      // Log information about the existing type
      console.log(`Challenge type '${typeName}' already exists with ID: ${challengeType.id}`);
    } else {
      // Create new type
      challengeType = await prisma.challengeType.create({
        data: { 
          name: typeName,
        },
      });
      databaseAction = 'created';
      
      console.log(`Created new challenge type '${typeName}' with ID: ${challengeType.id}`);
    }
    
    // Log the installation event 
    await ActivityLogger.logActivity({
      // Use the same event type for now, but add isUpdate to metadata
      eventType: ActivityEventType.CHALLENGE_PACK_INSTALLED,
      userId: session.user.id,
      metadata: {
        typeName: typeName,
        typeId: challengeType.id,
        source: 'CTD upload',
        timestamp: new Date().toISOString(),
        isUpdate: isUpdate,
        databaseAction: databaseAction,
      }
    });
    
    // Determine appropriate message based on CTD file status and database action
    let message = '';
    if (isUpdate) {
      message = `Challenge type '${typeName}' definition updated successfully`;
    } else {
      message = `Challenge type '${typeName}' installed successfully`;
    }
    
    if (databaseAction === 'created') {
      message += ' and added to the database';
    } else if (databaseAction === 'existing') {
      message += ' (already existed in database)';
    }
    
    return NextResponse.json({
      message: message,
      typeId: challengeType.id,
      typeName: typeName,
      description: result.description || '',
      version: result.version || '1.0.0',
      isUpdate: isUpdate,
      databaseAction: databaseAction,
    });
    
  } catch (error) {
    console.error('Error processing CTD upload:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'An unexpected error occurred during upload',
      },
      { status: 500 }
    );
  }
} 
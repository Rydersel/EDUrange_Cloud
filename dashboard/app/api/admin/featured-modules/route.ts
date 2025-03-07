import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import authConfig from '@/auth.config';
import { promises as fs } from 'fs';
import path from 'path';
import { ChallengeModuleFile } from '@/types/challenge-module';
import { requireAdmin } from '@/lib/auth-utils';

export async function GET(req: NextRequest) {
  try {
    // Check if user is admin using the utility function
    const adminCheckResult = await requireAdmin(req);
    if (adminCheckResult) return adminCheckResult;

    // Get the featured modules directory path
    const featuredModulesDir = path.join(process.cwd(), 'public', 'featured-modules');
    
    // Read the directory
    let files;
    try {
      files = await fs.readdir(featuredModulesDir);
    } catch (error) {
      console.error('Error reading featured modules directory:', error);
      return NextResponse.json({ 
        modules: [],
        message: 'No featured modules found' 
      });
    }
    
    // Filter for JSON files
    const jsonFiles = files.filter(file => file.endsWith('.json'));
    
    // Read each file and parse its contents
    const modules = await Promise.all(
      jsonFiles.map(async (filename) => {
        const filePath = path.join(featuredModulesDir, filename);
        const fileContent = await fs.readFile(filePath, 'utf8');
        
        try {
          const data = JSON.parse(fileContent) as ChallengeModuleFile;
          return { filename, data };
        } catch (error) {
          console.error(`Error parsing ${filename}:`, error);
          return null;
        }
      })
    );
    
    // Filter out any null values from failed parsing
    const validModules = modules.filter(module => module !== null);
    
    return NextResponse.json({
      modules: validModules,
      count: validModules.length
    });
  } catch (error) {
    console.error('Error fetching featured modules:', error);
    return NextResponse.json(
      { error: 'Failed to fetch featured modules' },
      { status: 500 }
    );
  }
} 
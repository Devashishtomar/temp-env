import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';

export async function GET(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  try {
    const filePath = join(process.cwd(), 'uploads', ...params.path);
    
    // Security check - ensure the path is within uploads directory
    const resolvedPath = join(process.cwd(), 'uploads', ...params.path);
    const uploadsDir = join(process.cwd(), 'uploads');
    
    if (!resolvedPath.startsWith(uploadsDir)) {
      return new NextResponse('Forbidden', { status: 403 });
    }
    
    const fileBuffer = await readFile(resolvedPath);
    
    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=31536000', // Cache for 1 year
      },
    });
  } catch (error) {
    console.error('Error serving thumbnail:', error);
    return new NextResponse('Not Found', { status: 404 });
  }
}

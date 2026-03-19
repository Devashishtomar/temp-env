import { NextRequest, NextResponse } from 'next/server';
import { readFile, readdir } from 'fs/promises';
import { resolve, extname } from 'path';
import { access } from 'fs/promises';

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Range',
    },
  });
}

export async function HEAD(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const filePath = searchParams.get('file');
    const filename = searchParams.get('filename');

    if (!filePath || !filename) {
      return NextResponse.json({ error: 'Missing file path or filename' }, { status: 400 });
    }

    // Security: Ensure the file is within the uploads directory
    const uploadsDir = resolve(process.cwd(), 'uploads');
    const fullPath = resolve(filePath);
    
    if (!fullPath.startsWith(uploadsDir)) {
      console.error('Access denied: File path outside uploads directory', { filePath, fullPath, uploadsDir });
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Check if file exists
    try {
      await access(fullPath);
    } catch (error) {
      console.error('File not found:', { fullPath, error });
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    // Determine content type based on file extension
    const ext = extname(filename).toLowerCase();
    let contentType = 'application/octet-stream';
    
    switch (ext) {
      case '.mp4':
        contentType = 'video/mp4';
        break;
      case '.wav':
        contentType = 'audio/wav';
        break;
      case '.mp3':
        contentType = 'audio/mpeg';
        break;
      case '.srt':
        contentType = 'application/x-subrip';
        break;
      case '.vtt':
        contentType = 'text/vtt';
        break;
      case '.txt':
        contentType = 'text/plain';
        break;
      case '.json':
        contentType = 'application/json';
        break;
      default:
        contentType = 'application/octet-stream';
    }

    // Return headers only
    return new NextResponse(null, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Range',
        'Accept-Ranges': 'bytes',
      },
    });

  } catch (error) {
    console.error('HEAD request error:', error);
    return NextResponse.json({ error: 'Download check failed' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const filePath = searchParams.get('file');
    const filename = searchParams.get('filename');

    if (!filePath || !filename) {
      return NextResponse.json({ error: 'Missing file path or filename' }, { status: 400 });
    }

    // Security: Ensure the file is within the uploads directory
    const uploadsDir = resolve(process.cwd(), 'uploads');
    const fullPath = resolve(filePath);
    
    if (!fullPath.startsWith(uploadsDir)) {
      console.error('Access denied: File path outside uploads directory', { filePath, fullPath, uploadsDir });
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Check if file exists
    try {
      await access(fullPath);
    } catch (error) {
      console.error('File not found:', { fullPath, error });
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    // Read the file
    const fileBuffer = await readFile(fullPath);

    // Determine content type based on file extension
    const ext = extname(filename).toLowerCase();
    let contentType = 'application/octet-stream'; // default
    
    switch (ext) {
      case '.mp4':
        contentType = 'video/mp4';
        break;
      case '.wav':
        contentType = 'audio/wav';
        break;
      case '.mp3':
        contentType = 'audio/mpeg';
        break;
      case '.srt':
        contentType = 'application/x-subrip';
        break;
      case '.vtt':
        contentType = 'text/vtt';
        break;
      case '.txt':
        contentType = 'text/plain';
        break;
      case '.json':
        contentType = 'application/json';
        break;
      default:
        contentType = 'application/octet-stream';
    }

    console.log('Downloading file:', { filename, fullPath, contentType, size: fileBuffer.length });

    // Return the file with proper headers
    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': fileBuffer.length.toString(),
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Range',
        'Accept-Ranges': 'bytes',
      },
    });

  } catch (error) {
    console.error('Download error:', error);
    return NextResponse.json({ error: 'Download failed' }, { status: 500 });
  }
} 

export async function POST(request: NextRequest) {
  // Debug endpoint to list files in uploads directory
  try {
    const uploadsDir = resolve(process.cwd(), 'uploads');
    
    const listFiles = async (dir: string): Promise<any[]> => {
      const items = await readdir(dir, { withFileTypes: true });
      const files = [];
      
      for (const item of items) {
        const fullPath = resolve(dir, item.name);
        if (item.isDirectory()) {
          const subFiles = await listFiles(fullPath);
          files.push(...subFiles);
        } else {
          files.push({
            name: item.name,
            path: fullPath,
            relativePath: fullPath.replace(uploadsDir, '').replace(/^[\/\\]/, ''),
            size: (await readFile(fullPath)).length
          });
        }
      }
      
      return files;
    };
    
    const files = await listFiles(uploadsDir);
    
    return NextResponse.json({
      uploadsDir,
      totalFiles: files.length,
      files: files
    });
    
  } catch (error) {
    console.error('Debug error:', error);
    return NextResponse.json({ error: 'Debug failed' }, { status: 500 });
  }
} 
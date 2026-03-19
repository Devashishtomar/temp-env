export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { resolve } from 'path';
import { access } from 'fs/promises';
import ffmpeg from 'fluent-ffmpeg';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const filePath = searchParams.get('file');

    if (!filePath) {
      return NextResponse.json({ error: 'Missing file path' }, { status: 400 });
    }

    // Security: Ensure the file is within the uploads directory
    const uploadsDir = resolve(process.cwd(), 'uploads');
    const fullPath = resolve(filePath);
    
    if (!fullPath.startsWith(uploadsDir)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Check if file exists
    try {
      await access(fullPath);
    } catch {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    // Generate thumbnail at 1 second mark
    return new Promise<NextResponse>((resolve) => {
      const thumbnailPath = fullPath.replace('.mp4', '_thumb.jpg');
      
      ffmpeg(fullPath)
        .screenshots({
          timestamps: ['00:00:01'],
          filename: thumbnailPath.split('/').pop(),
          folder: thumbnailPath.split('/').slice(0, -1).join('/'),
          size: '320x240'
        })
        .on('end', () => {
          // Return a simple colored placeholder for now
          // In production, you'd serve the actual thumbnail
          const svg = `<svg width="320" height="240" xmlns="http://www.w3.org/2000/svg">
            <rect width="320" height="240" fill="#b6e0f7"/>
            <text x="160" y="120" text-anchor="middle" fill="#222" font-family="Arial" font-size="16">Video Preview</text>
          </svg>`;
          
          resolve(new NextResponse(svg, {
            headers: {
              'Content-Type': 'image/svg+xml',
              'Cache-Control': 'public, max-age=3600',
            },
          }));
        })
        .on('error', (err) => {
          console.error('Thumbnail generation error:', err);
          // Return a fallback SVG
          const svg = `<svg width="320" height="240" xmlns="http://www.w3.org/2000/svg">
            <rect width="320" height="240" fill="#f7b6e0"/>
            <text x="160" y="120" text-anchor="middle" fill="#222" font-family="Arial" font-size="16">Video Preview</text>
          </svg>`;
          
          resolve(new NextResponse(svg, {
            headers: {
              'Content-Type': 'image/svg+xml',
              'Cache-Control': 'public, max-age=3600',
            },
          }));
        });
    });

  } catch (error) {
    console.error('Thumbnail error:', error);
    return NextResponse.json({ error: 'Thumbnail generation failed' }, { status: 500 });
  }
} 


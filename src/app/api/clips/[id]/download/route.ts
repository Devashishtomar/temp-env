import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getClipById } from '@/lib/db';
import { readFile } from 'fs/promises';
import { join } from 'path';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const clipId = parseInt(params.id);
    if (isNaN(clipId)) {
      return NextResponse.json({ error: 'Invalid clip ID' }, { status: 400 });
    }

    // Get clip and verify ownership
    const clip = await getClipById(clipId);
    
    if (!clip) {
      return NextResponse.json({ error: 'Clip not found' }, { status: 404 });
    }

    // Verify the clip belongs to the authenticated user
    // We need to get the user's ID to compare with clip.user_id
    const { getUserByEmail } = await import('@/lib/db');
    const user = await getUserByEmail(session.user.email);
    if (!user || clip.user_id !== user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Read the file
    const filePath = join(process.cwd(), clip.file_path);
    const fileBuffer = await readFile(filePath);

    // Return the file
    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Disposition': `attachment; filename="${clip.filename}"`,
        'Content-Length': fileBuffer.length.toString(),
      },
    });

  } catch (error) {
    console.error('Error downloading clip:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}


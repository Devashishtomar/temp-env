import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getClipById, updateClipFilePath, getOrCreateUser } from '@/lib/db';
import { copyFile } from 'fs/promises';

// Helper to format timestamp for logs
function getTimestamp(): string {
  return new Date().toISOString().replace('T', ' ').substring(0, 19);
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    console.log(`=== UPDATE CLIP: STEP 1 - AUTHENTICATION === [${getTimestamp()}]`);
    
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      console.error(`[U1] Unauthorized - No session or email [${getTimestamp()}]`);
      return NextResponse.json({ 
        error: 'An error occurred. Please try again.',
        errorCode: 'U1'
      }, { status: 401 });
    }

    console.log(`=== UPDATE CLIP: STEP 2 - REQUEST VALIDATION === [${getTimestamp()}]`);
    
    const { clipId, editedFilePath } = await request.json();
    
    if (!clipId || !editedFilePath) {
      console.error(`[U2] Missing required parameters [${getTimestamp()}]`);
      return NextResponse.json({ 
        error: 'An error occurred. Please try again.',
        errorCode: 'U2'
      }, { status: 400 });
    }

    console.log(`[STEP 2] Request parsed - Clip ID: ${clipId}, Edited file path: ${editedFilePath} [${getTimestamp()}]`);

    console.log(`=== UPDATE CLIP: STEP 3 - USER VERIFICATION === [${getTimestamp()}]`);
    
    const user = await getOrCreateUser(session.user.email, session.user.name || '');
    console.log(`[STEP 3] User verified - ID: ${user.id} [${getTimestamp()}]`);

    console.log(`=== UPDATE CLIP: STEP 4 - CLIP RETRIEVAL === [${getTimestamp()}]`);
    
    const clip = await getClipById(clipId);
    if (!clip) {
      console.error(`[U4] Clip not found [${getTimestamp()}]`);
      return NextResponse.json({ 
        error: 'An error occurred. Please try again.',
        errorCode: 'U4'
      }, { status: 404 });
    }

    // Verify the clip belongs to the user
    if (clip.user_id !== user.id) {
      console.error(`[U4] Unauthorized - Clip does not belong to user [${getTimestamp()}]`);
      return NextResponse.json({ 
        error: 'An error occurred. Please try again.',
        errorCode: 'U4'
      }, { status: 403 });
    }

    console.log(`[STEP 4] Clip retrieved - Original path: ${clip.file_path} [${getTimestamp()}]`);

    console.log(`=== UPDATE CLIP: STEP 5 - FILE REPLACEMENT === [${getTimestamp()}]`);
    
    // Replace the original file with the edited file
    try {
      // Copy edited file to original location
      await copyFile(editedFilePath, clip.file_path);
      console.log(`[STEP 5] File replaced successfully [${getTimestamp()}]`);
      
      // Optionally delete the edited file (or keep it as backup)
      // await unlink(editedFilePath);
    } catch (error: any) {
      console.error(`[U5] File replacement failed:`, error);
      return NextResponse.json({ 
        error: 'An error occurred. Please try again.',
        errorCode: 'U5'
      }, { status: 500 });
    }

    console.log(`=== UPDATE CLIP: STEP 6 - DATABASE UPDATE === [${getTimestamp()}]`);
    
    // Update the database (file_path should already be correct, but update filename if needed)
    const updatedClip = await updateClipFilePath(clipId, clip.file_path);
    console.log(`[STEP 6] Database updated successfully [${getTimestamp()}]`);

    const processingTime = Date.now() - startTime;
    console.log(`[SUCCESS] Clip updated successfully - Clip ID: ${clipId} (${processingTime}ms) [${getTimestamp()}]`);

    return NextResponse.json({ 
      success: true,
      clip: updatedClip
    });

  } catch (error: any) {
    const processingTime = Date.now() - startTime;
    const timestamp = getTimestamp();
    
    console.error(`[ERROR] Update clip failed [${timestamp}]`);
    console.error(`[ERROR] Error message:`, error.message || error);
    console.error(`[ERROR] Error stack:`, error.stack);
    console.error(`[ERROR] Processing time: ${processingTime}ms`);
    
    return NextResponse.json({ 
      error: 'An error occurred. Please try again.',
      errorCode: 'U0'
    }, { status: 500 });
  }
}


import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getOrCreateUser, createProject, createClip } from '@/lib/db';
import { copyFile, mkdir } from 'fs/promises';
import { join, resolve } from 'path';

// Helper to format timestamp for logs
function getTimestamp(): string {
  return new Date().toISOString().replace('T', ' ').substring(0, 19);
}

// Helper to format timing with timestamp
function formatTiming(timeMs: number): string {
  const timestamp = getTimestamp();
  const seconds = (timeMs / 1000).toFixed(2);
  return `${timeMs}ms (${seconds}s) [${timestamp}]`;
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const errorStep = { step: 0, code: 'S0' }; // S prefix for save-clips errors

  try {
    console.log(`=== SAVE CLIPS: STEP 1 - AUTHENTICATION === [${getTimestamp()}]`);
    errorStep.step = 1;
    errorStep.code = 'S1';
    
    const session = await getServerSession(authOptions);
    console.log(`[STEP 1] Session check - Has session: ${!!session}, Email: ${session?.user?.email || 'none'} [${getTimestamp()}]`);
    
    if (!session?.user?.email) {
      console.error(`[S1] Unauthorized - No session or email [${getTimestamp()}]`);
      return NextResponse.json({ 
        error: 'An error occurred. Please try again.',
        errorCode: 'S1'
      }, { status: 401 });
    }

    console.log(`=== SAVE CLIPS: STEP 2 - REQUEST VALIDATION === [${getTimestamp()}]`);
    errorStep.step = 2;
    errorStep.code = 'S2';
    
    const { results, sourceUrl, sourceType } = await request.json();
    console.log(`[STEP 2] Request parsed - Has results: ${!!results}, Has clips: ${!!results?.clips}, Clips count: ${results?.clips?.length || 0} [${getTimestamp()}]`);

    if (!results || !results.clips) {
      console.error('[S2] Invalid data - Missing results or clips');
      return NextResponse.json({ 
        error: 'An error occurred. Please try again.',
        errorCode: 'S2'
      }, { status: 400 });
    }

    console.log(`=== SAVE CLIPS: STEP 3 - USER CREATION === [${getTimestamp()}]`);
    errorStep.step = 3;
    errorStep.code = 'S3';
    
    // Get or create user
    console.log(`[STEP 3] Getting or creating user - Email: ${session.user.email} [${getTimestamp()}]`);
    let user;
    try {
      user = await getOrCreateUser(session.user.email, session.user.name || 'User');
      console.log(`[STEP 3] User ready - ID: ${user.id} [${getTimestamp()}]`);
    } catch (e: any) {
      console.error(`[S3] User creation failed:`, e);
      throw new Error(`S3: User creation failed - ${e.message || 'Unknown error'}`);
    }

    console.log(`=== SAVE CLIPS: STEP 4 - PROJECT CREATION === [${getTimestamp()}]`);
    errorStep.step = 4;
    errorStep.code = 'S4';
    
    // Generate project title from source
    let projectTitle = 'My Video Project';
    if (sourceType === 'youtube' && sourceUrl) {
      projectTitle = `YouTube Video - ${new Date().toLocaleDateString()}`;
    } else {
      projectTitle = `Uploaded Video - ${new Date().toLocaleDateString()}`;
    }
    console.log(`[STEP 4] Creating project - Title: ${projectTitle} [${getTimestamp()}]`);

    // Create project
    let project;
    try {
      project = await createProject(
        user.id,
        projectTitle,
        results.clips[0]?.path || sourceUrl || '',
        sourceType || 'video'
      );
      console.log(`[STEP 4] Project created - ID: ${project.id} [${getTimestamp()}]`);
    } catch (e: any) {
      console.error(`[S4] Project creation failed:`, e);
      throw new Error(`S4: Project creation failed - ${e.message || 'Unknown error'}`);
    }

    console.log(`=== SAVE CLIPS: STEP 5 - DIRECTORY CREATION === [${getTimestamp()}]`);
    errorStep.step = 5;
    errorStep.code = 'S5';
    
    // Create user-specific directory
    const userDir = resolve(process.cwd(), 'uploads', `user_${user.id}`);
    const projectDir = join(userDir, `project_${project.id}`);
    console.log(`[STEP 5] Creating directories - Project dir: ${projectDir} [${getTimestamp()}]`);
    try {
      await mkdir(projectDir, { recursive: true });
      console.log(`[STEP 5] Directories created successfully [${getTimestamp()}]`);
    } catch (e: any) {
      console.error(`[S5] Directory creation failed:`, e);
      throw new Error(`S5: Directory creation failed - ${e.message || 'Unknown error'}`);
    }

    console.log(`=== SAVE CLIPS: STEP 6 - CLIP SAVING === [${getTimestamp()}]`);
    errorStep.step = 6;
    errorStep.code = 'S6';
    
    // Save clips to database and copy files
    const savedClips = [];
    console.log(`[STEP 6] Saving ${results.clips.length} clips... [${getTimestamp()}]`);
    for (let i = 0; i < results.clips.length; i++) {
      const clip = results.clips[i];
      console.log(`[STEP 6.${i + 1}] Processing clip ${i + 1}/${results.clips.length} - Filename: ${clip.filename} [${getTimestamp()}]`);
      
      try {
        // Copy file to user's directory
        const newFilePath = join(projectDir, clip.filename);
        console.log(`[STEP 6.${i + 1}] Copying file from ${clip.path} to ${newFilePath} [${getTimestamp()}]`);
        await copyFile(clip.path, newFilePath);
        console.log(`[STEP 6.${i + 1}] File copied successfully [${getTimestamp()}]`);

        // Create clip record in database
        console.log(`[STEP 6.${i + 1}] Creating database record... [${getTimestamp()}]`);
        const savedClip = await createClip(
          project.id,
          clip.filename,
          newFilePath,
          clip.start,
          clip.end,
          clip.title,
          clip.description
        );
        console.log(`[STEP 6.${i + 1}] Clip saved - ID: ${savedClip.id} [${getTimestamp()}]`);
        savedClips.push(savedClip);
      } catch (e: any) {
        console.error(`[S6] Failed to save clip ${i + 1}:`, e);
        throw new Error(`S6: Clip saving failed at clip ${i + 1} - ${e.message || 'Unknown error'}`);
      }
    }

    const processingTime = Date.now() - startTime;
    console.log(`[SUCCESS] All clips saved successfully - Project ID: ${project.id}, Clips: ${savedClips.length} ${formatTiming(processingTime)}`);

    return NextResponse.json({
      success: true,
      projectId: project.id,
      clipsCount: savedClips.length,
      message: 'Clips saved successfully'
    });

  } catch (error: any) {
    const processingTime = Date.now() - startTime;
    const errorCode = error.message?.startsWith('S') ? error.message.split(':')[0] : errorStep.code;
    const errorStepNum = errorStep.step;
    
    const timestamp = getTimestamp();
    console.error(`[ERROR] Save clips failed at step ${errorStepNum} (${errorCode}) [${timestamp}]`);
    console.error(`[ERROR] Error message:`, error.message || error);
    console.error(`[ERROR] Error stack:`, error.stack);
    console.error(`[ERROR] Processing time: ${formatTiming(processingTime)}`);
    
    return NextResponse.json({ 
      error: 'An error occurred. Please try again.',
      errorCode: errorCode
    }, { status: 500 });
  }
}


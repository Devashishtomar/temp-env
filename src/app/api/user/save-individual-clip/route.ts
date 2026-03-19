import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getOrCreateUser, createProject, createClip } from '@/lib/db';
import { mkdir, copyFile } from 'fs/promises';
import { join, resolve } from 'path';
import ffmpeg from 'fluent-ffmpeg';

export const dynamic = 'force-dynamic';

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
  const errorStep = { step: 0, code: 'I0' }; // I prefix for individual-clip errors

  try {
    console.log(`=== SAVE INDIVIDUAL CLIP: STEP 1 - AUTHENTICATION === [${getTimestamp()}]`);
    errorStep.step = 1;
    errorStep.code = 'I1';
    
    const session = await getServerSession(authOptions);
    console.log(`[STEP 1] Session check - Has session: ${!!session}, Email: ${session?.user?.email || 'none'} [${getTimestamp()}]`);
    
    if (!session?.user?.email) {
      console.error(`[I1] Unauthorized - No session or email [${getTimestamp()}]`);
      return NextResponse.json({ 
        error: 'An error occurred. Please try again.',
        errorCode: 'I1'
      }, { status: 401 });
    }

    console.log(`=== SAVE INDIVIDUAL CLIP: STEP 2 - REQUEST VALIDATION === [${getTimestamp()}]`);
    errorStep.step = 2;
    errorStep.code = 'I2';
    
    const { clip, clipIndex, results, sourceUrl, sourceType, sourceProjectId } = await request.json();
    console.log(`[STEP 2] Request parsed - Has clip: ${!!clip}, Has results: ${!!results}, Clip index: ${clipIndex} [${getTimestamp()}]`);

    if (!clip || !results) {
      console.error('[I2] Missing required data - clip or results missing');
      return NextResponse.json({ 
        error: 'An error occurred. Please try again.',
        errorCode: 'I2'
      }, { status: 400 });
    }

    console.log(`=== SAVE INDIVIDUAL CLIP: STEP 3 - USER CREATION === [${getTimestamp()}]`);
    errorStep.step = 3;
    errorStep.code = 'I3';
    
    // Get or create user
    console.log(`[STEP 3] Getting or creating user - Email: ${session.user.email} [${getTimestamp()}]`);
    let user;
    try {
      user = await getOrCreateUser(session.user.email, session.user.name || '');
      console.log(`[STEP 3] User ready - ID: ${user.id} [${getTimestamp()}]`);
    } catch (e: any) {
      console.error(`[I3] User creation failed:`, e);
      throw new Error(`I3: User creation failed - ${e.message || 'Unknown error'}`);
    }

    console.log(`=== SAVE INDIVIDUAL CLIP: STEP 4 - PROJECT TITLE GENERATION === [${getTimestamp()}]`);
    errorStep.step = 4;
    errorStep.code = 'I4';
    
    // Generate project title based on the video source
    let projectTitle = '';
    try {
      if (results.summary) {
        projectTitle = results.summary.substring(0, 50).trim();
        if (projectTitle.length < results.summary.length) {
          projectTitle += '...';
        }
      } else if (results.transcription) {
        projectTitle = results.transcription.substring(0, 50).trim();
        if (projectTitle.length < results.transcription.length) {
          projectTitle += '...';
        }
      } else {
        projectTitle = sourceType === 'youtube' ? `YouTube Video - ${new Date().toLocaleDateString()}` : `Uploaded Video - ${new Date().toLocaleDateString()}`;
      }
      console.log(`[STEP 4] Project title generated: ${projectTitle} [${getTimestamp()}]`);
    } catch (error) {
      console.error('[I4] Error generating project title:', error);
      projectTitle = sourceType === 'youtube' ? `YouTube Video - ${new Date().toLocaleDateString()}` : `Uploaded Video - ${new Date().toLocaleDateString()}`;
    }

    console.log(`=== SAVE INDIVIDUAL CLIP: STEP 5 - PROJECT RETRIEVAL/CREATION === [${getTimestamp()}]`);
    errorStep.step = 5;
    errorStep.code = 'I5';
    
    let project;
    
    if (sourceProjectId) {
      console.log(`[STEP 5] Using existing project - Source project ID: ${sourceProjectId} [${getTimestamp()}]`);
      const { getProjectById } = await import('@/lib/db');
      try {
        project = await getProjectById(parseInt(sourceProjectId));
        if (!project || project.user_id !== user.id) {
          console.error(`[I5] Invalid source project - Project not found or user mismatch [${getTimestamp()}]`);
          return NextResponse.json({ 
            error: 'An error occurred. Please try again.',
            errorCode: 'I5'
          }, { status: 400 });
        }
        console.log(`[STEP 5] Project retrieved - ID: ${project.id} [${getTimestamp()}]`);
      } catch (e: any) {
        console.error(`[I5] Project retrieval failed:`, e);
        throw new Error(`I5: Project retrieval failed - ${e.message || 'Unknown error'}`);
      }
    } else {
      console.log(`[STEP 5] Finding or creating project - Title: ${projectTitle} [${getTimestamp()}]`);
      // Check if project with same title already exists for this user
      try {
        project = await findProjectByTitle(user.id, projectTitle);
        
        if (!project) {
          console.log(`[STEP 5] Creating new project... [${getTimestamp()}]`);
          project = await createProject(
            user.id,
            projectTitle,
            clip.path || sourceUrl || '',
            sourceType || 'video'
          );
          console.log(`[STEP 5] Project created - ID: ${project.id} [${getTimestamp()}]`);
        } else {
          console.log(`[STEP 5] Using existing project - ID: ${project.id} [${getTimestamp()}]`);
        }
      } catch (e: any) {
        console.error(`[I5] Project creation/retrieval failed:`, e);
        throw new Error(`I5: Project creation/retrieval failed - ${e.message || 'Unknown error'}`);
      }
    }

    console.log(`=== SAVE INDIVIDUAL CLIP: STEP 6 - DIRECTORY CREATION === [${getTimestamp()}]`);
    errorStep.step = 6;
    errorStep.code = 'I6';
    
    // Create user-specific directory and copy files
    const userDir = resolve(process.cwd(), 'uploads', `user_${user.id}`);
    const projectDir = join(userDir, `project_${project.id}`);
    console.log(`[STEP 6] Creating directories - Project dir: ${projectDir} [${getTimestamp()}]`);
    try {
      await mkdir(projectDir, { recursive: true });
      console.log(`[STEP 6] Directories created successfully [${getTimestamp()}]`);
    } catch (e: any) {
      console.error(`[I6] Directory creation failed:`, e);
      throw new Error(`I6: Directory creation failed - ${e.message || 'Unknown error'}`);
    }

    console.log(`=== SAVE INDIVIDUAL CLIP: STEP 7 - FILE COPY === [${getTimestamp()}]`);
    errorStep.step = 7;
    errorStep.code = 'I7';
    
    // Copy the individual clip
    const newFilePath = join(projectDir, clip.filename);
    console.log(`[STEP 7] Copying file from ${clip.path} to ${newFilePath} [${getTimestamp()}]`);
    try {
      await copyFile(clip.path, newFilePath);
      console.log(`[STEP 7] File copied successfully [${getTimestamp()}]`);
    } catch (e: any) {
      console.error(`[I7] File copy failed:`, e);
      throw new Error(`I7: File copy failed - ${e.message || 'Unknown error'}`);
    }
    
    console.log(`=== SAVE INDIVIDUAL CLIP: STEP 8 - THUMBNAIL GENERATION === [${getTimestamp()}]`);
    errorStep.step = 8;
    errorStep.code = 'I8';
    
    // Generate thumbnail for the clip
    let thumbnailPath = null;
    try {
      const thumbnailFilename = clip.filename.replace(/\.[^/.]+$/, '_thumb.jpg');
      const thumbnailFilePath = join(projectDir, thumbnailFilename);
      console.log(`[STEP 8] Generating thumbnail - Output: ${thumbnailFilePath} [${getTimestamp()}]`);
      
      // Generate thumbnail using ffmpeg
      const thumbnailStart = Date.now();
      await new Promise((resolve, reject) => {
        ffmpeg(newFilePath)
          .screenshots({
            timestamps: ['50%'], // Take screenshot at 50% of video duration
            filename: thumbnailFilename,
            folder: projectDir,
            size: '320x240'
          })
          .on('end', () => resolve(thumbnailFilePath))
          .on('error', reject);
      });
      
      thumbnailPath = thumbnailFilePath;
      const thumbnailTime = Date.now() - thumbnailStart;
      console.log(`[STEP 8] Thumbnail generated successfully: ${thumbnailPath} ${formatTiming(thumbnailTime)}`);
    } catch (thumbError) {
      console.error('[I8] Failed to generate thumbnail (non-critical):', thumbError);
      // Continue without thumbnail
    }
    
    console.log(`=== SAVE INDIVIDUAL CLIP: STEP 9 - DATABASE SAVE === [${getTimestamp()}]`);
    errorStep.step = 9;
    errorStep.code = 'I9';
    
    // Save clip to database
    console.log(`[STEP 9] Saving clip to database - Project ID: ${project.id}, Filename: ${clip.filename} [${getTimestamp()}]`);
    try {
      await createClip(
        project.id,
        clip.filename,
        newFilePath,
        clip.start,
        clip.end,
        clip.title,
        clip.description,
        thumbnailPath || undefined
      );
      console.log(`[STEP 9] Clip saved to database successfully [${getTimestamp()}]`);
    } catch (e: any) {
      console.error(`[I9] Database save failed:`, e);
      throw new Error(`I9: Database save failed - ${e.message || 'Unknown error'}`);
    }

    const processingTime = Date.now() - startTime;
    console.log(`[SUCCESS] Individual clip saved successfully - Project ID: ${project.id} ${formatTiming(processingTime)}`);
    
    return NextResponse.json({ success: true, projectId: project.id });
  } catch (error: any) {
    const processingTime = Date.now() - startTime;
    const errorCode = error.message?.startsWith('I') ? error.message.split(':')[0] : errorStep.code;
    const errorStepNum = errorStep.step;
    const timestamp = getTimestamp();
    
    console.error(`[ERROR] Save individual clip failed at step ${errorStepNum} (${errorCode}) [${timestamp}]`);
    console.error(`[ERROR] Error message:`, error.message || error);
    console.error(`[ERROR] Error stack:`, error.stack);
    console.error(`[ERROR] Processing time: ${formatTiming(processingTime)}`);
    
    return NextResponse.json({ 
      error: 'An error occurred. Please try again.',
      errorCode: errorCode
    }, { status: 500 });
  }
}

// Helper function to find existing project by title
async function findProjectByTitle(userId: number, title: string) {
  const { pool } = await import('@/lib/db');
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT * FROM projects WHERE user_id = $1 AND title = $2 ORDER BY created_at DESC LIMIT 1',
      [userId, title]
    );
    return result.rows[0] || null;
  } finally {
    client.release();
  }
}

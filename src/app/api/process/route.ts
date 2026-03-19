import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
import { writeFile, mkdir, access } from 'fs/promises';
import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import { writeFile as fsWriteFile } from 'fs/promises';
import { join, resolve } from 'path';
import path from 'path';
import fs from 'fs';
import OpenAI from 'openai';
import Groq from 'groq-sdk';
import ffmpeg from 'fluent-ffmpeg';
import { v4 as uuidv4 } from 'uuid';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { pool } from "@/lib/db";
import { promises as fsPromises } from "fs";
import { mapError, getUserFriendlyMessage } from "@/lib/errors";

// Database imports removed - clips are saved individually via save buttons

const execAsync = promisify(exec);

// Initialize API clients
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

// const PYTHON_PATH = require('path').join(process.cwd(), '.venv', 'bin', 'python');
const PYTHON_PATH = process.platform === 'win32'
  ? require('path').resolve(process.cwd(), '.venv', 'Scripts', 'python.exe')
  : require('path').resolve(process.cwd(), '.venv', 'bin', 'python');

// Ensure the virtual environment is activated with proper PATH
const PYTHON_ENV = process.platform === 'win32'
  ? {
    ...process.env,
    VIRTUAL_ENV: require('path').resolve(process.cwd(), '.venv'),
    PATH: require('path').resolve(process.cwd(), '.venv', 'Scripts') + ';' + process.env.PATH
  }
  : {
    ...process.env,
    VIRTUAL_ENV: require('path').resolve(process.cwd(), '.venv'),
    PATH: require('path').resolve(process.cwd(), '.venv', 'bin') + ':' + process.env.PATH
  };


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

// Helper to set progress
async function setProgress(sessionId: string, percent: number, message: string) {
  const progressPath = resolve(process.cwd(), 'uploads', sessionId, 'progress.json');
  await fsWriteFile(progressPath, JSON.stringify({ percent, message, updated: Date.now() }));
}

// Helper to merge segments into sentences based on punctuation
function mergeSegmentsToSentences(segments: any[]) {
  const sentences: { start: number; end: number; text: string }[] = [];
  let current: { start: number | null; end: number | null; text: string } = { start: null, end: null, text: "" };
  for (const seg of segments) {
    if (current.start === null) current.start = seg.start;
    current.text += (current.text ? " " : "") + seg.text;
    current.end = seg.end;
    if (/[.!?]$/.test(seg.text.trim())) {
      sentences.push({ start: current.start!, end: current.end!, text: current.text });
      current = { start: null, end: null, text: "" };
    }
  }
  if (current.text) {
    sentences.push({ start: current.start!, end: current.end!, text: current.text });
  }
  return sentences;
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  let sessionId: string | undefined;
  const errorStep = { step: 0, code: 'E0' }; // Track which step failed

  try {
    console.log(`=== STEP 1: REQUEST VALIDATION === [${getTimestamp()}]`);
    errorStep.step = 1;
    errorStep.code = 'E1';

    // Validate content type
    const contentType = request.headers.get('content-type') || '';
    if (!contentType.includes('multipart/form-data') && !contentType.includes('application/x-www-form-urlencoded')) {
      console.error(`[E1] Invalid content type: ${contentType} [${getTimestamp()}]`);
      return NextResponse.json({
        error: 'An error occurred. Please try again.',
        errorCode: 'E1',
        processingTime: Date.now() - startTime
      }, { status: 400 });
    }
    console.log(`[STEP 1] Content type validated [${getTimestamp()}]`);

    console.log(`=== STEP 2: PARSING FORM DATA === [${getTimestamp()}]`);
    errorStep.step = 2;
    errorStep.code = 'E2';

    const formData = await request.formData();
    const videoFile = formData.get('video') as File;
    const youtubeUrl = formData.get('youtubeUrl') as string;
    const platform = formData.get('platform') as string;
    const aiModel = (formData.get('aiModel') as string) || 'openai';
    const minClipLength = formData.get('minClipLength') ? parseInt(formData.get('minClipLength') as string, 10) : undefined;
    const maxClipLength = formData.get('maxClipLength') ? parseInt(formData.get('maxClipLength') as string, 10) : undefined;
    const manualStart = formData.get('manualStart') ? parseFloat(formData.get('manualStart') as string) : undefined;
    const manualEnd = formData.get('manualEnd') ? parseFloat(formData.get('manualEnd') as string) : undefined;
    const keywords = formData.get('keywords') ? (formData.get('keywords') as string) : undefined;
    const clipCount = formData.get('clipCount') ? parseInt(formData.get('clipCount') as string) : undefined;
    const sourceProjectId = formData.get('sourceProjectId') as string | undefined;
    const providedSessionId = formData.get('sessionId') as string | undefined;
    const libraryId = formData.get('libraryId') as string | undefined;
    console.log(`[STEP 2] Form data parsed - Platform: ${platform}, AI Model: ${aiModel}, Has Video: ${!!videoFile}, Has YouTube URL: ${!!youtubeUrl}, libraryId: ${libraryId ? 'YES' : 'NO'} [${getTimestamp()}]`);

    if (!videoFile && !youtubeUrl && !libraryId) {
      console.error('[E2] No video file, YouTube URL, or libraryId provided');
      sessionId = uuidv4();
      const p = resolve(process.cwd(), 'uploads', sessionId);
      await mkdir(p, { recursive: true });
      await fsWriteFile(resolve(p, 'progress.json'),
        JSON.stringify({ percent: 100, message: 'Failed: No video file, YouTube URL, or libraryId provided', updated: Date.now() })
      );
      return NextResponse.json({
        error: 'An error occurred. Please try again.',
        errorCode: 'E2',
        processingTime: Date.now() - startTime
      }, { status: 400 });
    }

    console.log(`=== STEP 3: SESSION INITIALIZATION === [${getTimestamp()}]`);
    errorStep.step = 3;
    errorStep.code = 'E3';

    sessionId = providedSessionId || uuidv4();
    const uploadsDir = resolve(process.cwd(), 'uploads', sessionId);
    await mkdir(uploadsDir, { recursive: true });
    await setProgress(sessionId, 0, 'Starting...');
    const totalStart = Date.now();
    console.log(`[STEP 3] Session initialized - Session ID: ${sessionId} [${getTimestamp()}]`);

    let videoPath = '';
    let audioPath = '';
    let actualVideoFile: string | null = null;

    // --- START: libraryId handling (copy library file into uploadsDir and continue) ---
    if (libraryId) {
      console.log(`[STEP 4 LIBRARY] libraryId provided: ${libraryId} [${getTimestamp()}]`);
      errorStep.step = 4;
      errorStep.code = 'E4.LIB';

      try {
        // 1) Lookup library file row
        const client = await pool.connect();
        let libRow: any = null;
        try {
          const r = await client.query(
            `SELECT id, user_id, filename, stored_path, size_bytes, mime_type, duration_seconds
         FROM public.library_files WHERE id = $1 LIMIT 1`,
            [libraryId]
          );
          if (r.rowCount === 0) {
            console.error(`[E4.LIB] libraryId not found: ${libraryId}`);
            await setProgress(sessionId, 100, 'Failed: Library file not found');
            return NextResponse.json({ error: 'Library file not found', errorCode: 'E4.LIB', processingTime: Date.now() - startTime }, { status: 404 });
          }
          libRow = r.rows[0];
        } finally {
          client.release();
        }

        const src = libRow.stored_path;
        const dest = join(uploadsDir, 'input.mp4');

        try {
          await fsPromises.access(src);
        } catch (e) {
          console.error(`[E4.LIB] library source file missing: ${src}`, e);
          await setProgress(sessionId, 100, 'Failed: Library file missing on server');
          return NextResponse.json({ error: 'Library file missing on server', errorCode: 'E4.LIB.MISSING', processingTime: Date.now() - startTime }, { status: 500 });
        }

        await fsPromises.copyFile(src, dest);
        await fsPromises.chmod(dest, 0o644).catch(() => { });
        videoPath = dest;
        console.log(`[STEP 4 LIBRARY] Library file copied to processing uploads: ${dest} (src=${src}) [${getTimestamp()}]`);
      } catch (e: any) {
        console.error(`[E4.LIB] Library handling failed:`, e);
        await setProgress(sessionId, 100, 'Failed: Library file processing error');
        return NextResponse.json({ error: 'Failed to process library file', errorCode: 'E4.LIB', processingTime: Date.now() - startTime }, { status: 500 });
      }
    } else if (videoFile) {
      console.log(`=== STEP 4: VIDEO FILE UPLOAD === [${getTimestamp()}]`);
      errorStep.step = 4;
      errorStep.code = 'E4';

      await setProgress(sessionId, 10, 'Uploading video...');
      console.log(`[STEP 4] Starting video file upload - Size: ${videoFile.size} bytes, Type: ${videoFile.type} [${getTimestamp()}]`);
      try {
        const bytes = await videoFile.arrayBuffer();
        await writeFile(join(uploadsDir, 'input.mp4'), Buffer.from(bytes));
        videoPath = join(uploadsDir, 'input.mp4');
        console.log(`[STEP 4] Video file uploaded successfully - Path: ${videoPath} [${getTimestamp()}]`);
      } catch (e: any) {
        console.error(`[E4] Video file upload failed:`, e);
        throw new Error(`E4: Video upload failed - ${e.message || 'Unknown error'}`);
      }
    } else if (youtubeUrl) {
      console.log(`=== STEP 4: YOUTUBE DOWNLOAD === [${getTimestamp()}]`);
      errorStep.step = 4;
      errorStep.code = 'E4';

      await setProgress(sessionId, 5, 'Downloading video...');
      console.log(`[STEP 4] Processing YouTube URL: ${youtubeUrl} [${getTimestamp()}]`);
      try {
        const tempVideoPath = join(uploadsDir, 'temp_video');

        // Single download — yt-dlp (primary) with PyTubefix fallback
        console.log(`[STEP 4.1] Downloading video via yt-dlp… [${getTimestamp()}]`);
        const videoDownloadStart = Date.now();
        actualVideoFile = await downloadYouTubeVideoWithYtDlp(youtubeUrl, tempVideoPath);
        const videoDownloadTime = Date.now() - videoDownloadStart;
        console.log(`[STEP 4.1] Video downloaded successfully → ${actualVideoFile} ${formatTiming(videoDownloadTime)}`);
        videoPath = actualVideoFile;

        // Extract WAV audio from the downloaded video for transcription
        console.log(`[STEP 4.2] Extracting audio from video for transcription… [${getTimestamp()}]`);
        audioPath = join(uploadsDir, 'audio.wav');
        const audioConvertStart = Date.now();
        await convertToWav(actualVideoFile, audioPath);
        const audioConvertTime = Date.now() - audioConvertStart;
        console.log(`[STEP 4.2] Audio extracted to WAV ${formatTiming(audioConvertTime)}`);
        console.log(`[STEP 4] YouTube download and audio extraction completed [${getTimestamp()}]`);
      } catch (e: any) {
        console.error(`[E4] YouTube download failed:`, e);
        console.error(`[E4] Error details:`, e.message, e.stack);

        if (sessionId) {
          try {
            const p = resolve(process.cwd(), 'uploads', sessionId, 'progress.json');
            await fsWriteFile(p, JSON.stringify({ percent: 100, message: 'Failed: YouTube download error', updated: Date.now() }));
          } catch { }
        }

        const appError = mapError(e);
        return NextResponse.json({
          error: getUserFriendlyMessage(appError),
          errorCode: appError.code,
          numericErrorCode: appError.numericCode,
          processingTime: Date.now() - startTime
        }, { status: appError.statusCode });
      }
      await setProgress(sessionId, 20, 'Video downloaded. Preparing audio...');
    }

    // Extract or verify audio
    if (!youtubeUrl) {
      console.log(`=== STEP 5: AUDIO EXTRACTION === [${getTimestamp()}]`);
      errorStep.step = 5;
      errorStep.code = 'E5';

      console.log(`[STEP 5] Extracting audio from uploaded video [${getTimestamp()}]`);
      try {
        await access(videoPath);
        console.log(`[STEP 5] Video file verified: ${videoPath} [${getTimestamp()}]`);
        const hasAudio = await checkVideoHasAudio(videoPath);
        if (!hasAudio) {
          console.log(`[STEP 5] Video has no audio track [${getTimestamp()}]`);
          try {
            await setProgress(sessionId!, 100, 'Failed: No audio detected in uploaded file');
          } catch (e) {
            console.warn('[STEP 5] Failed to write progress file for no-audio case', e);
          }
          return NextResponse.json({
            error: 'No audio detected in the uploaded file. Please upload a file that contains audio.',
            errorCode: 'NO_AUDIO',
            numericErrorCode: 253,
            processingTime: Date.now() - startTime
          }, { status: 400 });
        } else {
          audioPath = join(uploadsDir, 'audio.wav');
          console.log(`[STEP 5] Extracting audio track… [${getTimestamp()}]`);
          await extractAudio(videoPath, audioPath);
          console.log(`[STEP 5] Audio extracted successfully: ${audioPath} [${getTimestamp()}]`);
        }
      } catch (e: any) {
        console.error(`[E5] Audio extraction failed:`, e);
        throw new Error(`E5: Audio extraction failed - ${e.message || 'Unknown error'}`);
      }
    }

    // Transcribe
    console.log(`=== STEP 6: AUDIO TRANSCRIPTION === [${getTimestamp()}]`);
    errorStep.step = 6;
    errorStep.code = 'E6';

    await setProgress(sessionId, 35, 'Contacting AI for transcription...');
    console.log(`[STEP 6] Starting audio transcription - Audio path: ${audioPath} [${getTimestamp()}]`);
    let transcription: any;
    const transcriptionStart = Date.now();
    try {
      transcription = await transcribeAudio(audioPath);
      const transcriptionTime = Date.now() - transcriptionStart;
      console.log(`[STEP 6] Transcription completed - Success: ${transcription.success}, Segments: ${transcription.segments?.length || 0} ${formatTiming(transcriptionTime)}`);
      await setProgress(sessionId, 50, 'Transcription complete. Detecting content type...');
      if (!transcription.success) {
        console.error(`[E6] Transcription failed: ${transcription.error}`);
        return NextResponse.json({
          error: 'An error occurred. Please try again.',
          errorCode: 'E6',
          processingTime: Date.now() - startTime
        }, { status: 500 });
      }
    } catch (e: any) {
      console.error(`[E6] Transcription error:`, e);
      throw new Error(`E6: Transcription failed - ${e.message || 'Unknown error'}`);
    }

    // Merge into sentences
    console.log(`=== STEP 7: SENTENCE MERGING === [${getTimestamp()}]`);
    errorStep.step = 7;
    errorStep.code = 'E7';

    console.log(`[STEP 7] Merging segments into sentences - Total segments: ${transcription.segments?.length || 0} [${getTimestamp()}]`);
    const sentenceSegments = mergeSegmentsToSentences(transcription.segments);
    console.log(`[STEP 7] Sentence merging completed - Total sentences: ${sentenceSegments.length} [${getTimestamp()}]`);

    // Detect content type
    console.log(`=== STEP 8: CONTENT TYPE DETECTION === [${getTimestamp()}]`);
    errorStep.step = 8;
    errorStep.code = 'E8';

    await setProgress(sessionId, 55, 'Detecting content type...');
    console.log(`[STEP 8] Detecting content type using ${aiModel}... [${getTimestamp()}]`);
    let detectedContentType: string;
    try {
      detectedContentType = await detectContentType(transcription.transcription, aiModel);
      console.log(`[STEP 8] Content type detected: ${detectedContentType} [${getTimestamp()}]`);
    } catch (e: any) {
      console.error(`[E8] Content type detection failed:`, e);
      throw new Error(`E8: Content type detection failed - ${e.message || 'Unknown error'}`);
    }

    // Generate summary
    console.log(`=== STEP 9: SUMMARY GENERATION === [${getTimestamp()}]`);
    errorStep.step = 9;
    errorStep.code = 'E9';

    await setProgress(sessionId, 60, 'AI is generating summary...');
    console.log(`[STEP 9] Generating summary using ${aiModel}... [${getTimestamp()}]`);
    const summaryStart = Date.now();
    let summary: string;
    try {
      summary = await generateSummary(transcription.transcription, aiModel, detectedContentType);
      const summaryTime = Date.now() - summaryStart;
      console.log(`[STEP 9] Summary generated successfully ${formatTiming(summaryTime)}`);
    } catch (e: any) {
      console.error(`[E9] Summary generation failed:`, e);
      throw new Error(`E9: Summary generation failed - ${e.message || 'Unknown error'}`);
    }

    // Lyrics engagement if music
    let lyricsEngagement = null;
    if (detectedContentType === 'music') {
      console.log(`=== STEP 10: LYRICS ENGAGEMENT ANALYSIS === [${getTimestamp()}]`);
      errorStep.step = 10;
      errorStep.code = 'E10';

      console.log(`[STEP 10] Analyzing lyrics engagement for music content... [${getTimestamp()}]`);
      try {
        lyricsEngagement = await analyzeLyricsEngagement(transcription.transcription, sentenceSegments, aiModel);
        console.log(`[STEP 10] Lyrics engagement analysis completed [${getTimestamp()}]`);
      } catch (e: any) {
        console.error(`[E10] Lyrics engagement analysis failed:`, e);
        // Non-critical, continue without it
        lyricsEngagement = null;
      }
    }

    // Clip suggestions
    console.log(`=== STEP 11: CLIP SUGGESTIONS GENERATION === [${getTimestamp()}]`);
    errorStep.step = 11;
    errorStep.code = 'E11';

    await setProgress(sessionId, 65, 'Generating clip suggestions...');
    console.log(`[STEP 11] Generating clip suggestions for ${sentenceSegments.length} segments... [${getTimestamp()}]`);
    const clipSuggestionsStart = Date.now();
    let clipSuggestions: any[];
    try {
      clipSuggestions = await generateClipSuggestions(
        sentenceSegments,
        platform,
        aiModel,
        detectedContentType,
        { minClipLength, maxClipLength, manualStart, manualEnd, keywords, clipCount }
      );
      const clipSuggestionsTime = Date.now() - clipSuggestionsStart;
      console.log(`[STEP 11] Clip suggestions generated ${formatTiming(clipSuggestionsTime)} - Total: ${clipSuggestions.length}`);
    } catch (e: any) {
      console.error(`[E11] Clip suggestions generation failed:`, e);
      throw new Error(`E11: Clip suggestions generation failed - ${e.message || 'Unknown error'}`);
    }

    // Validate and filter clip suggestions
    console.log(`=== STEP 12: CLIP SUGGESTIONS VALIDATION === [${getTimestamp()}]`);
    errorStep.step = 12;
    errorStep.code = 'E12';

    console.log(`[STEP 12] Validating clip suggestions... [${getTimestamp()}]`);
    const validClipSuggestions = clipSuggestions.filter(s => {
      const start = parseFloat(s.start);
      const end = parseFloat(s.end);
      const isValid = !isNaN(start) && !isNaN(end) && start >= 0 && end > start;
      if (!isValid) {
        console.log(`[STEP 12] Invalid clip suggestion filtered out:`, s, `[${getTimestamp()}]`);
      }
      return isValid;
    });

    console.log(`[STEP 12] Validation completed - Valid: ${validClipSuggestions.length}, Total: ${clipSuggestions.length} [${getTimestamp()}]`);

    if (validClipSuggestions.length === 0) {
      console.error('[E12] No valid clip suggestions generated!');
      throw new Error('E12: No valid clip suggestions generated');
    }

    // Create clips
    console.log(`=== STEP 13: CLIP CREATION === [${getTimestamp()}]`);
    errorStep.step = 13;
    errorStep.code = 'E13';

    await setProgress(sessionId, 80, 'Creating clips...');
    console.log(`[STEP 13] Starting clip creation - Valid suggestions: ${validClipSuggestions.length} [${getTimestamp()}]`);
    const hasVideoFile = await access(videoPath).then(() => true).catch(() => false);
    console.log(`[STEP 13] Video file available: ${hasVideoFile}, Video path: ${videoPath} [${getTimestamp()}]`);

    let clips;
    const clipCreationStart = Date.now();
    try {
      if (hasVideoFile) {
        // Create video clips from video file
        console.log(`[STEP 13] Creating ${validClipSuggestions.length} video clips from video file... [${getTimestamp()}]`);
        clips = await createVideoClips(videoPath, validClipSuggestions, uploadsDir, sessionId);
      } else {
        // For shorts, try to create video clips with static background + audio
        try {
          console.log(`[STEP 13] Creating ${validClipSuggestions.length} video clips from audio... [${getTimestamp()}]`);
          clips = await createVideoClipsFromAudio(audioPath, validClipSuggestions, uploadsDir, sessionId);
        } catch (error) {
          console.log(`[STEP 13] Video creation failed, falling back to audio clips: ${error} [${getTimestamp()}]`);
          // Fallback to audio clips if video creation fails
          clips = await createAudioClips(audioPath, validClipSuggestions, uploadsDir, sessionId);
        }
      }
      const clipCreationTime = Date.now() - clipCreationStart;
      console.log(`[STEP 13] All clips created successfully ${formatTiming(clipCreationTime)} - Total clips: ${clips.length}`);
    } catch (e: any) {
      console.error(`[E13] Clip creation failed:`, e);
      throw new Error(`E13: Clip creation failed - ${e.message || 'Unknown error'}`);
    }

    // Generate hashtags
    console.log(`=== STEP 14: HASHTAG GENERATION === [${getTimestamp()}]`);
    errorStep.step = 14;
    errorStep.code = 'E14';

    await setProgress(sessionId, 90, 'Generating hashtags...');
    console.log(`[STEP 14] Generating hashtags using ${aiModel}... [${getTimestamp()}]`);
    const hashtagsStart = Date.now();
    let hashtags: string[];
    try {
      hashtags = await generateHashtags(summary, transcription.transcription, detectedContentType, aiModel);
      const hashtagsTime = Date.now() - hashtagsStart;
      console.log(`[STEP 14] Hashtags generated successfully ${formatTiming(hashtagsTime)} - Total: ${hashtags.length}`);
    } catch (e: any) {
      console.error(`[E14] Hashtag generation failed:`, e);
      // Non-critical, continue with empty hashtags
      hashtags = [];
    }

    console.log(`=== STEP 15: FINALIZATION === [${getTimestamp()}]`);
    errorStep.step = 15;
    errorStep.code = 'E15';

    await setProgress(sessionId, 100, 'Done!');
    const processingTime = Date.now() - startTime;

    const totalTime = Date.now() - totalStart;
    console.log(`[STEP 15] Total processing completed successfully ${formatTiming(totalTime)}`);
    console.log(`[SUCCESS] All steps completed - Session ID: ${sessionId}, Clips: ${clips.length}, Hashtags: ${hashtags.length} [${getTimestamp()}]`);

    // Note: Database saving removed from automatic processing
    // Clips are now saved individually when user clicks "Save to My Clips" button
    // This prevents database connection issues during video processing

    return NextResponse.json({
      success: true,
      sessionId,
      transcription: transcription.transcription,
      summary,
      clips,
      contentType: detectedContentType,
      lyricsEngagement,
      hashtags,
      sourceType: youtubeUrl ? 'youtube' : 'video',
      aiModel: aiModel === 'openai' ? 'OpenAI GPT-4' : 'Groq LLM',
      processingTime: totalTime,
      // savedProjectId removed - clips are saved individually
      sourceProjectId, // Include this so frontend knows which project generated these clips
    });
  } catch (err: any) {
    const processingTime = Date.now() - startTime;
    const errorStepNum = errorStep.step;
    const timestamp = getTimestamp();

    // Map to friendly error
    // If it's already an AppError (not currently thrown, but for future), use it
    // Otherwise map using our utility
    const appError = mapError(err);

    // Log full details for debugging
    console.error(`[ERROR] Processing failed at step ${errorStepNum} (${appError.code}) [${timestamp}]`);
    console.error(`[ERROR] Original message:`, err.message || err);
    console.error(`[ERROR] Friendly message:`, appError.message);
    if (err.stack) console.error(`[ERROR] Stack:`, err.stack);
    console.error(`[ERROR] Processing time: ${formatTiming(processingTime)}`);

    if (sessionId) {
      try {
        const p = resolve(process.cwd(), 'uploads', sessionId, 'progress.json');
        await fsWriteFile(p, JSON.stringify({
          percent: 100,
          message: `Failed: ${appError.message}`, // Show friendly message in progress too
          updated: Date.now()
        }));
      } catch (e) {
        console.error(`[ERROR] Failed to update progress file:`, e);
      }
    }

    return NextResponse.json({
      error: getUserFriendlyMessage(appError),
      errorCode: appError.code,
      numericErrorCode: appError.numericCode,
      processingTime
    }, { status: appError.statusCode });
  }
}

// ------------------
// Utility functions:
// ------------------

async function checkVideoHasAudio(videoPath: string): Promise<boolean> {
  return new Promise(resolve => {
    try {
      ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (err) return resolve(true);
        resolve(metadata.streams.some(s => s.codec_type === 'audio'));
      });
    } catch {
      resolve(true);
    }
  });
}

async function extractAudio(videoPath: string, audioPath: string): Promise<void> {
  return new Promise((res, rej) => {
    ffmpeg(videoPath)
      .outputOptions([
        '-vn',                    // No video
        '-acodec pcm_s16le',      // 16-bit PCM
        '-ar 16000',              // 16kHz sample rate
        '-ac 1',                  // Mono
        '-compression_level 2',   // Compression level
        '-q:a 2'                  // Audio quality (0-9, lower is better)
      ])
      .on('end', () => res())
      .on('error', e => rej(e))
      .save(audioPath);
  });
}

async function transcribeAudio(audioPath: string): Promise<any> {
  if (audioPath.endsWith('no_audio.wav')) {
    return {
      success: true,
      transcription: "This video contains no audio. Consider adding captions.",
      segments: [{ start: 0, end: 10, text: "This video contains no audio." }],
      language: "en"
    };
  }
  return new Promise((res, rej) => {
    const script = join(process.cwd(), 'src', 'scripts', 'transcribe.py');
    const apiKey = process.env.OPENAI_API_KEY;

    // Pass API keys if available
    const groqKey = process.env.GROQ_API_KEY || '';
    const args = [
      script,
      audioPath,
      apiKey || '',
      groqKey,
    ];

    console.log(`Starting transcription with ${apiKey ? 'OpenAI API' : groqKey ? 'Groq API' : 'local Whisper'}...`);
    const transcriptionStart = Date.now();
    const py = spawn(PYTHON_PATH, args, { timeout: 2500000 });
    let out = '', errOut = '';

    py.stdout.on('data', d => out += d);
    py.stderr.on('data', d => {
      errOut += d;
      // Log transcription progress
      const line = d.toString().trim();
      if (line) {
        console.log(`[Transcription] ${line}`);
      }
    });

    py.on('close', code => {
      const transcriptionTime = Date.now() - transcriptionStart;
      if (code === 0) {
        try {
          const result = JSON.parse(out);
          console.log(`🎤 Transcription completed successfully using ${result.success ? 'API' : 'local'} (${transcriptionTime}ms / ${(transcriptionTime / 1000).toFixed(2)}s)`);
          res(result);
        }
        catch { rej(new Error('Failed to parse transcription output')); }
      } else {
        console.error(`❌ Transcription failed with code ${code} (${transcriptionTime}ms / ${(transcriptionTime / 1000).toFixed(2)}s): ${errOut}`);
        rej(new Error(errOut || 'Transcription failed'));
      }
    });
  });
}

// helper to extract JSON object from noisy stdout
function extractJsonFromStdout(stdout: string) {
  // Try to locate the last JSON object in stdout.
  const lastOpen = stdout.lastIndexOf('{');
  const lastClose = stdout.lastIndexOf('}');
  if (lastOpen !== -1 && lastClose !== -1 && lastClose > lastOpen) {
    const maybe = stdout.slice(lastOpen, lastClose + 1);
    try { return JSON.parse(maybe); } catch (e) { /* fall through */ }
  }
  // fallback: try to find a JSON-looking line
  const lines = stdout.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i];
    if ((l.startsWith('{') && l.endsWith('}')) || (l.startsWith('[') && l.endsWith(']'))) {
      try { return JSON.parse(l); } catch (e) { /* ignore */ }
    }
  }
  return null;
}

// NOTE: downloadYouTubeWithYtDlp (audio-only) has been removed.
// All YouTube downloads now go through downloadYouTubeVideoWithYtDlp (video).
// Audio for transcription is extracted from the video file via convertToWav.

// ---------------------------------------------------------------------------
// WARP Self-Healing Helper
// ---------------------------------------------------------------------------
async function cycleWarpConnection(): Promise<boolean> {
  console.log('[WARP] Attempting to cycle Cloudflare WARP connection for a fresh IP...');
  try {
    await execAsync('warp-cli disconnect');
    console.log('[WARP] Disconnected. Waiting 2 seconds...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    await execAsync('warp-cli connect');
    console.log('[WARP] Connected. Waiting 4 seconds for tunnel to establish...');
    await new Promise(resolve => setTimeout(resolve, 4000));

    console.log('[WARP] Successfully cycled connection. Fresh IP ready.');
    return true;
  } catch (err: any) {
    // If we are on a local machine without warp-cli, it safely catches here
    console.log(`[WARP] Skipping cycle (WARP not installed or running locally).`);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Auto-Retrying Downloader
// ---------------------------------------------------------------------------
async function downloadYouTubeVideoWithYtDlp(url: string, outputPath: string, isRetry = false): Promise<string> {
  return new Promise((res, rej) => {
    const script = join(process.cwd(), 'src', 'scripts', 'youtube_download.py');

    // youtube_download.py handles: yt-dlp (primary) → PyTubefix + FFmpeg (fallback)
    const py = spawn(PYTHON_PATH, [script, url, outputPath], {
      timeout: 300000, // 5 min — enough time for yt-dlp strategies + PyTubefix fallback
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
      env: PYTHON_ENV
    });

    let out = '';
    let errOut = '';
    py.stdout.on('data', d => out += d.toString());
    py.stderr.on('data', d => {
      errOut += d.toString();
      // Stream yt-dlp / PyTubefix logs directly to server console
      const line = d.toString().trim();
      if (line) console.log(`[yt-dlp] ${line}`);
    });

    py.on('close', async code => {
      if (code === 0) {
        const parsed = extractJsonFromStdout(out);
        if (parsed && parsed.success && parsed.file) {
          console.log(`[yt-dlp] Download succeeded via ${parsed.method} → ${parsed.file}`);
          return res(parsed.file);
        }
        try {
          if (outputPath && fs.existsSync(outputPath)) return res(outputPath);
        } catch { }

        // If it exited 0 but failed to return a file, trigger healing
        if (!isRetry) {
          console.warn('[yt-dlp] Script exited normally but no valid file found. Attempting self-healing...');
          const cycled = await cycleWarpConnection();
          if (cycled) {
            try {
              console.log('[yt-dlp] Retrying download with fresh IP...');
              const retryRes = await downloadYouTubeVideoWithYtDlp(url, outputPath, true);
              return res(retryRes);
            } catch (retryErr) {
              return rej(retryErr);
            }
          }
        }
        return rej(new Error('Download returned no file. stdout: ' + out + ' stderr: ' + errOut));

      } else {
        console.error(`[yt-dlp] Script exited with code ${code}`);

        // If the script crashes (likely a bot-block), trigger self-healing
        if (!isRetry) {
          console.warn('[yt-dlp] Download failed. Suspected YouTube IP block. Attempting self-healing...');
          const cycled = await cycleWarpConnection();
          if (cycled) {
            try {
              console.log('[yt-dlp] Retrying download with fresh IP...');
              const retryRes = await downloadYouTubeVideoWithYtDlp(url, outputPath, true);
              return res(retryRes);
            } catch (retryErr) {
              return rej(retryErr);
            }
          }
        }

        console.error(`[yt-dlp] stdout: ${out}`);
        console.error(`[yt-dlp] stderr: ${errOut}`);
        return rej(new Error(`YouTube download failed (code ${code}). stderr: ${errOut || out}`));
      }
    });

    py.on('error', err => {
      console.error('[yt-dlp] Spawn error:', err);
      rej(err);
    });
  });
}

async function convertToWav(input: string, output: string): Promise<void> {
  return new Promise((res, rej) => {
    ffmpeg(input)
      .outputOptions([
        '-acodec pcm_s16le',      // 16-bit PCM
        '-ar 16000',              // 16kHz sample rate
        '-ac 1',                  // Mono
        '-threads', '0',          // Use all CPU cores
        '-preset', 'ultrafast',   // Fastest processing
        '-q:a', '4',              // Lower quality for speed
        '-avoid_negative_ts', 'make_zero',  // Fix timing issues
        '-fflags', '+genpts'      // Generate presentation timestamps
      ])
      .on('start', (commandLine) => {
        console.log('Audio conversion command:', commandLine);
      })
      .on('end', () => {
        console.log('Audio conversion completed');
        res();
      })
      .on('error', e => {
        console.error('Audio conversion failed:', e);
        rej(e);
      })
      .save(output);
  });
}

// Smart format detection - check if file is already MP4
function needsConversion(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return ext !== '.mp4';
}

// Optimized MP4 conversion with smart format detection
async function convertToMp4(input: string, output: string): Promise<void> {
  // Check if file is already MP4
  if (!needsConversion(input)) {
    console.log('File is already MP4, copying without conversion');
    // Simply copy the file if it's already MP4
    await fs.promises.copyFile(input, output);
    return;
  }

  console.log('Converting to MP4 with optimized settings');
  return new Promise((res, rej) => {
    ffmpeg(input)
      .outputOptions([
        '-c:v', 'libx264',        // Use CPU encoding (faster than QSV)
        '-c:a', 'aac',            // AAC audio codec
        '-preset', 'ultrafast',   // Fastest CPU preset
        '-crf', '28',             // Quality (lower = better, 18-28 range)
        '-threads', '0',          // Use all CPU cores
        '-movflags', '+faststart' // Web optimization
      ])
      .on('start', (commandLine) => {
        console.log('FFmpeg command:', commandLine);
      })
      .on('end', () => {
        console.log('Video conversion completed');
        res();
      })
      .on('error', e => {
        console.error('Video conversion failed:', e);
        rej(e);
      })
      .save(output);
  });
}

async function detectContentType(transcription: string, aiModel: string): Promise<string> {
  const prompt = `Analyze this video transcript and classify it into one of these categories:
- "music": Songs, music videos, lyrics, musical performances, singing, rapping, instrumental music, music production
- "movie": Movie clips, TV shows, dramatic scenes, entertainment, acting, dialogue, scenes, characters, plot
- "educational": Lectures, tutorials, podcasts, interviews, informational content, explanations, teaching

Transcript: "${transcription.substring(0, 800)}..."

Return ONLY the category name (music, movie, or educational):`;
  try {
    let response: string;
    if (aiModel === 'openai') {
      const c = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 10,
        temperature: 0.1,
      });
      response = c.choices[0].message.content || '';
    } else {
      const c = await groq.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        model: "llama-3.3-70b-versatile",
        max_tokens: 10,
        temperature: 0.1,
      });
      response = c.choices[0].message.content || '';
    }
    const cat = response.trim().toLowerCase();
    if (cat.includes('music')) return 'music';
    if (cat.includes('movie')) return 'movie';
    return 'educational';
  } catch {
    const t = transcription.toLowerCase();
    const musicScore = ['chorus', 'verse', 'lyrics', 'beat', 'song'].filter(k => t.includes(k)).length;
    const movieScore = ['scene', 'character', 'plot', 'acting', 'dialogue'].filter(k => t.includes(k)).length;
    if (musicScore > movieScore) return 'music';
    if (movieScore > musicScore) return 'movie';
    return 'educational';
  }
}

async function analyzeLyricsEngagement(transcription: string, segments: any[], aiModel: string): Promise<any> {
  if (!segments.length) return { viralHooks: [], memorableLines: [], danceableSections: [], emotionalPeaks: [], quotableMoments: [] };
  const segmentText = segments.map(s => `${s.start}s - ${s.end}s: ${s.text}`).join('\n');
  const prompt = `Analyze this music transcript and identify the most engaging elements that would make viral content... Transcript:\n${segmentText}\nReturn JSON.`;
  try {
    let response: string;
    if (aiModel === 'openai') {
      const c = await openai.chat.completions.create({ model: "gpt-4o", messages: [{ role: "user", content: prompt }], max_tokens: 800 });
      response = c.choices[0].message.content || '';
    } else {
      const c = await groq.chat.completions.create({ messages: [{ role: "user", content: prompt }], model: "llama-3.3-70b-versatile", max_tokens: 800 });
      response = c.choices[0].message.content || '';
    }
    const m = response.match(/\{[\s\S]*\}/);
    return m ? JSON.parse(m[0]) : {};
  } catch {
    return { viralHooks: [], memorableLines: [], danceableSections: [], emotionalPeaks: [], quotableMoments: [] };
  }
}

async function generateSummary(transcription: string, aiModel: string, contentType: string = 'educational'): Promise<string> {
  let prompt = contentType === 'music'
    ? `This is a music video/song. Instead of a traditional summary, identify key details... Transcript: "${transcription}"`
    : contentType === 'movie'
      ? `This is a movie/TV show clip. Instead of a traditional summary, identify key details... Transcript: "${transcription}"`
      : `Summarize this video transcript in 2-3 sentences: "${transcription}"`;
  try {
    if (aiModel === 'openai') {
      const c = await openai.chat.completions.create({ model: "gpt-4o", messages: [{ role: "user", content: prompt }], max_tokens: 200 });
      return c.choices[0].message.content || '';
    } else {
      const c = await groq.chat.completions.create({ messages: [{ role: "user", content: prompt }], model: "llama-3.3-70b-versatile", max_tokens: 200 });
      return c.choices[0].message.content || '';
    }
  } catch {
    return 'Summary generation failed.';
  }
}

async function generateClipSuggestions(segments: any[], platform: string, aiModel: string, contentType: string = 'educational', options: { minClipLength?: number; maxClipLength?: number; manualStart?: number; manualEnd?: number; keywords?: string; clipCount?: number }): Promise<any[]> {
  let filteredSegments = segments;
  // Apply manual start/end if provided
  if (
    typeof options.manualStart === 'number' &&
    typeof options.manualEnd === 'number' &&
    options.manualEnd > options.manualStart
  ) {
    filteredSegments = segments.filter(s => s.end > (options.manualStart as number) && s.start < (options.manualEnd as number))
      .map(s => ({ ...s, start: Math.max(s.start, options.manualStart as number), end: Math.min(s.end, options.manualEnd as number) }));
  }
  // Apply keyword filtering if provided
  if (options.keywords && options.keywords.trim().length > 0) {
    const keywordList = options.keywords.toLowerCase().split(/[, ]+/).filter(Boolean);
    filteredSegments = filteredSegments.filter(s => keywordList.some(k => s.text.toLowerCase().includes(k)));
    // If no segments match, fallback to all segments
    if (filteredSegments.length === 0) filteredSegments = segments;
  }
  // Use user min/max clip length if provided, else defaults
  const minDuration = options.minClipLength ?? (contentType === 'music' ? 20 : 15);
  const maxDuration = options.maxClipLength ?? (contentType === 'music' ? 90 : 60);

  // Determine target clip count (user request or default range)
  const userRequestedCount = options.clipCount;
  const promptRange = userRequestedCount ? `${userRequestedCount}` : '10-15';
  // Pass options to prompt if needed (not shown here for brevity)
  const segmentText = filteredSegments.map(s => `${s.start}s - ${s.end}s: ${s.text}`).join('\n');

  let prompt: string;

  switch (contentType) {
    case 'music':
      prompt = `This is a MUSIC VIDEO/SONG. Based on this transcript with timestamps, suggest ${promptRange} clips (${minDuration}-${maxDuration} seconds each) that would make viral ${platform} content. 
      
CRITICAL REQUIREMENTS:
- Each clip MUST be between ${minDuration} and ${maxDuration} seconds long
- Clips should start and end at natural break points (complete verses, choruses, or musical phrases)
- Never cut in the middle of a word, sentence, or musical phrase

TITLE INSTRUCTIONS:
- Generate CATCHY, SPECIFIC titles based on the lyrics or mood (e.g., "The Beat Drop Madness", "Heartbreak Verse", "Guitar Solo Fire")
- DO NOT use generic titles like "Clip 1", "Music Part", "Chorus".
- Titles must describe EXACTLY what happens in the clip.

Focus on:
- Complete choruses or hooks (most important)
- Full verses with strong lyrics
- Complete musical phrases and sections
- High-energy moments or beat drops (full sections)
- Emotional or powerful vocal sections (complete phrases)
- Parts that people would want to sing along to or dance to
- The most quotable or memorable lyrics (complete lines)
- Sections with strong emotional impact or storytelling

For music content, prioritize:
1. Complete choruses or hooks (${minDuration}-${Math.min(maxDuration, 45)} seconds)
2. Full verses with strong lyrics (${Math.max(minDuration, 30)}-${Math.min(maxDuration, 60)} seconds)
3. Complete instrumental breaks (${minDuration}-${Math.min(maxDuration, 40)} seconds)
4. Emotional peaks or dramatic moments (${Math.max(minDuration, 25)}-${Math.min(maxDuration, 50)} seconds)

IMPORTANT: Return ONLY a valid JSON array with objects containing: start (number), end (number), title (string), description (string).
Example format: [{"start": 10, "end": 45, "title": "When The Bass Drops", "description": "High energy chorus section"}]

Transcript:
${segmentText}

Music Clip Suggestions:`;
      break;

    case 'movie':
      prompt = `This is a MOVIE/TV SHOW CLIP. Based on this transcript with timestamps, suggest ${promptRange} short clips (${minDuration}-${maxDuration} seconds each) that would make viral ${platform} content.

TITLE INSTRUCTIONS:
- TITLES MUST BE SPECIFIC AND DESCRIPTIVE (e.g., "John Confronts Sarah", "The Car Chase Begins", "Funniest Joke of the Movie").
- BANNED WORDS: "Clip", "Scene", "Part", "Moment", "Snippet".
- The title should make someone want to click.

Focus on:
- The most dramatic, funny, or shocking moments
- Memorable dialogue or quotes
- Action scenes or emotional peaks
- Moments that would make people want to share or react
- Scenes that tell a complete mini-story
- Iconic one-liners or catchphrases
- Plot twists or revelations

For movie/TV content, prioritize:
1. The most quotable dialogue or catchphrases
2. Dramatic plot twists or revelations
3. Funny or memorable character moments
4. Action-packed or visually striking scenes

CRITICAL: Each clip MUST be between ${minDuration} and ${maxDuration} seconds long.

IMPORTANT: Return ONLY a valid JSON array with objects containing: start (number), end (number), title (string), description (string).
Example format: [{"start": 10, "end": 25, "title": "He Actually Said That?", "description": "Shocking dialogue moment"}]

Transcript:
${segmentText}

Movie Clip Suggestions:`;
      break;

    default: // educational
      prompt = `Based on this video transcript with timestamps, suggest ${promptRange} short clips (${minDuration}-${maxDuration} seconds each) that would make engaging ${platform} content.

TITLE INSTRUCTIONS:
- Titles MUST summarize the specific topic (e.g., "3 Tips for Productivity", "Why The Sky Is Blue", "The Truth About AI").
- DO NOT use "Interesting Fact", "Clip 1", "Key Insight". Be specific.
- Use "How to", "Why", or questions in titles.

Focus on moments with:
- Strong emotional reactions
- Key insights or revelations
- Humorous or surprising moments
- Clear, standalone messages

CRITICAL: Each clip MUST be between ${minDuration} and ${maxDuration} seconds long.

IMPORTANT: Return ONLY a valid JSON array with objects containing: start (number), end (number), title (string), description (string).
Example format: [{"start": 10, "end": 25, "title": "The Secret to Success", "description": "Key motivational insight"}]

Transcript:
${segmentText}

Suggestions:`;
  }

  try {
    let response;
    if (aiModel === 'openai') {
      console.log('Using OpenAI API for clip suggestions...');
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 2048,
      });
      response = completion.choices[0].message.content || '';
      console.log('OpenAI API response received for clip suggestions');
    } else {
      console.log('Using Groq API for clip suggestions...');
      const completion = await groq.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        model: "llama-3.3-70b-versatile",
        max_tokens: 2048,
      });
      response = completion.choices[0].message.content || '';
      console.log('Groq API response received for clip suggestions');
    }

    try {
      // Extract JSON from response
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const suggestions = JSON.parse(jsonMatch[0]);

        // Validate suggestions have proper start/end times
        // Validate suggestions have proper start/end times and respect duration constraints
        let validSuggestions = suggestions.filter((s: any) => {
          const isValidTiming = typeof s.start === 'number' && typeof s.end === 'number' && s.start >= 0 && s.end > s.start;
          if (!isValidTiming) return false;

          const duration = s.end - s.start;
          // Strictly enforce user constraints
          return duration >= minDuration && duration <= maxDuration;
        });

        // Use user requested count if available, otherwise default to 6 minimum
        const minimumNeeded = userRequestedCount || 6;

        if (validSuggestions.length < minimumNeeded) {
          console.log(`[STEP 11] Only ${validSuggestions.length} valid clips generated from AI. Backfilling with fallback suggestions...`);
          // Generate extra fallback suggestions
          const fallbacks = generateFallbackSuggestions(filteredSegments, contentType, minDuration, maxDuration);

          for (const fb of fallbacks) {
            if (validSuggestions.length >= minimumNeeded) break;

            // Check for overlap with ANY existing suggestion
            const isDuplicate = validSuggestions.some((existing: any) => {
              const overlapStart = Math.max(existing.start, fb.start);
              const overlapEnd = Math.min(existing.end, fb.end);
              const overlapDuration = Math.max(0, overlapEnd - overlapStart);
              const fbDuration = fb.end - fb.start;
              const existingDuration = existing.end - existing.start;

              // Consider it a duplicate if:
              // 1. Starts are very close (within 5 seconds)
              // 2. Significant overlap (> 30% of either clip)
              return Math.abs(existing.start - fb.start) < 5 || (overlapDuration / fbDuration > 0.3) || (overlapDuration / existingDuration > 0.3);
            });

            if (!isDuplicate) {
              validSuggestions.push(fb);
            }
          }
        }

        // If user requested a specific count, trim excess if we have more
        if (userRequestedCount && validSuggestions.length > userRequestedCount) {
          console.log(`[STEP 11] Trimming suggestions to user requested count: ${userRequestedCount}`);
          validSuggestions = validSuggestions.slice(0, userRequestedCount);
        }

        // Final Step: Refine titles using AI to ensure they are clickbait/specific
        // This fixes the issue where fallback titles are just sentence fragments like "You could also see"
        try {
          console.log(`[STEP 11] Refinement: Improving titles for ${validSuggestions.length} clips...`);
          const refinedTitles = await refineTitlesWithAI(validSuggestions, platform, aiModel);
          if (refinedTitles.length === validSuggestions.length) {
            validSuggestions.forEach((s: any, i: number) => {
              if (refinedTitles[i] && refinedTitles[i].length > 3) {
                s.title = refinedTitles[i];
              }
            });
            console.log(`[STEP 11] Titles refined successfully.`);
          }
        } catch (err) {
          console.warn("[STEP 11] Title refinement failed, keeping original titles:", err);
        }

        return validSuggestions;
      }
      throw new Error('No valid JSON found in response');
    } catch (e) {
      console.error("Error parsing AI response:", e);
      // Fallback if AI entirely fails
      return generateFallbackSuggestions(filteredSegments, contentType, minDuration, maxDuration);
    }
  } catch (error) {
    console.error('AI API error for clip suggestions:', error);
    // Generate fallback suggestions based on segments
    return generateFallbackSuggestions(filteredSegments, contentType, minDuration, maxDuration);
  }
}

async function refineTitlesWithAI(suggestions: any[], platform: string, aiModel: string): Promise<string[]> {
  const clipsContext = suggestions.map((s, i) => `Clip ${i + 1} Text: "${s.description?.substring(0, 150)}..."`).join('\n\n');

  const systemPrompt = `You are a viral content expert for ${platform}.
Your task is to rewrite these video clip titles to be specific, engaging, and "clickbaity".
- NO generic titles ("Clip 1", "Scene 3").
- NO sentence fragments ("You could also see").
- Titles must be 3-8 words.
- Focus on the specific topic, emotion, or action.
- Return ONLY a JSON array of strings, e.g., ["The Shocking Truth", "Best Moment Ever", "Why He Cried"].`;

  const userPrompt = `Generate ${suggestions.length} viral titles for these clips:\n\n${clipsContext}`;

  try {
    let content = "";
    if (aiModel === 'openai') {
      const completion = await openai.chat.completions.create({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        model: "gpt-4o",
        response_format: { type: "json_object" },
      });
      content = completion.choices[0].message.content || "[]";
    } else {
      // Groq
      const completion = await groq.chat.completions.create({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        model: "llama3-70b-8192",
        response_format: { type: "json_object" },
      });
      content = completion.choices[0]?.message?.content || "[]";
    }

    const parsed = JSON.parse(content);
    // Handle both { titles: [...] } and ["title1", ...] formats
    if (Array.isArray(parsed)) return parsed;
    if (parsed.titles && Array.isArray(parsed.titles)) return parsed.titles;
    return [];
  } catch (e) {
    console.error("Refine titles error:", e);
    return [];
  }
}

function generateFallbackSuggestions(segments: any[], contentType: string = 'educational', minDuration?: number, maxDuration?: number): any[] {
  const suggestions: any[] = [];
  if (segments.length === 0) return suggestions;
  let currentStart = segments[0].start;
  let currentText = '';
  let currentDuration = 0;
  minDuration = minDuration ?? (contentType === 'music' ? 20 : 15);
  maxDuration = maxDuration ?? (contentType === 'music' ? 90 : 60);
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    currentText += ' ' + segment.text;
    currentDuration = segment.end - currentStart;
    const isCompletePhrase = segment.text.trim().endsWith('.') || segment.text.trim().endsWith('!') || segment.text.trim().endsWith('?') || segment.text.trim().endsWith(',') || currentDuration >= minDuration;
    const isMusicBreak = contentType === 'music' && (segment.text.includes('\n') || segment.text.includes('[') || segment.text.includes(']') || currentText.length > 300);

    // Check if we can make a valid clip (between min and max duration)
    // Strictly enforce minDuration
    if ((isCompletePhrase || isMusicBreak || i === segments.length - 1) && currentDuration >= minDuration) {
      let end = segment.end;
      // Try to extend slightly to next segment if it fits within maxDuration
      if (i < segments.length - 1) {
        const nextSegment = segments[i + 1];
        const gap = nextSegment.start - end;
        if (gap < 2 && (nextSegment.end - currentStart) <= maxDuration) {
          end = nextSegment.end;
        }
      }

      // Ensure we don't exceed maxDuration
      end = Math.min(end, currentStart + maxDuration);

      // Double check strictly against minDuration after adjustments
      if ((end - currentStart) < minDuration) {
        continue; // Skip if still too short
      }
      // Generate a better title from the content
      let title: string = '';
      // Remove square brackets [text] often used for non-speech sounds
      const cleanText = currentText.trim().replace(/\[.*?\]/g, '').replace(/\s+/g, ' ');

      // Strategy 1: Look for potential topic phrases (capitalized words not at start of sentence)
      // This is a naive heuristic but better than generic names
      const significantWords = cleanText.match(/[A-Z][a-z]+/g)?.filter(w => w.length > 3);

      if (significantWords && significantWords.length > 0 && significantWords.length < 4) {
        title = significantWords.join(' ');
      } else {
        // Strategy 2: First few meaningful words
        const words = cleanText.split(' ').filter(w => w.length > 2 && !['the', 'and', 'but', 'for', 'was'].includes(w.toLowerCase()));
        if (words.length > 0) {
          title = words.slice(0, 4).join(' ');
        }
      }

      // Cleanup title
      title = title.replace(/[.,!?;:]$/, ''); // Remove trailing punctuation
      if (title.length > 0) {
        title = title.charAt(0).toUpperCase() + title.slice(1);
      }

      if (title.length > 30) {
        title = title.substring(0, 27) + '...';
      }

      // Final Fallback for empty titles if extraction failed
      if (!title || title.length < 3) {
        if (contentType === 'music') {
          // Try to be slightly more specific based on time
          const timeInMins = Math.floor(currentStart / 60);
          title = `Music Section (${timeInMins}m)`;
        } else {
          // Use part of the raw text even if it has stop words
          title = currentText.trim().slice(0, 20).replace(/[.,!?;:]$/, '') + '...';
        }
      }
      suggestions.push({
        start: Math.max(0, currentStart - 1),
        end: end,
        title: title,
        description: currentText.trim().slice(0, 80) + (currentText.length > 80 ? '...' : '')
      });
      if (i < segments.length - 1) {
        currentStart = segments[i + 1].start;
        currentText = '';
      }
    }
  }
  return suggestions;
}

async function createVideoClips(videoPath: string, suggestions: any[], outputDir: string, sessionId: string): Promise<any[]> {
  const clips = [];

  for (let i = 0; i < suggestions.length; i++) {
    const suggestion = suggestions[i];
    const start = parseFloat(suggestion.start);
    const end = parseFloat(suggestion.end);
    const duration = end - start;

    const outputPath = join(outputDir, `clip_${i + 1}.mp4`);

    try {
      const clipStart = Date.now();
      await new Promise<void>((resolve, reject) => {
        ffmpeg(videoPath)
          .seekInput(start)
          .duration(duration)
          .outputOptions([
            '-c:v', 'libx264',            // Use CPU encoding (faster than QSV)
            '-c:a', 'aac',
            '-preset', 'ultrafast',       // Fastest CPU preset
            '-crf', '28',                 // Quality (lower = better, 18-28 range)
            '-threads', '0',              // Use all CPU cores
            '-movflags', '+faststart'
          ])
          .output(outputPath)
          .on('start', (commandLine) => {
            console.log(`Creating clip ${i + 1}:`, commandLine);
          })
          .on('progress', async (progress) => {
            if (sessionId) {
              const percentValue = typeof progress.percent === 'number' ? progress.percent : 0;
              const percent = Math.min(99, 80 + (percentValue / 100) * 10);
              await setProgress(sessionId, percent, `Creating clip ${i + 1}... ${percentValue.toFixed(1)}%`);
            }
          })
          .on('end', () => {
            const clipTime = Date.now() - clipStart;
            console.log(`✅ Clip ${i + 1} created successfully (${clipTime}ms / ${(clipTime / 1000).toFixed(2)}s)`);
            resolve();
          })
          .on('error', (err) => {
            console.error(`Error creating clip ${i + 1}:`, err);
            reject(err);
          })
          .run();
      });

      clips.push({
        path: outputPath,
        start: start,
        end: end,
        duration: duration,
        title: suggestion.title || `Clip ${i + 1}`,
        description: suggestion.description || "No description available",
        filename: `clip_${i + 1}.mp4`
      });

    } catch (error) {
      console.error(`Failed to create clip ${i + 1}:`, error);
      throw error;
    }
  }

  return clips;
}


// Helper function to merge continuous segments for natural flow
function mergeContinuousSegments(suggestions: any[]): any[] {
  if (suggestions.length <= 1) return suggestions;

  // First, sort suggestions by start time to ensure proper order
  const sortedSuggestions = [...suggestions].sort((a, b) => a.start - b.start);

  const merged: any[] = [];
  let current = { ...sortedSuggestions[0] };

  for (let i = 1; i < sortedSuggestions.length; i++) {
    const next = sortedSuggestions[i];

    // Validate current segment timing
    if (current.start >= current.end) {
      console.warn(`Skipping invalid segment: start=${current.start}, end=${current.end}`);
      current = { ...next };
      continue;
    }

    // Validate next segment timing
    if (next.start >= next.end) {
      console.warn(`Skipping invalid segment: start=${next.start}, end=${next.end}`);
      continue;
    }

    const gap = next.start - current.end;

    // Merge if segments are close (within 2 seconds) and total duration is reasonable
    if (gap <= 2 && (next.end - current.start) <= 90) {
      // Ensure merged segment has valid timing
      const newEnd = Math.max(current.end, next.end);
      if (current.start < newEnd) {
        current.end = newEnd;
        current.description = `${current.description} ${next.description}`;
        current.mergedSegments = (current.mergedSegments || 1) + 1;
        current.title = `${current.title} + ${next.title}`;
      } else {
        // Invalid merge, push current and start new
        merged.push(current);
        current = { ...next };
      }
    } else {
      merged.push(current);
      current = { ...next };
    }
  }

  // Validate final segment before adding
  if (current.start < current.end) {
    merged.push(current);
  } else {
    console.warn(`Skipping final invalid segment: start=${current.start}, end=${current.end}`);
  }

  console.log(`Merged ${suggestions.length} segments into ${merged.length} clips for better flow`);
  return merged;
}

async function createVideoClipsFromAudio(audioPath: string, suggestions: any[], outputDir: string, sessionId: string): Promise<any[]> {
  // Create a single shared black background image
  const blackImagePath = join(outputDir, 'shared_black_bg.png');

  try {
    // Create a minimal black image using Node.js (no canvas dependency needed)
    const fs = await import('fs');
    // Create a minimal 1x1 black PNG
    const blackPngBuffer = Buffer.from([
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
      0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xDE, 0x00, 0x00, 0x00,
      0x0C, 0x49, 0x44, 0x41, 0x54, 0x08, 0xD7, 0x63, 0xF8, 0x00, 0x00, 0x00,
      0x01, 0x00, 0x01, 0x00, 0x00, 0x00, 0x37, 0x6E, 0xF9, 0x24, 0x00, 0x00,
      0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
    ]);
    fs.writeFileSync(blackImagePath, blackPngBuffer);
  } catch (error) {
    console.error('Failed to create black background image:', error);
    throw error;
  }

  // Create clips in parallel for faster processing
  const clipPromises = suggestions.map(async (suggestion, i) => {
    const outputPath = join(outputDir, `clip_${i + 1}.mp4`);

    // Validate start and end times
    const start = parseFloat(suggestion.start);
    const end = parseFloat(suggestion.end);

    if (isNaN(start) || isNaN(end) || start < 0 || end <= start) {
      console.error(`Invalid clip timing for clip ${i + 1}: start=${start}, end=${end}`);
      return null;
    }

    const duration = end - start;

    try {
      await new Promise<void>((resolve, reject) => {
        // Create video with the shared black image and audio
        ffmpeg()
          .input(blackImagePath)
          .inputOptions(['-loop', '1', '-t', duration.toString()])
          .input(audioPath)
          .inputOptions([
            '-ss', start.toString(),
            '-t', duration.toString()
          ])
          .outputOptions([
            '-c:v', 'libx264',
            '-c:a', 'aac',
            '-preset', 'ultrafast',
            '-crf', '28',
            '-threads', '0',
            '-shortest',
            '-pix_fmt', 'yuv420p',
            '-r', '30'
          ])
          .on('start', (commandLine) => {
            console.log(`Creating audio-to-video clip ${i + 1} with command:`, commandLine);
          })
          .on('progress', async (progress) => {
            if (sessionId) {
              const percentValue = typeof progress.percent === 'number' ? progress.percent : 0;
              const percent = Math.min(99, 80 + ((i + percentValue / 100) / suggestions.length) * 10);
              await setProgress(sessionId, percent, `Creating video clip ${i + 1}/${suggestions.length}... ${percentValue.toFixed(1)}%`);
            }
          })
          .on('end', () => {
            console.log(`Audio-to-video clip ${i + 1} created successfully`);
            resolve();
          })
          .on('error', (err) => {
            console.error(`Error creating audio-to-video clip ${i + 1}:`, err);
            reject(err);
          })
          .save(outputPath);
      });

      return {
        ...suggestion,
        path: outputPath,
        filename: `clip_${i + 1}.mp4`,
        type: 'video'
      };
    } catch (error) {
      console.error(`Failed to create video clip ${i + 1}:`, error);
      return null;
    }
  });

  // Wait for all clips to be created in parallel
  const results = await Promise.all(clipPromises);
  const clips = results.filter(clip => clip !== null);

  // Clean up the shared black background image
  try {
    const fs = require('fs');
    fs.unlinkSync(blackImagePath);
  } catch (e) {
    // Ignore cleanup errors
  }

  console.log(`Created ${clips.length} audio-to-video clips in parallel`);
  return clips;
}

async function createAudioClips(audioPath: string, suggestions: any[], outputDir: string, sessionId: string): Promise<any[]> {
  const clips = [];

  for (let i = 0; i < suggestions.length; i++) {
    const suggestion = suggestions[i];
    const outputPath = join(outputDir, `clip_${i + 1}.mp3`);

    // Validate start and end times
    const start = parseFloat(suggestion.start);
    const end = parseFloat(suggestion.end);

    if (isNaN(start) || isNaN(end) || start < 0 || end <= start) {
      console.error(`Invalid clip timing for clip ${i + 1}: start=${start}, end=${end}`);
      continue;
    }

    const duration = end - start;

    try {
      await new Promise<void>((resolve, reject) => {
        ffmpeg(audioPath)
          .setStartTime(start)
          .setDuration(duration)
          .outputOptions(['-c:a mp3', '-b:a 128k'])
          .on('progress', async (progress) => {
            if (sessionId) {
              const percentValue = typeof progress.percent === 'number' ? progress.percent : 0;
              const percent = Math.min(99, 80 + ((i + percentValue / 100) / suggestions.length) * 10);
              await setProgress(sessionId, percent, `Creating audio clip ${i + 1}/${suggestions.length}... ${percentValue.toFixed(1)}%`);
            }
          })
          .on('end', () => resolve())
          .on('error', (err) => reject(err))
          .save(outputPath);
      });

      clips.push({
        ...suggestion,
        path: outputPath,
        filename: `clip_${i + 1}.mp3`,
        type: 'audio'
      });
    } catch (error) {
      console.error(`Failed to create audio clip ${i + 1}:`, error);
    }
  }

  return clips;
}
async function generateHashtags(summary: string, transcription: string, contentType: string, aiModel: string): Promise<string[]> {
  const prompt = `Generate 5-8 relevant hashtags for this ${contentType} content... Summary: "${summary}" Transcript: "${transcription.substring(0, 500)}"...`;
  try {
    let response: string;
    if (aiModel === 'openai') {
      const c = await openai.chat.completions.create({ model: "gpt-4o", messages: [{ role: "user", content: prompt }], max_tokens: 60, temperature: 0.7 });
      response = c.choices[0].message.content || '';
    } else {
      const c = await groq.chat.completions.create({ messages: [{ role: "user", content: prompt }], model: "llama-3.3-70b-versatile", max_tokens: 60, temperature: 0.7 });
      response = c.choices[0].message.content || '';
    }
    const m = response.match(/\[[\s\S]*\]/);
    if (m) {
      const arr = JSON.parse(m[0]);
      return arr.filter((t: any) => typeof t === 'string' && t.length >= 3 && t.length <= 20)
        .map((t: string) => t.replace(/[^a-zA-Z0-9]/g, ''));
    }
    return [];
  } catch {
    return [];
  }
}

import { NextRequest, NextResponse } from 'next/server';
import ffmpeg from 'fluent-ffmpeg';
import { access } from 'fs/promises';
import { buildAssContent, writeAssToTempFile, safeUnlink, SubtitleEntry } from '@/lib/subtitleUtils';


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
  const errorStep = { step: 0, code: 'V0' }; // V prefix for video-edit errors
  let assFilePath: string | undefined = undefined;

  try {
    console.log(`=== EDIT VIDEO: STEP 1 - REQUEST PARSING === [${getTimestamp()}]`);
    errorStep.step = 1;
    errorStep.code = 'V1';

    const body = await request.clone().json();
    const { clipPath, edits, outputPath } = body;

    console.log(`[STEP 1] Request parsed - Clip path: ${clipPath}, Output path: ${outputPath}, Has edits: ${!!edits} [${getTimestamp()}]`);

    if (!clipPath || !edits || !outputPath) {
      console.error(`[V1] Missing required parameters [${getTimestamp()}]`);
      return NextResponse.json({
        error: 'An error occurred. Please try again.',
        errorCode: 'V1'
      }, { status: 400 });
    }

    console.log(`=== EDIT VIDEO: STEP 2 - PARAMETER VALIDATION === [${getTimestamp()}]`);
    errorStep.step = 2;
    errorStep.code = 'V2';

    // Validate parameters
    if (typeof clipPath !== 'string' || typeof outputPath !== 'string') {
      console.error(`[V2] Invalid parameter types [${getTimestamp()}]`);
      return NextResponse.json({
        error: 'An error occurred. Please try again.',
        errorCode: 'V2'
      }, { status: 400 });
    }

    console.log(`=== EDIT VIDEO: STEP 3 - INPUT FILE VERIFICATION === [${getTimestamp()}]`);
    errorStep.step = 3;
    errorStep.code = 'V3';

    // Verify the input file exists
    try {
      await access(clipPath);
      console.log(`[STEP 3] Input file verified: ${clipPath} [${getTimestamp()}]`);
    } catch (error) {
      console.error(`[V3] Input file not found: ${clipPath}`, error);
      return NextResponse.json({
        error: 'An error occurred. Please try again.',
        errorCode: 'V3'
      }, { status: 404 });
    }

    console.log(`=== EDIT VIDEO: STEP 4 - OUTPUT PATH PREPARATION === [${getTimestamp()}]`);
    errorStep.step = 4;
    errorStep.code = 'V4';

    // Ensure output directory exists and validate output path
    const path = require('path');
    const fs = require('fs');

    // Clean the output path - only remove truly invalid characters, keep colons for Windows paths
    const cleanOutputPath = outputPath.replace(/[<>"|?*]/g, '_');
    console.log(`[STEP 4] Cleaning output path - Original: ${outputPath}, Clean: ${cleanOutputPath} [${getTimestamp()}]`);

    const outputDir = path.dirname(cleanOutputPath);
    console.log(`[STEP 4] Output directory: ${outputDir} [${getTimestamp()}]`);
    try {
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
        console.log(`[STEP 4] Created output directory: ${outputDir} [${getTimestamp()}]`);
      } else {
        console.log(`[STEP 4] Output directory already exists [${getTimestamp()}]`);
      }
    } catch (e: any) {
      console.error(`[V4] Directory creation failed:`, e);
      throw new Error(`V4: Directory creation failed - ${e.message || 'Unknown error'}`);
    }

    // Use the clean output path
    const finalOutputPath = cleanOutputPath;
    console.log(`[STEP 4] Final output path: ${finalOutputPath} [${getTimestamp()}]`);

    console.log(`=== EDIT VIDEO: STEP 5 - EDITS VALIDATION === [${getTimestamp()}]`);
    errorStep.step = 5;
    errorStep.code = 'V5';

    // Validate edits object
    if (typeof edits !== 'object' || edits === null) {
      console.error(`[V5] Invalid edits parameter [${getTimestamp()}]`);
      return NextResponse.json({
        error: 'An error occurred. Please try again.',
        errorCode: 'V5'
      }, { status: 400 });
    }
    console.log(`[STEP 5] Edits validated - Has timing: ${!!edits.timing}, Has effects: ${!!edits.effects}, Has textOverlay: ${!!edits.textOverlay} [${getTimestamp()}]`);

    // --- SUBTITLES: validate and create ASS file if provided ---
    try {
      const rawSubs = edits.subtitles;
      const subtitles: SubtitleEntry[] | undefined = Array.isArray(rawSubs) ? rawSubs : undefined;

      if (subtitles && subtitles.length > 0) {
        // Basic limits to avoid DoS
        const MAX_SUBS = 5000;
        const MAX_CHARS = 5000;
        if (subtitles.length > MAX_SUBS) {
          console.error(`[V5] Too many subtitles: ${subtitles.length} > ${MAX_SUBS} [${getTimestamp()}]`);
          return NextResponse.json({ error: 'Too many subtitles', errorCode: 'V5' }, { status: 400 });
        }

        for (let i = 0; i < subtitles.length; i++) {
          const s = subtitles[i];
          if (typeof s?.text !== 'string' || !isFinite(s?.start) || !isFinite(s?.end)) {
            console.error(`[V5] Invalid subtitle entry at index ${i} [${getTimestamp()}]`);
            return NextResponse.json({ error: 'Invalid subtitle entries', errorCode: 'V5' }, { status: 400 });
          }
          if (!(s.end > s.start) || s.start < 0) {
            console.error(`[V5] Subtitle timing invalid at index ${i} [${getTimestamp()}]`);
            return NextResponse.json({ error: 'Invalid subtitle timing', errorCode: 'V5' }, { status: 400 });
          }
          if ((s.text || '').length > MAX_CHARS) {
            console.error(`[V5] Subtitle too long at index ${i} [${getTimestamp()}]`);
            return NextResponse.json({ error: 'Subtitle too long', errorCode: 'V5' }, { status: 400 });
          }
        }

        // Probe input video to get resolution (so ASS PlayRes is appropriate)
        let inputWidth = 1280, inputHeight = 720;
        try {
          const probe = await new Promise<any>((resolve, reject) => {
            ffmpeg.ffprobe(clipPath, (err, metadata) => {
              if (err) return reject(err);
              resolve(metadata);
            });
          });
          const vstream = (probe?.streams || []).find((s: any) => s.codec_type === 'video');
          if (vstream) {
            inputWidth = vstream.width || inputWidth;
            inputHeight = vstream.height || inputHeight;
          }
        } catch (probeErr) {
          console.warn(`[STEP 5] ffprobe failed (proceeding with default resolution):`, probeErr);
        }

        const globalStyle = edits.subtitleStyle || {};
        const styleColor = (typeof globalStyle.color === 'string' && globalStyle.color.trim()) ? globalStyle.color.trim() : '#FFFFFF';

        const styleFontName = typeof globalStyle.fontName === 'string' && globalStyle.fontName.trim() ? globalStyle.fontName.trim() : 'Arial';
        const styleFontSize = typeof globalStyle.fontSize === 'number' ? Math.max(6, Math.floor(globalStyle.fontSize)) : 36;

        const styleAlignment = typeof globalStyle.alignment === 'number' ? globalStyle.alignment : 2;
        const styleMarginV = typeof globalStyle.marginV === 'number' ? globalStyle.marginV : Math.round(inputHeight * 0.05);

        const styleBold = !!globalStyle.bold;
        const styleItalic = !!globalStyle.italic;

        let overlayXPercent: number | null = null;
        let overlayYPercent: number | null = null;
        if (globalStyle.overlayX !== undefined && globalStyle.overlayY !== undefined) {
          const x = Number(globalStyle.overlayX);
          const y = Number(globalStyle.overlayY);
          if (isFinite(x) && isFinite(y)) {
            overlayXPercent = Math.max(0, Math.min(100, x));
            overlayYPercent = Math.max(0, Math.min(100, y));
          }
        }

        console.log(`[STEP 5] Subtitle global style: font=${styleFontName}, size=${styleFontSize}, color=${styleColor}, bold=${styleBold}, italic=${styleItalic}, alignment=${styleAlignment}, marginV=${styleMarginV}, overlayX=${overlayXPercent}, overlayY=${overlayYPercent} [${getTimestamp()}]`);

        const assContent = buildAssContent(subtitles, {
          playResX: inputWidth,
          playResY: inputHeight,
          fontName: styleFontName,
          fontSize: styleFontSize,
          primaryColor: styleColor, // hex — subtitleUtils knows how to convert
          outline: 2,
          shadow: 0,
          alignment: styleAlignment,
          marginV: styleMarginV,
          bold: styleBold,
          italic: styleItalic,
          overlayXPercent,
          overlayYPercent,
        });

        // write to tmp folder (process.cwd()/tmp)
        const tempDir = require('path').join(process.cwd(), 'tmp');
        try {
          assFilePath = await writeAssToTempFile(assContent, tempDir);
          console.log(`[STEP 5] ASS subtitle file created: ${assFilePath} [${getTimestamp()}]`);
        } catch (writeErr) {
          console.error(`[V5] Failed to write ASS file:`, writeErr);
          return NextResponse.json({ error: 'Failed to create subtitle file', errorCode: 'V5' }, { status: 500 });
        }
      }
    } catch (subErr) {
      console.error(`[V5] Subtitle processing failed:`, subErr);
      return NextResponse.json({ error: 'Subtitle processing failed', errorCode: 'V5' }, { status: 500 });
    }

    console.log(`=== EDIT VIDEO: STEP 6 - FFMPEG COMMAND BUILDING === [${getTimestamp()}]`);
    errorStep.step = 6;
    errorStep.code = 'V6';

    // Build FFmpeg command based on edits
    console.log(`[STEP 6] Building FFmpeg command... [${getTimestamp()}]`);
    let ffmpegCommand = ffmpeg(clipPath);

    // Apply timing adjustments
    if (edits.timing) {
      const start = edits.timing.start || 0;
      const end = edits.timing.end;
      if (end && end > start) {
        console.log(`[STEP 6] Applying timing - Start: ${start}, End: ${end}, Duration: ${end - start}`);
        ffmpegCommand = ffmpegCommand.setStartTime(start).setDuration(end - start);
      }
    }

    // Apply speed effects
    if (edits.effects?.speed) {
      const speedMap: { [key: string]: number } = {
        'slow': 0.5,
        'normal': 1,
        'fast': 1.5,
        'very-fast': 2
      };
      const speed = speedMap[edits.effects.speed] || 1;
      if (speed !== 1) {
        console.log(`[STEP 6] Applying speed effect: ${edits.effects.speed} (${speed}x)`);
        ffmpegCommand = ffmpegCommand.videoFilters(`setpts=${1 / speed}*PTS`);
      }
    }

    // Apply video filters
    if (edits.effects?.filter) {
      const filterMap: { [key: string]: string } = {
        'vintage': 'colorbalance=rs=-0.1:gs=0:bs=0.1',
        'bright': 'eq=brightness=0.2:contrast=1.1',
        'contrast': 'eq=contrast=1.5:brightness=0.1',
        'black-white': 'hue=s=0'
      };
      const filter = filterMap[edits.effects.filter];
      if (filter) {
        console.log(`[STEP 6] Applying video filter: ${edits.effects.filter}`);
        ffmpegCommand = ffmpegCommand.videoFilters(filter);
      }
    }

    // Add text overlay - simplified approach
    if (edits.textOverlay?.text && edits.textOverlay.text.trim()) {
      const text = edits.textOverlay.text.trim();
      const fontSize = Math.max(12, Math.min(200, edits.textOverlay.fontSize || 40));
      const color = edits.textOverlay.color || '#ffffff';
      const overlayX = Math.max(0, Math.min(100, edits.textOverlay.overlayX || 50));
      const overlayY = Math.max(0, Math.min(100, edits.textOverlay.overlayY || 85));

      // Convert percentage to pixel position
      const xPosition = `(w*${overlayX}/100-tw/2)`;
      const yPosition = `(h*${overlayY}/100-th/2)`;

      // Simple text escaping - only escape quotes
      const escapedText = text.replace(/'/g, "\\'");

      try {
        // Simplified text filter - just basic options
        const textFilter = `drawtext=text='${escapedText}':fontsize=${fontSize}:fontcolor=${color}:x=${xPosition}:y=${yPosition}`;
        console.log(`[STEP 6] Adding text overlay - Text: ${text.substring(0, 20)}..., Font size: ${fontSize}, Position: (${overlayX}%, ${overlayY}%)`);
        ffmpegCommand = ffmpegCommand.videoFilters(textFilter);
      } catch (error) {
        console.error('[V6] Error adding text filter (non-critical):', error);
        // Continue without text overlay if there's an error
      }
    }

    // Set output options
    console.log(`[STEP 6] Setting output options - Codec: libx264/aac, Preset: fast, CRF: 23`);
    ffmpegCommand = ffmpegCommand.outputOptions([
      '-c:v', 'libx264',
      '-c:a', 'aac',
      '-preset', 'fast',
      '-crf', '23'
    ]);
    if (typeof assFilePath === 'string' && assFilePath.length > 0) {
      try {
        // Build a relative path from the current working directory to avoid Windows drive-colon parsing
        const pathModule = require('path');
        let relAssPath = pathModule.relative(process.cwd(), assFilePath);
        // Use forward slashes for portability and to avoid backslash-escape issues in ffmpeg filter parser
        relAssPath = relAssPath.replace(/\\/g, '/');

        console.log(`[STEP 6] Adding ASS subtitle filter using relative path: ${relAssPath} (abs: ${assFilePath}) [${getTimestamp()}]`);

        // Try object form first (silence TS via any if needed)
        try {
          (ffmpegCommand as any) = (ffmpegCommand as any).videoFilters({ filter: 'ass', options: relAssPath });
        } catch (objErr) {
          // fallback to string form if object form isn't accepted at runtime
          const vfString = `ass='${relAssPath.replace(/'/g, "'\\''")}'`;
          console.warn(`[STEP 6] object-form failed at runtime, falling back to vf string: ${vfString}`);
          ffmpegCommand = ffmpegCommand.videoFilters(vfString);
        }
      } catch (errAll) {
        console.warn(`[STEP 6] Failed to attach ASS filter (continuing without subtitles):`, errAll);
      }
    }


    console.log(`=== EDIT VIDEO: STEP 7 - VIDEO PROCESSING === [${getTimestamp()}]`);
    errorStep.step = 7;
    errorStep.code = 'V7';

    // Process the video
    console.log(`[STEP 7] Starting video processing... [${getTimestamp()}]`);
    const processingStart = Date.now();
    try {
      await new Promise<void>((resolve, reject) => {
        ffmpegCommand
          .on('start', (commandLine) => {
            console.log(`[STEP 7] FFmpeg command started [${getTimestamp()}]`);
          })
          .on('stderr', (line) => {
            console.error('[FFMPEG STDERR]', line);
          })
          .on('progress', (progress) => {
            const percent = Math.round(progress.percent || 0);
            if (percent % 25 === 0) { // Log every 25%
              console.log(`[STEP 7] Processing: ${percent}% done [${getTimestamp()}]`);
            }
          })
          .on('end', async () => {
            const processingTime = Date.now() - processingStart;
            console.log(`[STEP 7] Video processing completed successfully ${formatTiming(processingTime)}`);
            // cleanup ASS file if it was created
            try {
              if (typeof assFilePath === 'string' && assFilePath.length > 0) {
                await safeUnlink(assFilePath);
                console.log(`[STEP 7] Cleaned up ASS file: ${assFilePath}`);
              }
            } catch (cleanupErr) {
              console.warn(`[STEP 7] Failed to cleanup ASS file:`, cleanupErr);
            }
            resolve();
          })

          .on('error', async (err) => {
            console.error(`[V7] Video processing error:`, err);
            // cleanup ASS file if it was created
            try {
              if (typeof assFilePath === 'string' && assFilePath.length > 0) {
                await safeUnlink(assFilePath);
                console.log(`[STEP 7] Cleaned up ASS file after error: ${assFilePath}`);
              }
            } catch (cleanupErr) {
              console.warn(`[STEP 7] Failed to cleanup ASS file after error:`, cleanupErr);
            }
            reject(new Error(`V7: Video processing failed - ${err.message || 'Unknown error'}`));
          })
          .save(finalOutputPath);
      });
    } catch (e: any) {
      console.error(`[V7] Video processing failed:`, e);
      throw new Error(`V7: Video processing failed - ${e.message || 'Unknown error'}`);
    }

    const processingTime = Date.now() - startTime;
    console.log(`[SUCCESS] Video editing completed - Output: ${finalOutputPath} ${formatTiming(processingTime)}`);

    return NextResponse.json({
      success: true,
      message: 'Video edited successfully',
      outputPath: finalOutputPath
    });

  } catch (error: any) {
    const processingTime = Date.now() - startTime;
    const errorCode = error.message?.startsWith('V') ? error.message.split(':')[0] : errorStep.code;
    const errorStepNum = errorStep.step;
    const timestamp = getTimestamp();
    if (assFilePath) {
      try { await safeUnlink(assFilePath); } catch (e) { /* ignore */ }
    }


    console.error(`[ERROR] Video editing failed at step ${errorStepNum} (${errorCode}) [${timestamp}]`);
    console.error(`[ERROR] Error message:`, error.message || error);
    console.error(`[ERROR] Error stack:`, error.stack);
    console.error(`[ERROR] Processing time: ${formatTiming(processingTime)}`);

    return NextResponse.json({
      error: 'An error occurred. Please try again.',
      errorCode: errorCode
    }, { status: 500 });
  }
} 

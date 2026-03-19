import { NextRequest, NextResponse } from 'next/server';
import ffmpeg from 'fluent-ffmpeg';
import { access, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { existsSync } from 'fs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { clipPath, aspectRatio, outputPath } = body;

    console.log('Process video aspect request:', { clipPath, aspectRatio, outputPath });

    if (!clipPath || !aspectRatio || !outputPath) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    if (!['portrait', 'landscape'].includes(aspectRatio)) {
      return NextResponse.json({ error: 'Invalid aspect ratio. Use "portrait" or "landscape"' }, { status: 400 });
    }

    // Verify input file exists
    try {
      await access(clipPath);
    } catch (error) {
      return NextResponse.json({ error: 'Input video file not found' }, { status: 404 });
    }

    // Clean output path
    const cleanOutputPath = outputPath.replace(/[<>"|?*]/g, '_');
    const outputDir = dirname(cleanOutputPath);
    
    // Ensure output directory exists
    if (!existsSync(outputDir)) {
      await mkdir(outputDir, { recursive: true });
    }

    return new Promise<NextResponse>((resolve, reject) => {
      const command = ffmpeg(clipPath);

      // Get video dimensions first
      command.ffprobe((err, metadata) => {
        if (err) {
          return reject(NextResponse.json({ error: `FFprobe error: ${err.message}` }, { status: 500 }));
        }

        const videoStream = metadata.streams.find(s => s.codec_type === 'video');
        if (!videoStream || !videoStream.width || !videoStream.height) {
          return reject(NextResponse.json({ error: 'Could not determine video dimensions' }, { status: 500 }));
        }

        const videoWidth = videoStream.width;
        const videoHeight = videoStream.height;
        const videoAspectRatio = videoWidth / videoHeight;
        const targetAspectRatio = aspectRatio === 'portrait' ? 9 / 16 : 16 / 9;
        
        // Check if video already matches target aspect ratio (within 2% tolerance)
        const aspectRatioDiff = Math.abs(videoAspectRatio - targetAspectRatio) / targetAspectRatio;
        if (aspectRatioDiff < 0.02) {
          // Video already matches target format, skip processing
          console.log(`Video already in ${aspectRatio} format, skipping processing`);
          return resolve(NextResponse.json({ 
            success: true, 
            outputPath: clipPath, // Return original path
            aspectRatio,
            dimensions: { width: videoWidth, height: videoHeight },
            skipped: true // Flag to indicate processing was skipped
          }));
        }

        let outputWidth: number;
        let outputHeight: number;
        let scaleFilter: string;
        let cropFilter: string;

        if (aspectRatio === 'portrait') {
          // Target: 9:16
          outputHeight = 1080; // Standard vertical resolution
          outputWidth = Math.round((outputHeight * 9) / 16); // 607px for 1080px height
          
          if (videoAspectRatio > 9 / 16) {
            // Video is wider than 9:16, crop width (smart zoom)
            const scale = outputHeight / videoHeight;
            const scaledWidth = Math.round(videoWidth * scale);
            scaleFilter = `scale=${scaledWidth}:${outputHeight}`;
            const cropX = Math.round((scaledWidth - outputWidth) / 2);
            cropFilter = `crop=${outputWidth}:${outputHeight}:${cropX}:0`;
          } else {
            // Video is narrower/taller, crop height or add padding
            const scale = outputWidth / videoWidth;
            const scaledHeight = Math.round(videoHeight * scale);
            scaleFilter = `scale=${outputWidth}:${scaledHeight}`;
            const cropY = Math.round((scaledHeight - outputHeight) / 2);
            cropFilter = `crop=${outputWidth}:${outputHeight}:0:${Math.max(0, cropY)}`;
          }
        } else {
          // Target: 16:9
          outputWidth = 1920; // Standard horizontal resolution
          outputHeight = Math.round((outputWidth * 9) / 16); // 1080px for 1920px width
          
          if (videoAspectRatio < 16 / 9) {
            // Video is narrower than 16:9, crop height (smart zoom)
            const scale = outputWidth / videoWidth;
            const scaledHeight = Math.round(videoHeight * scale);
            scaleFilter = `scale=${outputWidth}:${scaledHeight}`;
            const cropY = Math.round((scaledHeight - outputHeight) / 2);
            cropFilter = `crop=${outputWidth}:${outputHeight}:0:${Math.max(0, cropY)}`;
          } else {
            // Video is wider, crop width
            const scale = outputHeight / videoHeight;
            const scaledWidth = Math.round(videoWidth * scale);
            scaleFilter = `scale=${scaledWidth}:${outputHeight}`;
            const cropX = Math.round((scaledWidth - outputWidth) / 2);
            cropFilter = `crop=${outputWidth}:${outputHeight}:${Math.max(0, cropX)}:0`;
          }
        }

        // Build FFmpeg command
        command
          .videoFilters(`${scaleFilter},${cropFilter}`)
          .videoCodec('libx264')
          .audioCodec('aac')
          .outputOptions(['-preset fast', '-crf 23', '-movflags +faststart'])
          .format('mp4')
          .output(cleanOutputPath)
          .on('start', (cmdline) => {
            console.log('FFmpeg command:', cmdline);
          })
          .on('progress', (progress) => {
            const percent = Math.round(progress.percent || 0);
            console.log(`Processing: ${percent}% done`);
          })
          .on('end', async () => {
            // Verify output file was created
            try {
              await access(cleanOutputPath);
              console.log('Video processing completed successfully');
              resolve(NextResponse.json({ 
                success: true, 
                outputPath: cleanOutputPath,
                aspectRatio,
                dimensions: { width: outputWidth, height: outputHeight }
              }));
            } catch (error) {
              reject(NextResponse.json({ error: 'Processed video file was not created' }, { status: 500 }));
            }
          })
          .on('error', (err) => {
            console.error('FFmpeg error:', err);
            reject(NextResponse.json({ error: `Video processing failed: ${err.message}` }, { status: 500 }));
          })
          .run();
      });
    });
  } catch (error: any) {
    console.error('Video processing error:', error);
    return NextResponse.json({ error: error.message || 'Failed to process video' }, { status: 500 });
  }
}


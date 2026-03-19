/**
 * Canvas-based video processing utility for aspect ratio conversion
 */

export interface VideoProcessOptions {
  aspectRatio: 'portrait' | 'landscape'; // 9:16 or 16:9
  quality?: number; // 0-1, default 0.92
}

/**
 * Process video to specified aspect ratio using canvas
 * Returns processed video blob
 */
export async function processVideoToAspectRatio(
  videoFile: File | Blob,
  options: VideoProcessOptions
): Promise<Blob> {
  const video = document.createElement('video');
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  if (!ctx) {
    throw new Error('Canvas context not available');
  }

  return new Promise((resolve, reject) => {
    video.onloadedmetadata = () => {
      const videoAspectRatio = video.videoWidth / video.videoHeight;
      const targetAspectRatio = options.aspectRatio === 'portrait' ? 9 / 16 : 16 / 9;
      
      let sourceX = 0;
      let sourceY = 0;
      let sourceWidth = video.videoWidth;
      let sourceHeight = video.videoHeight;
      let canvasWidth: number;
      let canvasHeight: number;

      // Smart crop/zoom logic
      if (options.aspectRatio === 'portrait') {
        // Target: 9:16 (vertical)
        canvasWidth = Math.round(video.videoWidth);
        canvasHeight = Math.round((canvasWidth * 16) / 9);
        
        if (videoAspectRatio > 9 / 16) {
          // Video is wider than 9:16, need to crop width or zoom
          // Use smart zoom: scale up and crop width
          const scale = canvasHeight / video.videoHeight;
          sourceWidth = Math.round(video.videoWidth / scale);
          sourceHeight = video.videoHeight;
          sourceX = Math.round((video.videoWidth - sourceWidth) / 2);
          sourceY = 0;
        } else {
          // Video is narrower/taller, need to crop height or add padding
          // Use smart crop: crop height and center
          const scale = canvasWidth / video.videoWidth;
          sourceWidth = video.videoWidth;
          sourceHeight = Math.round(canvasHeight / scale);
          sourceX = 0;
          sourceY = Math.round((video.videoHeight - sourceHeight) / 2);
        }
      } else {
        // Target: 16:9 (landscape)
        canvasWidth = Math.round(video.videoWidth);
        canvasHeight = Math.round((canvasWidth * 9) / 16);
        
        if (videoAspectRatio < 16 / 9) {
          // Video is narrower than 16:9, need to crop height or zoom
          // Use smart zoom: scale up and crop height
          const scale = canvasWidth / video.videoWidth;
          sourceWidth = video.videoWidth;
          sourceHeight = Math.round(canvasHeight / scale);
          sourceX = 0;
          sourceY = Math.round((video.videoHeight - sourceHeight) / 2);
        } else {
          // Video is wider, need to crop width or add padding
          // Use smart crop: crop width and center
          const scale = canvasHeight / video.videoHeight;
          sourceWidth = Math.round(canvasWidth / scale);
          sourceHeight = video.videoHeight;
          sourceX = Math.round((video.videoWidth - sourceWidth) / 2);
          sourceY = 0;
        }
      }

      canvas.width = canvasWidth;
      canvas.height = canvasHeight;

      // Fill background with black
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);

      // Draw video frame
      ctx.drawImage(
        video,
        sourceX,
        sourceY,
        sourceWidth,
        sourceHeight,
        0,
        0,
        canvasWidth,
        canvasHeight
      );

      // Convert to blob
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Failed to create blob from canvas'));
          }
        },
        'video/mp4',
        options.quality || 0.92
      );
    };

    video.onerror = (e) => {
      reject(new Error('Video loading error'));
    };

    // Load video
    video.src = URL.createObjectURL(videoFile);
    video.load();
  });
}

/**
 * Process video from a URL/path
 * Fetches video, processes it, and returns blob
 */
export async function processVideoFromUrl(
  videoUrl: string,
  options: VideoProcessOptions
): Promise<Blob> {
  const response = await fetch(videoUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch video: ${response.statusText}`);
  }
  
  const blob = await response.blob();
  return processVideoToAspectRatio(blob, options);
}





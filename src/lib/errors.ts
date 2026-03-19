export enum ErrorCode {
    // YouTube/Download Errors
    YT_AGE_RESTRICTED = 'YT_AGE_RESTRICTED',
    YT_GEO_BLOCKED = 'YT_GEO_BLOCKED',
    YT_UNAVAILABLE = 'YT_UNAVAILABLE',
    YT_PRIVATE = 'YT_PRIVATE',
    YT_LOGIN_REQUIRED = 'YT_LOGIN_REQUIRED',
    YT_BOT_DETECTION = 'YT_BOT_DETECTION',
    YT_GENERIC_DOWNLOAD = 'YT_GENERIC_DOWNLOAD',
    NO_AUDIO = 'NO_AUDIO',

    // Input Validation
    INVALID_URL = 'INVALID_URL',
    FILE_TOO_LARGE = 'FILE_TOO_LARGE',
    INVALID_FILE_TYPE = 'INVALID_FILE_TYPE',
    MISSING_INPUT = 'MISSING_INPUT',

    // System/Processing Errors
    TRANSCRIPTION_FAILED = 'TRANSCRIPTION_FAILED',
    AI_PROCESSING_FAILED = 'AI_PROCESSING_FAILED',
    UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

// Mapping of error codes to numeric values
export const ERROR_CODE_NUMBERS: Record<ErrorCode, number> = {
    // Input Validation (100-199)
    [ErrorCode.INVALID_URL]: 303,
    [ErrorCode.FILE_TOO_LARGE]: 102,
    [ErrorCode.INVALID_FILE_TYPE]: 103,
    [ErrorCode.MISSING_INPUT]: 104,

    // YouTube/Download Errors (200-299)
    [ErrorCode.YT_AGE_RESTRICTED]: 201,
    [ErrorCode.YT_GEO_BLOCKED]: 202,
    [ErrorCode.YT_UNAVAILABLE]: 203,
    [ErrorCode.YT_PRIVATE]: 204,
    [ErrorCode.YT_LOGIN_REQUIRED]: 205,
    [ErrorCode.YT_BOT_DETECTION]: 206,
    [ErrorCode.YT_GENERIC_DOWNLOAD]: 252,
    [ErrorCode.NO_AUDIO]: 253,

    // System/Processing Errors (300-499)
    [ErrorCode.TRANSCRIPTION_FAILED]: 301,
    [ErrorCode.AI_PROCESSING_FAILED]: 302,
    [ErrorCode.UNKNOWN_ERROR]: 999,
};

export class AppError extends Error {
    code: ErrorCode;
    statusCode: number;
    numericCode: number;

    constructor(message: string, code: ErrorCode, statusCode: number = 400) {
        super(message);
        this.code = code;
        this.statusCode = statusCode;
        this.numericCode = ERROR_CODE_NUMBERS[code];
        this.name = 'AppError';
    }
}

// Get user-friendly error message
export function getUserFriendlyMessage(error: AppError): string {
    switch (error.code) {
        // Input Validation Errors
        case ErrorCode.INVALID_URL:
            return `Invalid URL`;
        case ErrorCode.FILE_TOO_LARGE:
            return `📁 File is too large. Please upload a smaller video.`;
        case ErrorCode.INVALID_FILE_TYPE:
            return `🎬 Invalid file type. Please upload a video file.`;
        case ErrorCode.MISSING_INPUT:
            return `⚠️ No input provided. Please upload a video or paste a URL.`;

        // YouTube/Download Errors
        case ErrorCode.YT_AGE_RESTRICTED:
            return `🔞 This video is age-restricted and cannot be downloaded.`;
        case ErrorCode.YT_GEO_BLOCKED:
            return `🌍 This video is not available in your region.`;
        case ErrorCode.YT_UNAVAILABLE:
            return `❌ This video is unavailable or the URL is invalid.`;
        case ErrorCode.YT_PRIVATE:
            return `🔒 This video is private and cannot be accessed.`;
        case ErrorCode.YT_LOGIN_REQUIRED:
            return `🔑 YouTube requires login to access this video.`;
        case ErrorCode.YT_BOT_DETECTION:
            return `YouTube servers are down. Try again later.`;
        case ErrorCode.YT_GENERIC_DOWNLOAD:
            return `YouTube servers are down. Try again later.`;
        case ErrorCode.NO_AUDIO:
            return `🔇 No audio track detected in the video.`;

        // Processing Errors
        case ErrorCode.TRANSCRIPTION_FAILED:
            return `🎤 Audio transcription failed. Please try again.`;
        case ErrorCode.AI_PROCESSING_FAILED:
            return `⏳ AI processing failed. Our servers are busy.`;
        case ErrorCode.UNKNOWN_ERROR:
        default:
            return `❌ An unexpected error occurred. Please try again.`;
    }
}

export function mapError(error: any): AppError {
    const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();

    // YouTube / yt-dlp specific error mapping
    if (msg.includes('sign in to confirm your age') || msg.includes('age-restricted')) {
        return new AppError('This video is age-restricted and cannot be downloaded.', ErrorCode.YT_AGE_RESTRICTED, 400);
    }

    if (msg.includes('video available in') || msg.includes('geo-blocked') || msg.includes('country')) {
        return new AppError('This video is not available in your region (Geo-blocked).', ErrorCode.YT_GEO_BLOCKED, 400);
    }

    if (msg.includes('video unavailable') || msg.includes('incomplete youtube id') || msg.includes('unable to extract')) {
        return new AppError('This video is unavailable or the URL is invalid.', ErrorCode.YT_UNAVAILABLE, 400);
    }

    if (msg.includes('private video')) {
        return new AppError('This video is private and cannot be accessed.', ErrorCode.YT_PRIVATE, 400);
    }

    if (msg.includes('login required') || msg.includes('account required')) {
        return new AppError('YouTube requires login to access this video.', ErrorCode.YT_LOGIN_REQUIRED, 400);
    }

    if (msg.includes('bot') || msg.includes('automated access') || msg.includes('429') || msg.includes('too many requests')) {
        return new AppError('YouTube blocked the request (Bot detection). Please try again later.', ErrorCode.YT_BOT_DETECTION, 429);
    }

    // Audio issues
    if (msg.includes('no audio') || msg.includes('audio stream')) {
        return new AppError('No audio track detected in the video.', ErrorCode.NO_AUDIO, 400);
    }

    // Generic yt-dlp
    if (msg.includes('yt-dlp') || msg.includes('youtube-dl')) {
        return new AppError('Failed to download video from YouTube.', ErrorCode.YT_GENERIC_DOWNLOAD, 500);
    }

    // Default
    return new AppError('An unexpected error occurred. Please try again.', ErrorCode.UNKNOWN_ERROR, 500);
}


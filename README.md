# YouTube Shorts Generator

A Next.js application that automatically generates engaging short-form video clips from longer videos. The app uses AI to transcribe audio, generate summaries, and create optimized clips for social media platforms.

## Features

- 🎥 Upload video files for processing
- 🔗 YouTube URL support with automatic download
- 🎤 Automatic audio transcription (using OpenAI Whisper)
- 🤖 AI-powered content summarization
- ✂️ Automatic clip generation with timestamps
- 📱 Platform-specific optimization (TikTok, Instagram, YouTube Shorts)
- 🎯 Multiple AI model support (OpenAI GPT-4, Groq LLM)
- 🎵 **Smart Content Type Detection** - Automatically detects music, movie, and educational content
- 🎬 **Content-Specific Processing** - Optimizes clips based on content type:
  - **Music**: Focuses on catchy hooks, choruses, and viral-worthy lyrics
  - **Movies/TV**: Highlights dramatic moments, quotable dialogue, and memorable scenes
  - **Educational**: Creates informative, insight-focused clips

## Content Type Detection

The app automatically analyzes your content and applies specialized processing:

### 🎵 Music Content
- Detects songs, music videos, and musical performances
- Identifies the catchiest parts (chorus, hooks, memorable lyrics)
- Creates clips optimized for music sharing and viral potential
- Focuses on high-energy moments and emotional peaks

### 🎬 Movie/TV Content  
- Recognizes dramatic scenes, TV shows, and entertainment content
- Highlights quotable dialogue and memorable moments
- Creates clips that tell complete mini-stories
- Optimizes for dramatic impact and shareability

### 📚 Educational Content
- Processes lectures, tutorials, podcasts, and interviews
- Creates informative, insight-focused clips
- Maintains educational value while optimizing for engagement
- Focuses on key insights and revelations

## Getting Started

### Prerequisites

- Node.js 18+ 
- Python 3.11+ (for audio transcription)
- FFmpeg (for video processing)

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd yt-shorts-generator
```

2. Install Node.js dependencies:
```bash
npm install
```

3. Set up Python virtual environment and dependencies:
```bash
# Create virtual environment (if not already created)
python3 -m venv .venv

# Run the installation script
./install_python_deps.sh
```

4. Set up environment variables:
   
   Create a `.env.local` file with the following variables:
   ```env
   # OpenAI Configuration
   OPENAI_API_KEY=your_openai_api_key_here
   
   # Groq Configuration  
   GROQ_API_KEY=your_groq_api_key_here
   
   # NextAuth Configuration
   NEXTAUTH_SECRET=your_nextauth_secret_here
   NEXTAUTH_URL=http://localhost:3000
   
   # Google OAuth Configuration
   GOOGLE_CLIENT_ID=your_google_client_id_here
   GOOGLE_CLIENT_SECRET=your_google_client_secret_here
   
   # Database Configuration
   DATABASE_URL=postgresql://postgres:your_password@localhost:5432/yt_shorts_generator
   ```

5. Set up PostgreSQL database:
```bash
# Create database
createdb yt_shorts_generator

# Initialize database tables
node src/scripts/init-db.js
```

6. Start the development server:
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Python Dependencies

This application requires Python packages for audio transcription. If you encounter issues with Python 3.13:

### Option 1: Use Python 3.11 or 3.12
```bash
# Remove current virtual environment
rm -rf .venv

# Create new environment with Python 3.11
python3.11 -m venv .venv

# Run installation script
./install_python_deps.sh
```

### Option 2: Use Fallback Transcription
If Whisper installation fails, the application will use fallback transcription. This provides basic functionality without requiring complex Python dependencies.

## Environment Variables

Create a `.env.local` file with the following variables:

```env
OPENAI_API_KEY=your_openai_api_key
GROQ_API_KEY=your_groq_api_key
```

## Usage

1. Upload a video file or provide a YouTube URL
2. Select your target platform (TikTok, Instagram, YouTube Shorts)
3. Choose your preferred AI model
4. The app automatically detects your content type and optimizes processing
5. Wait for processing to complete
6. Download your generated clips optimized for your content type

## Content Type Examples

### Music Videos
- **Input**: Music video or song
- **Output**: Clips highlighting the catchiest chorus, memorable lyrics, and viral-worthy moments
- **Optimization**: Focuses on parts people want to sing along to or dance to

### Movie Clips
- **Input**: Movie scene or TV show clip
- **Output**: Clips featuring quotable dialogue, dramatic moments, and memorable scenes
- **Optimization**: Creates clips that tell complete mini-stories with emotional impact

### Educational Content
- **Input**: Lecture, tutorial, or podcast
- **Output**: Clips with key insights, revelations, and educational value
- **Optimization**: Maintains learning value while maximizing engagement

## Troubleshooting

### Slow Response Times
- Check that FFmpeg is properly installed
- Ensure Python dependencies are correctly installed
- Monitor console logs for timing information

### Transcription Issues
- Verify Python virtual environment is activated
- Check that Whisper is installed: `pip list | grep whisper`
- If Whisper fails, the app will use fallback transcription

### Video Processing Errors
- Ensure uploaded video has valid audio/video streams
- Check available disk space in uploads directory
- Verify FFmpeg installation: `ffmpeg -version`

### Content Type Detection Issues
- The app uses AI to detect content type from transcription
- If detection fails, it falls back to keyword-based detection
- Educational content is the default fallback

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

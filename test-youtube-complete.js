const FormData = require('form-data');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

async function testYouTubeProcessing() {
  console.log('Testing complete YouTube URL processing with fallbacks...');
  
  const formData = new FormData();
  formData.append('youtubeUrl', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'); // Rick Roll for testing
  formData.append('platform', 'youtube');
  formData.append('aiModel', 'openai');

  try {
    console.log('Sending request to /api/process...');
    const response = await fetch('http://localhost:3000/api/process', {
      method: 'POST',
      body: formData,
    });

    console.log('Response status:', response.status);
    
    if (!response.ok) {
      const errorData = await response.json();
      console.error('Error response:', errorData);
      return;
    }

    const result = await response.json();
    console.log('✅ Success! Processing completed.');
    console.log('Source type:', result.sourceType);
    console.log('Number of clips:', result.clips.length);
    console.log('Processing time:', result.processingTime, 'ms');
    console.log('AI Model used:', result.aiModel);
    
    if (result.clips.length > 0) {
      console.log('First clip type:', result.clips[0].type);
      console.log('First clip filename:', result.clips[0].filename);
      console.log('First clip title:', result.clips[0].title);
    }
    
    console.log('Summary:', result.summary);
    console.log('Transcription length:', result.transcription.length, 'characters');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testYouTubeProcessing(); 
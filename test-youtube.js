const FormData = require('form-data');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

async function testYouTubeProcessing() {
  console.log('Testing YouTube URL processing...');
  
  const formData = new FormData();
  formData.append('youtubeUrl', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'); // Rick Roll for testing
  formData.append('platform', 'youtube');
  formData.append('aiModel', 'openai');

  try {
    const response = await fetch('http://localhost:3000/api/process', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Error:', errorData);
      return;
    }

    const result = await response.json();
    console.log('Success! Processing completed.');
    console.log('Source type:', result.sourceType);
    console.log('Number of clips:', result.clips.length);
    console.log('Processing time:', result.processingTime, 'ms');
    
    if (result.clips.length > 0) {
      console.log('First clip type:', result.clips[0].type);
      console.log('First clip filename:', result.clips[0].filename);
    }
    
  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

testYouTubeProcessing(); 
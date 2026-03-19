import { NextResponse } from 'next/server';

const GOOGLE_FORM_ID = '1FAIpQLSee7tCcOjeDvDEKmbyOklsvdxSPylh9Bq2M1XN83AqjoONnVw';
const GOOGLE_FORM_URL = `https://docs.google.com/forms/d/e/${GOOGLE_FORM_ID}/formResponse`;

// Test endpoint to verify Google Form submission
export async function GET() {
  try {
    // Test with sample data
    const formData = new URLSearchParams();
    formData.append('entry.839337160', 'Test feedback from API');
    formData.append('entry.1045781291', 'test@example.com');
    formData.append('entry.1510560057', 'Test suggestions');
    formData.append('submit', 'Submit');

    console.log('Testing Google Form submission...');
    console.log('Form URL:', GOOGLE_FORM_URL);
    console.log('Form data:', formData.toString());

    const response = await fetch(GOOGLE_FORM_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': `https://docs.google.com/forms/d/e/${GOOGLE_FORM_ID}/viewform`,
      },
      body: formData.toString(),
      redirect: 'manual',
    });

    const status = response.status;
    const location = response.headers.get('location');
    
    console.log('Response status:', status);
    console.log('Redirect location:', location);

    return NextResponse.json({
      success: status === 302 || status === 200,
      status,
      location,
      message: status === 302 
        ? 'Form submission appears successful (302 redirect received)'
        : `Unexpected status: ${status}. Check your Google Form settings.`,
      formUrl: `https://docs.google.com/forms/d/e/${GOOGLE_FORM_ID}/viewform`,
      entryIds: {
        feedback: 'entry.839337160',
        email: 'entry.1045781291',
        suggestions: 'entry.1510560057',
      },
    });
  } catch (error) {
    console.error('Test submission error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}



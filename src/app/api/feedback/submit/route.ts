import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { feedback, email, suggestions } = body;

    const FORM_ID = '1FAIpQLSee7tCcOjeDvDEKmbyOklsvdxSPylh9Bq2M1XN83AqjoONnVw';
    
    // Entry IDs from Google Form (updated email ID)
    const ENTRY_FEEDBACK = 'entry.839337160';
    const ENTRY_EMAIL = 'entry.889551860'; // Updated email entry ID
    const ENTRY_SUGGESTIONS = 'entry.1510560057';

    console.log('=== SERVER-SIDE FEEDBACK SUBMISSION ===');
    console.log('Form ID:', FORM_ID);
    console.log('Data:', { feedback, email, suggestions });
    console.log('Entry IDs:', { ENTRY_FEEDBACK, ENTRY_EMAIL, ENTRY_SUGGESTIONS });

    // Build form data for POST submission
    const formData = new URLSearchParams();
    formData.append(ENTRY_FEEDBACK, feedback || '');
    formData.append(ENTRY_EMAIL, email || '');
    formData.append(ENTRY_SUGGESTIONS, suggestions || '');

    const submitUrl = `https://docs.google.com/forms/d/e/${FORM_ID}/formResponse`;
    console.log('Submit URL:', submitUrl);
    console.log('Form data:', formData.toString());

    // Submit to Google Forms using POST (standard for form submissions)
    const response = await fetch(submitUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Referer': `https://docs.google.com/forms/d/e/${FORM_ID}/viewform`,
        'Origin': 'https://docs.google.com',
      },
      body: formData.toString(),
      redirect: 'manual',
    });

    console.log('=== GOOGLE FORMS RESPONSE ===');
    console.log('Status:', response.status);
    console.log('Status Text:', response.statusText);
    console.log('Headers:', Object.fromEntries(response.headers.entries()));

    const responseText = await response.text();
    console.log('Response length:', responseText.length);
    console.log('Response preview (first 500 chars):', responseText.substring(0, 500));

    // Check response status
    const location = response.headers.get('location') || '';
    console.log('Location header:', location);

    // Check for 400 - bad request (wrong parameters or format)
    if (response.status === 400) {
      console.error('❌ 400 BAD REQUEST - Request format is incorrect');
      console.error('   Possible issues:');
      console.error('   1. Wrong entry IDs');
      console.error('   2. Invalid parameter format');
      console.error('   3. Missing required fields');
      console.error('\n⚠️ Check:');
      console.error('   - Verify entry IDs match your form fields');
      console.error('   - Make sure all required fields are included');
      
      return NextResponse.json({ 
        success: false, 
        message: 'Invalid request format. Please check form configuration.',
        status: response.status,
        error: '400 Bad Request - Check entry IDs and form structure'
      }, { status: 500 });
    }

    // Check for 401 - form might be private or not accepting responses
    if (response.status === 401) {
      console.error('❌ 401 UNAUTHORIZED - Form is likely:');
      console.error('   1. Not set to "Anyone with the link" can respond');
      console.error('   2. Not accepting responses (toggle is OFF)');
      console.error('   3. Requires authentication');
      console.error('\n⚠️ ACTION REQUIRED:');
      console.error('   - Open: https://docs.google.com/forms/d/e/' + FORM_ID + '/viewform');
      console.error('   - Click "Responses" tab → Turn ON "Accepting responses"');
      console.error('   - Click "Send" → Link icon → Set to "Anyone with the link"');
      
      return NextResponse.json({ 
        success: false, 
        message: 'Form is not accepting responses. Please check form settings.',
        status: response.status,
        error: '401 Unauthorized - Form may be private or not accepting responses'
      }, { status: 500 });
    }

    // Check if redirecting to login (form requires authentication)
    if (response.status === 302 && location.includes('accounts.google.com/ServiceLogin')) {
      console.error('❌ 302 REDIRECT TO LOGIN - Form requires authentication');
      console.error('   The form is set to require sign-in');
      console.error('\n⚠️ ACTION REQUIRED:');
      console.error('   - Open: https://docs.google.com/forms/d/e/' + FORM_ID + '/viewform');
      console.error('   - Click "Send" → Link icon → Change to "Anyone with the link"');
      console.error('   - This will allow anonymous submissions');
      
      return NextResponse.json({ 
        success: false, 
        message: 'Form requires authentication. Please change form settings to allow anonymous submissions.',
        status: response.status,
        error: 'Form requires sign-in - change to "Anyone with the link"'
      }, { status: 500 });
    }

    // Google Forms typically returns 200, 302, or 303 on success
    // 302 can also mean success if it redirects to a thank you page
    if (response.status === 200 || response.status === 302 || response.status === 303) {
      // If 302 but not redirecting to login, it's likely a success redirect
      if (response.status === 302 && !location.includes('accounts.google.com')) {
        console.log('✅ Submission appears successful (302 redirect to thank you page)');
      } else if (response.status === 200) {
        console.log('✅ Submission appears successful (200 OK)');
      } else {
        console.log('✅ Submission appears successful (status: ' + response.status + ')');
      }
      
      return NextResponse.json({ 
        success: true, 
        message: 'Feedback submitted successfully',
        status: response.status 
      });
    } else {
      console.log('⚠️ Unexpected status:', response.status);
      console.log('Response might still be accepted by Google Forms');
      // Sometimes Google Forms accepts submissions even with non-standard status codes
      // Return success but log the status
      return NextResponse.json({ 
        success: true, 
        message: 'Feedback submitted (unexpected status, but may have succeeded)',
        status: response.status,
        warning: 'Received status ' + response.status + ' - please verify in Google Forms'
      });
    }
  } catch (error: any) {
    console.error('=== ERROR SUBMITTING FEEDBACK ===');
    console.error('Error:', error);
    console.error('Error message:', error?.message);
    console.error('Error stack:', error?.stack);
    
    return NextResponse.json({ 
      success: false, 
      message: 'Error submitting feedback',
      error: error?.message || 'Unknown error'
    }, { status: 500 });
  }
}


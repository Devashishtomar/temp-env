import { NextRequest, NextResponse } from 'next/server';

const GOOGLE_FORM_ID = '1FAIpQLSee7tCcOjeDvDEKmbyOklsvdxSPylh9Bq2M1XN83AqjoONnVw';
const GOOGLE_FORM_URL = `https://docs.google.com/forms/d/e/${GOOGLE_FORM_ID}/formResponse`;
const GOOGLE_FORM_VIEW_URL = `https://docs.google.com/forms/d/e/${GOOGLE_FORM_ID}/viewform`;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { feedback, email, suggestions } = body;

    console.log('Submitting feedback to Google Forms:', { feedback, email, suggestions });

    // First, fetch the form page to establish a session and get cookies
    const formPageResponse = await fetch(GOOGLE_FORM_VIEW_URL, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    // Extract cookies from response
    const setCookieHeaders = formPageResponse.headers.getSetCookie?.() || [];
    const cookies = setCookieHeaders.map(cookie => {
      // Extract just the cookie name=value part
      return cookie.split(';')[0];
    }).join('; ');

    console.log('Cookies extracted:', cookies ? 'Yes' : 'No');

    // Map form fields to Google Form entry IDs
    // entry.839337160 = feedback
    // entry.1045781291 = email
    // entry.1510560057 = suggestions
    const formData = new URLSearchParams();
    formData.append('entry.839337160', feedback || '');
    formData.append('entry.1045781291', email || '');
    formData.append('entry.1510560057', suggestions || '');

    const formDataString = formData.toString();
    console.log('Form data being sent:', formDataString);

    // Submit to Google Forms with cookies
    const response = await fetch(GOOGLE_FORM_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': GOOGLE_FORM_VIEW_URL,
        'Origin': 'https://docs.google.com',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        ...(cookies ? { 'Cookie': cookies } : {}),
      },
      body: formDataString,
      redirect: 'manual',
    });

    console.log('Google Forms response status:', response.status);
    
    // Google Forms returns 302 (redirect) on successful submission
    if (response.status === 302) {
      const location = response.headers.get('location');
      console.log('Success! Redirect location:', location);
      return NextResponse.json({ 
        success: true,
        message: 'Feedback submitted successfully' 
      });
    } else if (response.status === 200) {
      // Sometimes Google Forms returns 200 with a success page
      const responseText = await response.text();
      if (responseText.includes('Your response has been recorded') || 
          responseText.includes('Thank you') ||
          responseText.includes('response has been recorded')) {
        console.log('Success! Form submitted (200 with success message)');
        return NextResponse.json({ 
          success: true,
          message: 'Feedback submitted successfully' 
        });
      }
    }
    
    // If we get 401, the form might be private or require authentication
    if (response.status === 401) {
      console.error('401 Unauthorized - Form may be private or require sign-in');
      return NextResponse.json(
        { 
          success: false,
          error: 'Form submission failed: The Google Form appears to be private or requires authentication. Please make sure the form is set to "Anyone with the link can respond" in Google Forms settings.',
          status: 401
        },
        { status: 401 }
      );
    }
    
    // Other error statuses
    const responseText = await response.text();
    console.log('Unexpected response status:', response.status);
    console.log('Response preview:', responseText.substring(0, 500));
    
    return NextResponse.json(
      { 
        success: false,
        error: `Form submission failed with status ${response.status}. Please check your Google Form settings.`,
        status: response.status
      },
      { status: 500 }
    );
  } catch (error) {
    console.error('Error submitting feedback to Google Forms:', error);
    if (error instanceof Error) {
      console.error('Error details:', error.message, error.stack);
    }
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to submit feedback. Please try again.' 
      },
      { status: 500 }
    );
  }
}

'use client';

export default function TestGoogleForm() {
  const testSubmission = () => {
    const FORM_ID = '1FAIpQLSee7tCcOjeDvDEKmbyOklsvdxSPylh9Bq2M1XN83AqjoONnVw';
    const ENTRY_FEEDBACK = 'entry.839337160';
    const ENTRY_EMAIL = 'entry.1045781291';
    const ENTRY_SUGGESTIONS = 'entry.1510560057';
    
    const params = new URLSearchParams({
      [ENTRY_FEEDBACK]: 'TEST FEEDBACK',
      [ENTRY_EMAIL]: 'test@test.com',
      [ENTRY_SUGGESTIONS]: 'TEST SUGGESTIONS',
    });
    
    const submitUrl = `https://docs.google.com/forms/d/e/${FORM_ID}/formResponse?${params.toString()}`;
    
    console.log('Test URL:', submitUrl);
    
    // Open in new window so user can see what happens
    window.open(submitUrl, '_blank');
    
    // Also try POST
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = `https://docs.google.com/forms/d/e/${FORM_ID}/formResponse`;
    form.target = '_blank';
    form.style.display = 'none';
    
    [ENTRY_FEEDBACK, ENTRY_EMAIL, ENTRY_SUGGESTIONS].forEach(name => {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = name;
      input.value = name === ENTRY_FEEDBACK ? 'TEST FEEDBACK' : name === ENTRY_EMAIL ? 'test@test.com' : 'TEST SUGGESTIONS';
      form.appendChild(input);
    });
    
    document.body.appendChild(form);
    form.submit();
  };
  
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Google Form Test</h1>
      <button 
        onClick={testSubmission}
        className="bg-blue-500 text-white px-4 py-2 rounded"
      >
        Test Form Submission
      </button>
      <p className="mt-4">Check your Google Form responses after clicking.</p>
    </div>
  );
}



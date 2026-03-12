// Test the async video processing endpoint with proper blob path

async function testProcessWebinar() {
  const url = 'http://localhost:3000/api/media/process-webinar';
  
  const payload = {
    sourceBlob: 'webinars/interview_webinar.mp4', // ✅ This blob exists (121 MB)
    webinarId: 'test-async-' + Date.now(),
    title: 'Interview Webinar Test',
    presenter: 'Test Presenter',
    date: new Date().toISOString()
  };

  console.log('\n🚀 Testing async video processing...');
  console.log('📤 Request:', JSON.stringify(payload, null, 2));
  console.log('\n⏳ Sending POST request...\n');

  const startTime = Date.now();

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n✅ Response received in ${elapsed}s`);
    console.log(`📊 Status: ${response.status} ${response.statusText}`);

    const data = await response.json();
    console.log('📦 Response body:', JSON.stringify(data, null, 2));

    if (data.job_id) {
      console.log(`\n✨ Success! Job ID: ${data.job_id}`);
      console.log(`📋 Queued assets: ${data.queued_asset_count}`);
      console.log(`\n🔍 Check job status with:`);
      console.log(`   curl http://localhost:3000/api/media/job-status/${data.job_id}`);
      
      // Wait a few seconds and check status
      console.log(`\n⏳ Waiting 5 seconds to check status...`);
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      const statusUrl = `http://localhost:3000/api/media/job-status/${data.job_id}`;
      const statusResponse = await fetch(statusUrl);
      const statusData = await statusResponse.json();
      console.log(`\n📊 Job Status:`, JSON.stringify(statusData, null, 2));
      
      console.log(`\n💡 The job is processing in the background. Check logs with:`);
      console.log(`   Watch server console for "[Queue] Processing job ${data.job_id}"`);
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message);
  }
}

testProcessWebinar();

# Testing Async Video Processing API

## 🚀 Quick Start

The `/api/media/process-webinar` endpoint now uses **asynchronous processing** with Redis queue. This means:
- ✅ API responds **immediately** (< 1 second) with HTTP 202
- ✅ Video processing happens in **background**
- ✅ You poll the status endpoint to check progress

---

## 📬 Postman Testing Guide

### Step 1: Start Video Processing (POST)

**URL:** `http://localhost:3000/api/media/process-webinar`  
**Method:** `POST`  
**Headers:** `Content-Type: application/json`

**Request Body:**
```json
{
  "sourceBlob": "https://stgsupademomedia.blob.core.windows.net/webinars/sample_video.mp4",
  "webinarId": "postman-test-001",
  "title": "Test Webinar Recording",
  "presenter": "John Doe",
  "date": "2026-03-08"
}
```

**Expected Response (202 Accepted):**
```json
{
  "success": true,
  "message": "Video processing queued",
  "jobId": "1",
  "webinarId": "postman-test-001",
  "statusUrl": "/api/media/job-status/1"
}
```

**Response Time:** < 1 second ⚡

---

### Step 2: Check Job Status (GET)

Copy the `jobId` from Step 1 response.

**URL:** `http://localhost:3000/api/media/job-status/{jobId}`  
**Method:** `GET`  
**Example:** `http://localhost:3000/api/media/job-status/1`

**Response (Processing):**
```json
{
  "jobId": "1",
  "webinarId": "postman-test-001",
  "status": "active",
  "progress": 0,
  "queuedAt": "2026-03-08T10:30:00.000Z",
  "startedAt": "2026-03-08T10:30:01.000Z",
  "completedAt": null,
  "assetsCreated": null,
  "error": null,
  "result": null
}
```

**Response (Completed):**
```json
{
  "jobId": "1",
  "webinarId": "postman-test-001",
  "status": "completed",
  "progress": 0,
  "queuedAt": "2026-03-08T10:30:00.000Z",
  "startedAt": "2026-03-08T10:30:01.000Z",
  "completedAt": "2026-03-08T10:33:15.000Z",
  "assetsCreated": 12,
  "error": null,
  "result": {
    "success": true,
    "assets": 12,
    "webinarId": "postman-test-001"
  }
}
```

**Polling Strategy:**
- Poll every **5 seconds** while `status` is `"waiting"` or `"active"`
- Stop when `status` is `"completed"` or `"failed"`

---

### Step 3: Get Processed Assets (GET)

Once status is `"completed"`, retrieve the assets.

**URL:** `http://localhost:3000/api/media/assets/{webinarId}`  
**Method:** `GET`  
**Example:** `http://localhost:3000/api/media/assets/postman-test-001`

**Response:**
```json
{
  "webinarId": "postman-test-001",
  "assets": [
    {
      "AssetId": "uuid-1",
      "WebinarId": "postman-test-001",
      "AssetType": "full-replay",
      "BlobURL": "https://...",
      "FileSize": 25000000,
      "Duration": 180,
      "Resolution": "1080p",
      "Format": "mp4"
    },
    {
      "AssetType": "hls-1080p",
      "BlobURL": "https://...",
      "Resolution": "1080p"
    },
    // ... 10 more assets
  ]
}
```

---

### Step 4: List All Jobs (GET)

**URL:** `http://localhost:3000/api/media/jobs`  
**Method:** `GET`

**Query Parameters (Optional):**
- `status` - Filter by status (`queued`, `active`, `completed`, `failed`)
- `limit` - Max results (default: 50)

**Example:** `http://localhost:3000/api/media/jobs?status=completed&limit=10`

**Response:**
```json
{
  "jobs": [
    {
      "JobId": "1",
      "WebinarId": "postman-test-001",
      "Status": "completed",
      "QueuedAt": "2026-03-08T10:30:00.000Z",
      "StartedAt": "2026-03-08T10:30:01.000Z",
      "CompletedAt": "2026-03-08T10:33:15.000Z",
      "AssetsCreated": 12,
      "ErrorMessage": null
    },
    {
      "JobId": "2",
      "WebinarId": "test-002",
      "Status": "failed",
      "QueuedAt": "2026-03-08T10:35:00.000Z",
      "StartedAt": "2026-03-08T10:35:01.000Z",
      "CompletedAt": "2026-03-08T10:35:10.000Z",
      "AssetsCreated": 0,
      "ErrorMessage": "FFmpeg error: unable to open input file"
    }
  ],
  "count": 2
}
```

---

## 🎯 Complete Testing Workflow

### Manual Testing in Postman

1. **Submit Job** → `POST /api/media/process-webinar` → Save `jobId`
2. **Wait 5 seconds**
3. **Check Status** → `GET /api/media/job-status/{jobId}`
4. **Repeat Step 3** until `status` is `"completed"` (typically 2-4 minutes)
5. **Get Assets** → `GET /api/media/assets/{webinarId}`
6. **Verify** → 12 assets returned

### Automated Testing with Postman Runner

Create a Postman Collection:

**Test 1: Submit Job**
```javascript
// POST /api/media/process-webinar
pm.test("Job queued successfully", function() {
    pm.response.to.have.status(202);
    pm.expect(pm.response.json().success).to.be.true;
    pm.environment.set("jobId", pm.response.json().jobId);
});
```

**Test 2: Poll Status (with delay)**
```javascript
// GET /api/media/job-status/{{jobId}}
pm.test("Job status retrieved", function() {
    pm.response.to.have.status(200);
    const status = pm.response.json().status;
    
    if (status !== "completed" && status !== "failed") {
        // Still processing - delay next request by 5 seconds
        setTimeout(function() {}, 5000);
        postman.setNextRequest("Test 2: Poll Status");
    } else {
        // Completed or failed - move to next test
        postman.setNextRequest("Test 3: Get Assets");
    }
});
```

**Test 3: Get Assets**
```javascript
// GET /api/media/assets/{{webinarId}}
pm.test("Assets retrieved", function() {
    pm.response.to.have.status(200);
    const assets = pm.response.json().assets;
    pm.expect(assets).to.be.an("array");
    pm.expect(assets.length).to.be.at.least(12);
});
```

---

## 📊 Job Status Values

| Status | Description | Next Action |
|--------|-------------|-------------|
| `waiting` | Job queued, not started yet | Keep polling |
| `active` | Currently processing | Keep polling |
| `completed` | Processing finished successfully | Get assets |
| `failed` | Processing failed | Check error message |
| `delayed` | Waiting to retry after failure | Keep polling |
| `paused` | Queue paused (admin action) | Wait for resume |

---

## ⚠️ Common Scenarios

### Scenario 1: Job Still Running After 5 Minutes
**Possible Causes:**
- Large video file (> 100 MB)
- High CPU usage
- Multiple jobs in queue

**Action:** Continue polling, or check server logs

### Scenario 2: Job Status "failed"
**Possible Causes:**
- Invalid sourceBlob URL
- Blob does not exist
- FFmpeg error (codec not supported)

**Action:** Check `error` field in status response

### Scenario 3: Job Not Found (404)
**Possible Causes:**
- Wrong jobId
- Job expired (old jobs cleared after 7 days)
- Server restarted and queue cleared

**Action:** Submit new job

---

## 🔧 Server Logs

Monitor background processing in terminal:

```bash
cd backend
npm run dev
```

You'll see logs like:
```
[Queue] Video processing queue initialized
[Queue] Processing job 1 for webinar postman-test-001
[FFmpeg] Downloading blob: "webinars/sample_video.mp4"
[FFmpeg] Transcoding... frame=746 fps=160
[FFmpeg] HLS 1080p started...
[Queue] ✅ Job 1 completed: { success: true, assets: 12 }
```

---

## 🚀 Performance Comparison

| Metric | Synchronous (Old) | Asynchronous (New) |
|--------|-------------------|---------------------|
| API Response Time | 3+ minutes ⏳ | < 1 second ⚡ |
| User Experience | Blocked, no progress | Non-blocking, status updates |
| Error Handling | Request timeout | Graceful retry (3 attempts) |
| Scalability | 1 video at a time | Multiple videos in queue |
| Timeout Risk | High (request timeout) | None (background job) |

---

## 📝 Next Steps

1. ✅ Test in Postman using steps above
2. ✅ Verify 12 assets created in database
3. ✅ Check ProcessingJobs table for job record
4. ✅ Update frontend to use polling pattern
5. ✅ Add webhook notification when job completes (future)

---

**Generated:** March 8, 2026  
**API Version:** 3.0.0  
**Feature:** Async Video Processing with Bull Queue

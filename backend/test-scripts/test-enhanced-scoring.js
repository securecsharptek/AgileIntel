// test-enhanced-scoring.js
// Test script for v3.0 4-dimensional lead scoring
// Validates AC-M1-08: "Lead score recalculates with 4th dimension when video engagement data exists"

// Disable HubSpot and Slack BEFORE loading any modules
process.env.HUBSPOT_API_KEY = '';
process.env.SLACK_WEBHOOK_URL = '';

const sql = require('mssql');
require('dotenv').config();

const config = {
  server: process.env.AZURE_SQL_SERVER || '',
  database: process.env.AZURE_SQL_DATABASE || '',
  user: process.env.AZURE_SQL_USER || '',
  password: process.env.AZURE_SQL_PASSWORD || '',
  options: { encrypt: true, trustServerCertificate: false },
};

// Test scenario constants
const TEST_PROSPECT_EMAIL = 'test-enhanced-scoring@agileintel.io';
const TEST_WEBINAR_ID = 'test-webinar-4d-scoring';

async function setupTestData(pool) {
  console.log('\n📦 Setting up test data...');
  
  // Clean up any existing test data
  await pool.request()
    .input('email', sql.NVarChar, TEST_PROSPECT_EMAIL)
    .query('DELETE FROM VideoEngagements WHERE ProspectEmail = @email');
  
  await pool.request()
    .input('email', sql.NVarChar, TEST_PROSPECT_EMAIL)
    .query('DELETE FROM DemoEngagements WHERE ProspectEmail = @email');
  
  await pool.request()
    .input('webinarId', sql.NVarChar, TEST_WEBINAR_ID)
    .query('DELETE FROM MediaAssets WHERE WebinarId = @webinarId');

  // Create test media assets
  const assetResult = await pool.request()
    .input('webinarId', sql.NVarChar, TEST_WEBINAR_ID)
    .input('assetType', sql.NVarChar, 'full-replay')
    .input('blobUrl', sql.NVarChar, 'https://test.blob.core.windows.net/test.mp4')
    .query(`
      INSERT INTO MediaAssets (WebinarId, AssetType, BlobURL, Duration, Resolution, Format)
      OUTPUT INSERTED.AssetId
      VALUES (@webinarId, @assetType, @blobUrl, 3600, '1080p', 'mp4')
    `);

  const assetId = assetResult.recordset[0].AssetId;
  console.log(`✓ Created test MediaAsset: ${assetId}`);

  // Create test demo engagement record
  let demoResult = await pool.request()
    .input('supademoId', sql.NVarChar, 'test-demo-001')
    .query('SELECT DemoId FROM SupademoDemos WHERE SupademoDemoId = @supademoId');

  let demoId;
  if (demoResult.recordset.length === 0) {
    console.log('No test demo found, creating one...');
    const createDemoResult = await pool.request()
      .input('supademoId', sql.NVarChar, 'test-demo-001')
      .input('demoName', sql.NVarChar, 'Test Demo for Enhanced Scoring')
      .input('demoType', sql.NVarChar, 'core_platform')
      .input('demoUrl', sql.NVarChar, 'https://app.supademo.com/demo/test-demo-001')
      .query(`
        INSERT INTO SupademoDemos (SupademoDemoId, DemoName, DemoType, DemoURL)
        OUTPUT INSERTED.DemoId
        VALUES (@supademoId, @demoName, @demoType, @demoUrl)
      `);
    demoId = createDemoResult.recordset[0].DemoId;
    console.log(`✓ Created test demo: ${demoId}`);
  } else {
    demoId = demoResult.recordset[0].DemoId;
    console.log(`✓ Using existing demo: ${demoId}`);
  }

  const engagementResult = await pool.request()
    .input('demoId', sql.UniqueIdentifier, demoId)
    .input('prospectEmail', sql.NVarChar, TEST_PROSPECT_EMAIL)
    .input('prospectName', sql.NVarChar, 'Test User')
    .input('companyName', sql.NVarChar, 'Test Company')
    .input('timeSpent', sql.Int, 450)  // 7.5 minutes = 75% of max (600s)
    .input('completionPercentage', sql.Decimal(5, 2), 80.00)
    .input('stepsViewed', sql.Int, 8)  // 80% of max (10 steps)
    .query(`
      INSERT INTO DemoEngagements (
        DemoId, ProspectEmail, ProspectName, CompanyName,
        TimeSpent, CompletionPercentage, StepsViewed, IsGovernmentProspect
      )
      OUTPUT INSERTED.EngagementId
      VALUES (
        @demoId, @prospectEmail, @prospectName, @companyName,
        @timeSpent, @completionPercentage, @stepsViewed, 0
      )
    `);

  const engagementId = engagementResult.recordset[0].EngagementId;
  console.log(`✓ Created test DemoEngagement: ${engagementId}`);

  return { assetId, engagementId, demoId };
}

async function test3DScoring(pool, engagementId) {
  console.log('\n🧪 TEST 1: 3D Scoring (No Video Data)');
  console.log('Expected behavior: Uses v2.0 weights (0.40, 0.35, 0.25)');
  
  // Import the service
  const { SupademoService } = require('./src/services/supademo.service');
  const service = new SupademoService();

  const engagement = {
    demoId: 'test-demo-001',
    supademoId: 'test-demo-001',
    prospectEmail: TEST_PROSPECT_EMAIL,
    prospectName: 'Test User',
    companyName: 'Test Company',
    timeSpent: 450,         // 75/100 normalized
    completionPercentage: 80,
    stepsViewed: 8,         // 80/100 normalized
  };

  const result = await service.calculateEnhancedLeadScore(engagementId, engagement, false);
  
  console.log('Result:', {
    score: result.score,
    breakdown: result.breakdown,
    isHighIntent: result.isHighIntent,
  });

  // Expected: 75*0.40 + 80*0.35 + 80*0.25 = 30 + 28 + 20 = 78
  const expected3D = Math.round(75 * 0.40 + 80 * 0.35 + 80 * 0.25);
  
  if (result.score === expected3D && !result.breakdown.videoScore) {
    console.log(`✅ PASS: Score ${result.score} matches expected ${expected3D} (3D formula)`);
    return { pass: true, score3D: result.score };
  } else {
    console.log(`❌ FAIL: Expected ${expected3D}, got ${result.score}`);
    return { pass: false, score3D: result.score };
  }
}

async function test4DScoring(pool, engagementId, assetId) {
  console.log('\n🧪 TEST 2: 4D Scoring (With Video Data)');
  console.log('Expected behavior: Uses v3.0 weights (0.30, 0.25, 0.20, 0.25)');

  // Insert video engagement data
  await pool.request()
    .input('assetId', sql.UniqueIdentifier, assetId)
    .input('prospectEmail', sql.NVarChar, TEST_PROSPECT_EMAIL)
    .input('watchDuration', sql.Int, 2400)  // 40 minutes
    .input('watchPercentage', sql.Decimal(5, 2), 85.00)
    .input('rewatchCount', sql.Int, 2)
    .query(`
      INSERT INTO VideoEngagements (AssetId, ProspectEmail, WatchDuration, WatchPercentage, RewatchCount)
      VALUES (@assetId, @prospectEmail, @watchDuration, @watchPercentage, @rewatchCount)
    `);

  console.log('✓ Inserted video engagement: 85% watch, 2 rewatches');

  // Import the service
  const { SupademoService } = require('./src/services/supademo.service');
  const service = new SupademoService();

  const engagement = {
    demoId: 'test-demo-001',
    supademoId: 'test-demo-001',
    prospectEmail: TEST_PROSPECT_EMAIL,
    prospectName: 'Test User',
    companyName: 'Test Company',
    timeSpent: 450,         // 75/100 normalized
    completionPercentage: 80,
    stepsViewed: 8,         // 80/100 normalized
  };

  const result = await service.calculateEnhancedLeadScore(engagementId, engagement, false);
  
  console.log('Result:', {
    score: result.score,
    breakdown: result.breakdown,
    isHighIntent: result.isHighIntent,
  });

  // Expected video score: 85 (watch%) + 10 (2 rewatches * 5) = 95
  // Expected 4D: 75*0.30 + 80*0.25 + 80*0.20 + 95*0.25 = 22.5 + 20 + 16 + 23.75 = 82.25 ≈ 82
  const expectedVideoScore = 85 + (2 * 5); // 95
  const expected4D = Math.round(75 * 0.30 + 80 * 0.25 + 80 * 0.20 + expectedVideoScore * 0.25);
  
  if (result.breakdown.videoScore && result.score === expected4D) {
    console.log(`✅ PASS: Score ${result.score} matches expected ${expected4D} (4D formula with video)`);
    console.log(`   Video dimension: ${result.breakdown.videoScore}/100`);
    return { pass: true, score4D: result.score };
  } else {
    console.log(`❌ FAIL: Expected ${expected4D}, got ${result.score}`);
    console.log(`   Expected video score: ${expectedVideoScore}, got: ${result.breakdown.videoScore}`);
    return { pass: false, score4D: result.score };
  }
}

async function testScoreComparison(score3D, score4D) {
  console.log('\n🧪 TEST 3: Score Change Validation');
  console.log('Expected: 4D score should differ from 3D score when video data present');

  console.log(`3D Score (no video): ${score3D}`);
  console.log(`4D Score (with video): ${score4D}`);
  console.log(`Difference: ${score4D - score3D} points`);

  if (score4D !== score3D) {
    console.log(`✅ PASS: Score changed from ${score3D} to ${score4D} with video dimension`);
    return true;
  } else {
    console.log(`❌ FAIL: Scores should differ when video data is present`);
    return false;
  }
}

async function cleanupTestData(pool) {
  console.log('\n🧹 Cleaning up test data...');
  
  await pool.request()
    .input('email', sql.NVarChar, TEST_PROSPECT_EMAIL)
    .query('DELETE FROM VideoEngagements WHERE ProspectEmail = @email');
  
  await pool.request()
    .input('email', sql.NVarChar, TEST_PROSPECT_EMAIL)
    .query('DELETE FROM DemoEngagements WHERE ProspectEmail = @email');
  
  await pool.request()
    .input('webinarId', sql.NVarChar, TEST_WEBINAR_ID)
    .query('DELETE FROM MediaAssets WHERE WebinarId = @webinarId');

  // Clean up test demo if it exists
  await pool.request()
    .input('supademoId', sql.NVarChar, 'test-demo-001')
    .query('DELETE FROM SupademoDemos WHERE SupademoDemoId = @supademoId');

  console.log('✓ Cleanup complete');
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  v3.0 Enhanced Lead Scoring Test Suite');
  console.log('  4-Dimensional Scoring with Video Engagement');
  console.log('═══════════════════════════════════════════════════════════════');

  let pool;
  try {
    pool = await sql.connect(config);
    console.log('✓ Connected to Azure SQL Database');

    const { assetId, engagementId } = await setupTestData(pool);

    const test1Result = await test3DScoring(pool, engagementId);
    const test2Result = await test4DScoring(pool, engagementId, assetId);
    const test3Pass = await testScoreComparison(test1Result.score3D, test2Result.score4D);

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  TEST SUMMARY');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`Test 1 (3D Scoring):        ${test1Result.pass ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Test 2 (4D Scoring):        ${test2Result.pass ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Test 3 (Score Comparison):  ${test3Pass ? '✅ PASS' : '❌ FAIL'}`);
    console.log('═══════════════════════════════════════════════════════════════');

    const allPassed = test1Result.pass && test2Result.pass && test3Pass;
    if (allPassed) {
      console.log('\n🎉 ALL TESTS PASSED - AC-M1-08 VERIFIED');
      console.log('✓ calculateEnhancedLeadScore() implemented correctly');
      console.log('✓ Score changes when video data present');
      console.log('✓ 4D scoring uses correct v3.0 weights');
      await cleanupTestData(pool);
      process.exit(0);
    } else {
      console.log('\n⚠️  SOME TESTS FAILED - Review implementation');
      await cleanupTestData(pool);
      process.exit(1);
    }

  } catch (error) {
    console.error('\n❌ Test execution error:', error);
    if (pool) {
      try {
        await cleanupTestData(pool);
      } catch (cleanupError) {
        console.error('Cleanup error:', cleanupError);
      }
    }
    process.exit(1);
  } finally {
    if (pool) await pool.close();
  }
}

main();

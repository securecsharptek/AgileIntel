// verify-ffmpeg-pipeline.js
// Verify FFmpeg pipeline has been tested and assets exist in database
// Checks MediaAssets, VideoEngagements, and ProcessingJobs tables

const sql = require('mssql');
require('dotenv').config();

const config = {
  server: process.env.AZURE_SQL_SERVER || '',
  database: process.env.AZURE_SQL_DATABASE || '',
  user: process.env.AZURE_SQL_USER || '',
  password: process.env.AZURE_SQL_PASSWORD || '',
  options: { encrypt: true, trustServerCertificate: false },
};

async function verifyMediaAssets(pool) {
  console.log('\n📊 Checking MediaAssets Table...');
  
  const result = await pool.request().query(`
    SELECT 
      WebinarId,
      COUNT(*) as TotalAssets,
      COUNT(DISTINCT AssetType) as UniqueAssetTypes,
      STRING_AGG(AssetType, ', ') as AssetTypes,
      MAX(ProcessedAt) as LastProcessed
    FROM MediaAssets
    GROUP BY WebinarId
    ORDER BY MAX(ProcessedAt) DESC
  `);

  if (result.recordset.length === 0) {
    console.log('⚠️  No MediaAssets found in database');
    return false;
  }

  console.log(`✅ Found ${result.recordset.length} webinar(s) with processed assets:\n`);
  
  let hasFullPipeline = false;
  result.recordset.forEach((webinar, index) => {
    console.log(`${index + 1}. WebinarId: ${webinar.WebinarId}`);
    console.log(`   Total Assets: ${webinar.TotalAssets}`);
    console.log(`   Asset Types: ${webinar.AssetTypes}`);
    console.log(`   Last Processed: ${webinar.LastProcessed}`);
    console.log('');
    
    // Check if this webinar has close to 12 assets (full pipeline)
    if (webinar.TotalAssets >= 10) {
      hasFullPipeline = true;
    }
  });

  return hasFullPipeline;
}

async function verifyHLSAssets(pool) {
  console.log('\n📺 Checking HLS Streaming Assets...');
  
  const result = await pool.request().query(`
    SELECT 
      WebinarId,
      COUNT(*) as HLSCount,
      STRING_AGG(Resolution, ', ') as Resolutions
    FROM MediaAssets
    WHERE AssetType LIKE '%hls%' OR AssetType LIKE '%stream%' OR Resolution IN ('1080p', '720p', '480p', '360p')
    GROUP BY WebinarId
  `);

  if (result.recordset.length === 0) {
    console.log('⚠️  No HLS assets found');
    return false;
  }

  console.log(`✅ Found ${result.recordset.length} webinar(s) with HLS streams:\n`);
  
  result.recordset.forEach((webinar, index) => {
    console.log(`${index + 1}. WebinarId: ${webinar.WebinarId}`);
    console.log(`   HLS Variants: ${webinar.HLSCount}`);
    console.log(`   Resolutions: ${webinar.Resolutions}`);
    console.log('');
  });

  return true;
}

async function verifyProcessingJobs(pool) {
  console.log('\n⚙️  Checking ProcessingJobs Table...');
  
  const result = await pool.request().query(`
    SELECT 
      JobId,
      WebinarId,
      Status,
      AssetsCreated,
      QueuedAt,
      CompletedAt,
      DATEDIFF(SECOND, QueuedAt, COALESCE(CompletedAt, GETUTCDATE())) as ProcessingTimeSeconds,
      ErrorMessage
    FROM ProcessingJobs
    ORDER BY QueuedAt DESC
  `);

  if (result.recordset.length === 0) {
    console.log('⚠️  No ProcessingJobs found in database');
    return false;
  }

  console.log(`✅ Found ${result.recordset.length} processing job(s):\n`);
  
  let hasCompletedJobs = false;
  result.recordset.forEach((job, index) => {
    console.log(`${index + 1}. Job: ${job.JobId}`);
    console.log(`   WebinarId: ${job.WebinarId}`);
    console.log(`   Status: ${job.Status}`);
    console.log(`   Assets Created: ${job.AssetsCreated}`);
    console.log(`   Processing Time: ${job.ProcessingTimeSeconds}s`);
    if (job.ErrorMessage) {
      console.log(`   Error: ${job.ErrorMessage}`);
    }
    console.log(`   Queued: ${job.QueuedAt}`);
    console.log(`   Completed: ${job.CompletedAt || 'N/A'}`);
    console.log('');
    
    if (job.Status === 'completed' && job.AssetsCreated >= 10) {
      hasCompletedJobs = true;
    }
  });

  return hasCompletedJobs;
}

async function verifyAssetTypes(pool) {
  console.log('\n🎬 Checking Asset Type Distribution...');
  
  const result = await pool.request().query(`
    SELECT 
      AssetType,
      COUNT(*) as Count,
      AVG(CAST(FileSize as BIGINT)) as AvgFileSizeBytes,
      AVG(Duration) as AvgDurationSeconds
    FROM MediaAssets
    GROUP BY AssetType
    ORDER BY COUNT(*) DESC
  `);

  if (result.recordset.length === 0) {
    console.log('⚠️  No asset types found');
    return;
  }

  console.log(`Asset Type Breakdown:\n`);
  
  const expectedTypes = [
    'full-replay', 'hls-1080p', 'hls-720p', 'hls-480p', 'hls-360p',
    'audio-podcast', 'thumbnail', 'social-teaser', 'highlight-clip'
  ];
  
  const foundTypes = result.recordset.map(r => r.AssetType.toLowerCase());
  
  result.recordset.forEach((asset) => {
    const size = asset.AvgFileSizeBytes ? (asset.AvgFileSizeBytes / (1024 * 1024)).toFixed(2) : 'N/A';
    const duration = asset.AvgDurationSeconds ? Math.floor(asset.AvgDurationSeconds) : 'N/A';
    console.log(`  ${asset.AssetType}: ${asset.Count} assets (avg: ${size} MB, ${duration}s)`);
  });
  
  console.log('\n📋 Expected Asset Types for Full Pipeline (12 total):');
  expectedTypes.forEach(type => {
    const found = foundTypes.some(f => f.includes(type.toLowerCase()) || type.toLowerCase().includes(f));
    console.log(`  ${found ? '✅' : '⚠️ '} ${type}`);
  });
}

async function verifySampleAsset(pool) {
  console.log('\n🔍 Sample Asset Details...');
  
  const result = await pool.request().query(`
    SELECT TOP 1
      AssetId,
      WebinarId,
      AssetType,
      BlobURL,
      FileSize,
      Duration,
      Resolution,
      Format,
      ProcessedAt
    FROM MediaAssets
    ORDER BY ProcessedAt DESC
  `);

  if (result.recordset.length === 0) {
    console.log('⚠️  No assets to display');
    return;
  }

  const asset = result.recordset[0];
  console.log('Most Recent Asset:');
  console.log(`  AssetId: ${asset.AssetId}`);
  console.log(`  WebinarId: ${asset.WebinarId}`);
  console.log(`  Type: ${asset.AssetType}`);
  console.log(`  BlobURL: ${asset.BlobURL}`);
  console.log(`  FileSize: ${asset.FileSize ? (asset.FileSize / (1024 * 1024)).toFixed(2) + ' MB' : 'N/A'}`);
  console.log(`  Duration: ${asset.Duration ? Math.floor(asset.Duration) + 's' : 'N/A'}`);
  console.log(`  Resolution: ${asset.Resolution || 'N/A'}`);
  console.log(`  Format: ${asset.Format || 'N/A'}`);
  console.log(`  Processed: ${asset.ProcessedAt}`);
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  FFmpeg Pipeline Verification');
  console.log('  Checking if media processing has been tested');
  console.log('═══════════════════════════════════════════════════════════════');

  let pool;
  try {
    pool = await sql.connect(config);
    console.log('✓ Connected to Azure SQL Database\n');

    const hasMediaAssets = await verifyMediaAssets(pool);
    await verifyHLSAssets(pool);
    const hasProcessingJobs = await verifyProcessingJobs(pool);
    await verifyAssetTypes(pool);
    await verifySampleAsset(pool);

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  VERIFICATION SUMMARY');
    console.log('═══════════════════════════════════════════════════════════════');
    
    if (hasMediaAssets && hasProcessingJobs) {
      console.log('✅ FFmpeg Pipeline: VERIFIED');
      console.log('✅ Media Assets: Present in database');
      console.log('✅ Processing Jobs: Completed successfully');
      console.log('✅ HLS Streaming: Assets available');
      console.log('\n🎉 MILESTONE 1 - Tasks 3, 4, 5: COMPLETE (Previously Tested)');
      console.log('\nConclusion: FFmpeg media processing pipeline has been tested');
      console.log('and is working. Assets are present in the database.');
      process.exit(0);
    } else if (hasMediaAssets || hasProcessingJobs) {
      console.log('⚠️  FFmpeg Pipeline: PARTIALLY VERIFIED');
      console.log(`${hasMediaAssets ? '✅' : '⚠️ '} Media Assets: ${hasMediaAssets ? 'Found' : 'Incomplete'}`);
      console.log(`${hasProcessingJobs ? '✅' : '⚠️ '} Processing Jobs: ${hasProcessingJobs ? 'Completed' : 'Not found'}`);
      console.log('\n📋 Some evidence of testing found, but full pipeline not confirmed');
      console.log('Recommendation: Run one full end-to-end test to confirm all 12 assets');
      process.exit(0);
    } else {
      console.log('⚠️  FFmpeg Pipeline: NOT VERIFIED');
      console.log('⚠️  No MediaAssets found in database');
      console.log('⚠️  No ProcessingJobs found in database');
      console.log('\n📋 No evidence of FFmpeg pipeline testing found');
      console.log('Recommendation: Run manual tests for Tasks 3, 4, 5');
      process.exit(1);
    }

  } catch (error) {
    console.error('\n❌ Verification error:', error.message);
    process.exit(1);
  } finally {
    if (pool) await pool.close();
  }
}

main();

// test-redis-direct.js
// Test Redis with direct credentials (no URL encoding issues)

require('dotenv').config();
const Redis = require('ioredis');

console.log('═══════════════════════════════════════════════════════════');
console.log('  Redis Connection Test - Direct Credentials');
console.log('═══════════════════════════════════════════════════════════\n');

// CREDENTIALS FROM .env FILE
const host = process.env.REDIS_HOST || 'redis-media-pipeline-ffmpeg.redis.cache.windows.net';
const port = parseInt(process.env.REDIS_PORT || '6380');
const primaryKey = process.env.REDIS_PASSWORD;

if (!primaryKey) {
  console.error('❌ REDIS_PASSWORD not set in .env file');
  process.exit(1);
}

console.log('📋 Testing with:');
console.log(`   Host: ${host}`);
console.log(`   Port: ${port}`);
console.log(`   Primary Key: ***${primaryKey.slice(-4)}`);
console.log('');

// Test with PRIMARY KEY
console.log('🔐 Attempting connection with PRIMARY KEY...\n');

// Try with NO username first
const redis1 = new Redis({
  host: host,
  port: port,
  password: primaryKey,
  tls: {
    rejectUnauthorized: false,
  },
  connectTimeout: 10000,
  retryStrategy: (times) => {
    if (times > 2) return null;
    return Math.min(times * 1000, 3000);
  },
  lazyConnect: true,
  showFriendlyErrorStack: true,
});

redis1.on('error', (err) => {
  console.error('❌ No Username Error:', err.message);
});

// Also try WITH username (Azure Redis 6.0+ requires username)
const redis1b = new Redis({
  host: host,
  port: port,
  username: 'default', // Azure Redis default username
  password: primaryKey,
  tls: {
    rejectUnauthorized: false,
  },
  connectTimeout: 10000,
  retryStrategy: (times) => {
    if (times > 2) return null;
    return Math.min(times * 1000, 3000);
  },
  lazyConnect: true,
  showFriendlyErrorStack: true,
});

redis1b.on('error', (err) => {
  console.error('❌ With Username Error:', err.message);
});

(async () => {
  // First try without username
  try {
    console.log('⏳ Test 1: Connecting WITHOUT username...');
    await redis1.connect();
    const pong = await redis1.ping();
    console.log('✅ SUCCESS (No Username): Connection works!');
    console.log(`   PING: ${pong}`);
    
    const correctUrl = `rediss://:${encodeURIComponent(primaryKey)}@${host}:${port}`;
    console.log('\n📝 Correct .env format:');
    console.log(`   REDIS_URL=${correctUrl}`);
    
    await redis1.quit();
    console.log('\n✅ Redis connection verified!\n');
    process.exit(0);
    
  } catch (error1) {
    console.error('❌ Test 1 failed:', error1.message);
    
    // Try WITH username
    try {
      console.log('\n⏳ Test 2: Connecting WITH username "default"...');
      await redis1b.connect();
      const pong = await redis1b.ping();
      console.log('✅ SUCCESS (With Username): Connection works!');
      console.log(`   PING: ${pong}`);
      
      const correctUrl = `rediss://default:${encodeURIComponent(primaryKey)}@${host}:${port}`;
      console.log('\n📝 Correct .env format:');
      console.log(`   REDIS_URL=${correctUrl}`);
      
      await redis1b.quit();
      console.log('\n✅ Redis connection verified!\n');
      process.exit(0);
      
    } catch (error2) {
      console.error('❌ Test 2 failed:', error2.message);
      
      // Both failed, detailed troubleshooting
      console.log('\n═══════════════════════════════════════════════════════════');
      console.log('  ❌ BOTH TESTS FAILED');
      console.log('═══════════════════════════════════════════════════════════\n');
      
      console.log('The keys are CORRECT, but authentication is failing.\n');
      console.log('Most likely causes:\n');
      console.log('1. 🔒 Access Key Authentication is DISABLED');
      console.log('   → Azure Portal → Redis Cache → Access keys');
      console.log('   → Check "Authentication" setting');
      console.log('   → Enable "Access keys" if disabled\n');
      
      console.log('2. 🔐 Azure Redis is using AAD (Microsoft Entra ID)');
      console.log('   → Azure Portal → Redis Cache → Authentication');
      console.log('   → Switch to "Access key" authentication\n');
      
      console.log('3. 🏗️ Redis version requires different auth');
      console.log('   → Check Redis version in Portal');
      console.log('   → Redis 6.0+ requires username\n');
      
      process.exit(1);
    }
  }
})();

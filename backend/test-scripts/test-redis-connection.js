// test-redis-connection.js
// Diagnose Redis connection issues

require('dotenv').config();
const Redis = require('ioredis');

console.log('═══════════════════════════════════════════════════════════');
console.log('  Azure Redis Connection Diagnostics');
console.log('═══════════════════════════════════════════════════════════\n');

const redisUrl = process.env.REDIS_URL;

if (!redisUrl) {
  console.error('❌ REDIS_URL not found in .env file');
  process.exit(1);
}

console.log('📋 Connection Details:');
console.log(`   URL: ${redisUrl.replace(/\/\/.*@/, '//***:***@')}`);

// Parse URL to show details
try {
  const url = new URL(redisUrl);
  console.log(`   Protocol: ${url.protocol}`);
  console.log(`   Host: ${url.hostname}`);
  console.log(`   Port: ${url.port}`);
  console.log(`   Password: ${url.password ? '***' + url.password.slice(-4) : 'none'}`);
} catch (e) {
  console.error('❌ Invalid URL format:', e.message);
}

console.log('\n🔌 Attempting connection...\n');

const redis = new Redis(redisUrl, {
  connectTimeout: 10000,
  retryStrategy: (times) => {
    console.log(`   Retry attempt ${times}/3...`);
    if (times > 3) return null;
    return Math.min(times * 1000, 3000);
  },
  lazyConnect: true,
  tls: {
    rejectUnauthorized: false, // Azure Redis requires this
  },
  enableReadyCheck: true,
  showFriendlyErrorStack: true,
});

redis.on('connect', () => {
  console.log('✅ TCP connection established');
});

redis.on('ready', () => {
  console.log('✅ Redis is ready');
});

redis.on('error', (err) => {
  console.error('❌ Redis error:', err.message);
  if (err.message.includes('ENOTFOUND')) {
    console.log('\n💡 DNS resolution failed. Possible causes:');
    console.log('   - Host name is incorrect');
    console.log('   - Internet connection issue');
    console.log('   - Azure Redis instance does not exist');
  }
  if (err.message.includes('ETIMEDOUT') || err.message.includes('ECONNREFUSED')) {
    console.log('\n💡 Connection timeout/refused. Possible causes:');
    console.log('   - Azure Redis is stopped or deallocated');
    console.log('   - Firewall blocking port 6380');
    console.log('   - Your IP not whitelisted in Azure Redis firewall rules');
  }
  if (err.message.includes('WRONGPASS') || err.message.includes('NOAUTH')) {
    console.log('\n💡 Authentication failed. Possible causes:');
    console.log('   - Access key is incorrect or regenerated');
    console.log('   - Check Azure Portal for current access key');
  }
});

redis.on('close', () => {
  console.log('🔌 Connection closed');
});

redis.on('reconnecting', () => {
  console.log('🔄 Reconnecting...');
});

// Test connection and commands
(async () => {
  try {
    console.log('⏳ Connecting to Redis...');
    await redis.connect();
    
    console.log('\n✅ Connection successful!\n');
    console.log('📊 Testing Redis commands...');
    
    // Test PING
    const pong = await redis.ping();
    console.log(`   PING: ${pong}`);
    
    // Test INFO
    const info = await redis.info('server');
    const version = info.match(/redis_version:([^\r\n]+)/)?.[1];
    console.log(`   Redis version: ${version || 'unknown'}`);
    
    // Test SET/GET
    await redis.set('test:connection', Date.now().toString(), 'EX', 10);
    const value = await redis.get('test:connection');
    console.log(`   SET/GET: ${value ? '✅ Working' : '❌ Failed'}`);
    
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('  ✅ Redis Connection: SUCCESSFUL');
    console.log('═══════════════════════════════════════════════════════════\n');
    
    await redis.quit();
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ Connection failed:', error.message);
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('  ❌ Redis Connection: FAILED');
    console.log('═══════════════════════════════════════════════════════════\n');
    
    console.log('🔧 Troubleshooting Steps:\n');
    console.log('1. Check Azure Redis Status:');
    console.log('   - Azure Portal → Redis Cache → "redis-media-pipeline-ffmpeg"');
    console.log('   - Verify Status = "Running" (not Stopped/Deallocated)');
    console.log('   - Check "Overview" page for connection issues\n');
    
    console.log('2. Verify Access Keys:');
    console.log('   - Azure Portal → Redis Cache → Settings → Access keys');
    console.log('   - Copy "Primary connection string (StackExchange.Redis)"');
    console.log('   - Update REDIS_URL in .env file\n');
    
    console.log('3. Check Firewall Rules:');
    console.log('   - Azure Portal → Redis Cache → Settings → Firewall');
    console.log('   - Add your public IP address');
    console.log('   - Or enable "Allow access from Azure services"\n');
    
    console.log('4. Test with Azure CLI:');
    console.log('   az redis show --name redis-media-pipeline-ffmpeg --resource-group <your-rg>');
    console.log('   az redis list-keys --name redis-media-pipeline-ffmpeg --resource-group <your-rg>\n');
    
    console.log('5. Verify Network Connectivity:');
    console.log('   ping redis-media-pipeline-ffmpeg.redis.cache.windows.net');
    console.log('   telnet redis-media-pipeline-ffmpeg.redis.cache.windows.net 6380\n');
    
    await redis.disconnect();
    process.exit(1);
  }
})();

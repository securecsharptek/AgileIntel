// Quick check to verify ProcessingJobs table schema
require('dotenv').config();
const sql = require('mssql');

async function checkSchema() {
  try {
    const pool = await sql.connect({
      server: process.env.AZURE_SQL_SERVER,
      database: process.env.AZURE_SQL_DATABASE,
      user: process.env.AZURE_SQL_USER,
      password: process.env.AZURE_SQL_PASSWORD,
      options: { encrypt: true, trustServerCertificate: false },
    });

    console.log('✅ Database connected\n');

    // Check if table exists
    const tableCheck = await pool.request().query(`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_NAME = 'ProcessingJobs'
    `);

    if (tableCheck.recordset.length === 0) {
      console.log('❌ ProcessingJobs table does NOT exist');
      console.log('Run migration: node run-migrations.js');
      process.exit(1);
    }

    console.log('✅ ProcessingJobs table exists\n');

    // Check columns
    const columns = await pool.request().query(`
      SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, CHARACTER_MAXIMUM_LENGTH
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'ProcessingJobs'
      ORDER BY ORDINAL_POSITION
    `);

    console.log('Table columns:');
    columns.recordset.forEach(col => {
      console.log(`  - ${col.COLUMN_NAME} (${col.DATA_TYPE}${col.CHARACTER_MAXIMUM_LENGTH ? '(' + col.CHARACTER_MAXIMUM_LENGTH + ')' : ''}) ${col.IS_NULLABLE === 'NO' ? 'NOT NULL' : 'NULL'}`);
    });

    const hasSourceBlob = columns.recordset.some(c => c.COLUMN_NAME === 'SourceBlob');
    
    if (hasSourceBlob) {
      console.log('\n✅ SourceBlob column exists');
    } else {
      console.log('\n❌ SourceBlob column MISSING - migration needed!');
      console.log('Run: node run-migrations.js');
    }

    await pool.close();
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkSchema();

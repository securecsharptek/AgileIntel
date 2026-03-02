const sql = require("mssql");
const config = {
  server: process.env.AZURE_SQL_SERVER,
  database: process.env.AZURE_SQL_DATABASE,
  user: process.env.AZURE_SQL_USER,
  password: process.env.AZURE_SQL_PASSWORD,
  options: {
    encrypt: true,
    trustServerCertificate: false
  }
};
async function testConnection() {
  try {
    await sql.connect(config);
    console.log("✅ Connected to Azure SQL successfully!");
    process.exit(0);
  } catch (err) {
    console.error("❌ Connection failed:", err);
    process.exit(1);
  }
}
testConnection();

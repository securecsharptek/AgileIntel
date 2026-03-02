const sql = require("mssql");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

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

async function runMigrations() {
    let pool;
    try {
        pool = await sql.connect(config);
        console.log("✅ Connected to Azure SQL successfully!");

        const migrationsDir = path.join(__dirname, "../database/migrations");
        const migrationFiles = [
            "002_supademo_integration.sql",
            "003_ffmpeg_media_pipeline.sql",
            "004_copilot_automation.sql"
        ];

        for (const file of migrationFiles) {
            console.log(`\n⏳ Running migration: ${file}...`);
            const filePath = path.join(migrationsDir, file);
            const sqlQuery = fs.readFileSync(filePath, "utf-8");

            // Attempting to split by GO because mssql package chokes on multiple statements separated by GO.
            // SQL Server scripts often use GO, which is a SSMS batch separator, not a SQL command.
            const statements = sqlQuery.split(/\n\s*GO\s*\n/i).map(s => s.trim()).filter(s => s.length > 0);

            for (const statement of statements) {
                if (!statement) continue;
                await pool.request().query(statement);
            }
            console.log(`✅ Success: ${file}`);
        }

        console.log("\n🎉 All database migrations applied successfully!");
        process.exit(0);
    } catch (err) {
        console.error("\n❌ Database migration failed:");
        console.error(err);
        process.exit(1);
    } finally {
        if (pool) {
            pool.close();
        }
    }
}

runMigrations();

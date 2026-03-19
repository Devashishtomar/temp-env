require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function migrateAddPassword() {
  const client = await pool.connect();
  
  try {
    console.log('🔍 Checking if password column exists...');
    
    // Check if password column exists
    const checkResult = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users' AND column_name = 'password'
    `);
    
    if (checkResult.rows.length > 0) {
      console.log('✅ Password column already exists in users table');
      return;
    }
    
    console.log('📝 Adding password column to users table...');
    
    // Add password column if it doesn't exist
    await client.query(`
      ALTER TABLE users ADD COLUMN password VARCHAR(255)
    `);
    
    console.log('✅ Password column added successfully!');
    console.log('✅ Migration complete');
  } catch (error) {
    console.error('❌ Error adding password column:', error.message);
    console.error('Full error:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run if called directly
if (require.main === module) {
  if (!process.env.DATABASE_URL) {
    console.error('❌ Error: DATABASE_URL environment variable is not set');
    console.error('Please set DATABASE_URL in your .env.local file');
    process.exit(1);
  }
  
  migrateAddPassword()
    .then(() => {
      console.log('Migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

module.exports = { migrateAddPassword };



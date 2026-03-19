// Load environment variables from .env.local if it exists
try {
  require('dotenv').config({ path: '.env.local' });
} catch (e) {
  // dotenv not available or .env.local doesn't exist, continue
}

const { Pool } = require('pg');

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function addPasswordColumn() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is not set. Please set it in .env.local or as an environment variable.');
  }

  const client = await pool.connect();
  
  try {
    console.log('🔍 Checking users table structure...');
    
    // First, check if users table exists
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'users'
      )
    `);
    
    if (!tableCheck.rows[0].exists) {
      console.log('❌ Users table does not exist. Please run init-db.js first.');
      throw new Error('Users table does not exist');
    }
    
    // Check if password column exists
    const checkResult = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users' AND column_name = 'password'
    `);
    
    if (checkResult.rows.length > 0) {
      console.log('✅ Password column already exists in users table');
      return { success: true, message: 'Password column already exists' };
    }
    
    console.log('📝 Adding password column to users table...');
    
    // Add password column if it doesn't exist
    await client.query(`
      ALTER TABLE users ADD COLUMN password VARCHAR(255)
    `);
    
    console.log('✅ Password column added successfully!');
    return { success: true, message: 'Password column added successfully' };
  } catch (error) {
    console.error('❌ Error adding password column:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run if called directly
if (require.main === module) {
  addPasswordColumn()
    .then((result) => {
      console.log('✅ Migration complete:', result.message);
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Migration failed:', error.message);
      console.error('\nPlease ensure:');
      console.error('1. DATABASE_URL is set in .env.local or as an environment variable');
      console.error('2. The database connection is valid');
      console.error('3. The users table exists (run init-db.js if needed)');
      process.exit(1);
    });
}

module.exports = { addPasswordColumn };


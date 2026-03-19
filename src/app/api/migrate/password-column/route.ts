import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export async function POST(request: NextRequest) {
  // Optional: Add authentication check here if needed
  // const session = await getServerSession(authOptions);
  // if (!session) {
  //   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // }

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
      return NextResponse.json({
        success: true,
        message: 'Password column already exists',
        alreadyExists: true
      });
    }
    
    console.log('📝 Adding password column to users table...');
    
    // Add password column if it doesn't exist
    await client.query(`
      ALTER TABLE users ADD COLUMN password VARCHAR(255)
    `);
    
    console.log('✅ Password column added successfully!');
    
    return NextResponse.json({
      success: true,
      message: 'Password column added successfully',
      alreadyExists: false
    });
  } catch (error: any) {
    console.error('❌ Error adding password column:', error);
    return NextResponse.json(
      { 
        success: false,
        error: error.message || 'Failed to add password column',
        details: error.detail || null
      },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}



import { Pool } from 'pg';

// Database connection pool
const dbUrl = process.env.DATABASE_URL || '';
const config: any = {
  connectionString: dbUrl,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
};

// If connectionString parsing fails because of the '@' symbols in the password, let's explicitly pass parameters
if (dbUrl.includes('@') && dbUrl.startsWith('postgresql://')) {
  try {
    const parsed = new URL(dbUrl);
    // Explicitly rebuild config ignoring the connection string to handle special char passwords properly
    config.user = decodeURIComponent(parsed.username);
    config.password = decodeURIComponent(parsed.password);
    config.host = parsed.hostname;
    config.port = parsed.port ? parseInt(parsed.port, 10) : 5432;
    config.database = parsed.pathname.slice(1); // remove leading slash
    delete config.connectionString;
  } catch (e) {
    console.error('Failed to parse DATABASE_URL manually, falling back to connectionString', e);
  }
}

const pool = new Pool(config);

// Initialize database tables
export async function initDatabase() {
  const client = await pool.connect();

  try {
    // Create users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255),
        password VARCHAR(255),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Create projects table
    await client.query(`
      CREATE TABLE IF NOT EXISTS projects (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(255),
        source_url VARCHAR(500),
        source_type VARCHAR(50),
        thumbnail_path VARCHAR(500),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Create clips table
    await client.query(`
      CREATE TABLE IF NOT EXISTS clips (
        id SERIAL PRIMARY KEY,
        project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
        filename VARCHAR(255),
        file_path VARCHAR(500),
        start_time DECIMAL(10,2),
        end_time DECIMAL(10,2),
        title VARCHAR(255),
        description TEXT,
        thumbnail_path VARCHAR(500),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Create originals table
    await client.query(`
      CREATE TABLE IF NOT EXISTS originals (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(255),
        file_path VARCHAR(500),
        youtube_url VARCHAR(500),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    console.log('Database tables initialized successfully');
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Database utility functions
export async function getUserByEmail(email: string) {
  const client = await pool.connect();
  try {
    const result = await client.query('SELECT * FROM users WHERE email = $1', [email]);
    return result.rows[0];
  } finally {
    client.release();
  }
}

export async function createUser(email: string, name: string) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'INSERT INTO users (email, name) VALUES ($1, $2) RETURNING *',
      [email, name]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

export async function getOrCreateUser(email: string, name: string) {
  let user = await getUserByEmail(email);
  if (!user) {
    user = await createUser(email, name);
  }
  return user;
}

export async function createProject(userId: number, title: string, sourceUrl: string, sourceType: string, thumbnailPath?: string) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'INSERT INTO projects (user_id, title, source_url, source_type, thumbnail_path) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [userId, title, sourceUrl, sourceType, thumbnailPath]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

export async function createClip(projectId: number, filename: string, filePath: string, startTime: number, endTime: number, title: string, description: string, thumbnailPath?: string) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'INSERT INTO clips (project_id, filename, file_path, start_time, end_time, title, description, thumbnail_path) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
      [projectId, filename, filePath, startTime, endTime, title, description, thumbnailPath]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

export async function getUserProjects(userId: number) {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT p.*, 
             COUNT(c.id) as clip_count,
             MAX(c.created_at) as last_clip_created
      FROM projects p 
      LEFT JOIN clips c ON p.id = c.project_id 
      WHERE p.user_id = $1 
      GROUP BY p.id 
      ORDER BY p.created_at DESC
    `, [userId]);
    return result.rows;
  } finally {
    client.release();
  }
}

export async function getProjectClips(projectId: number) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT * FROM clips WHERE project_id = $1 ORDER BY start_time ASC',
      [projectId]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

export async function getUserClipCount(userId: number) {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT COUNT(c.id) as total_clips
      FROM projects p 
      JOIN clips c ON p.id = c.project_id 
      WHERE p.user_id = $1
    `, [userId]);
    return result.rows[0].total_clips;
  } finally {
    client.release();
  }
}

export async function getProjectById(projectId: number) {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT * FROM projects WHERE id = $1
    `, [projectId]);
    return result.rows[0];
  } finally {
    client.release();
  }
}

export async function getClipById(clipId: number) {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT c.*, p.user_id 
      FROM clips c 
      JOIN projects p ON c.project_id = p.id 
      WHERE c.id = $1
    `, [clipId]);
    return result.rows[0];
  } finally {
    client.release();
  }
}

export async function updateClipFilePath(clipId: number, newFilePath: string, newFilename?: string) {
  const client = await pool.connect();
  try {
    if (newFilename) {
      const result = await client.query(
        'UPDATE clips SET file_path = $1, filename = $2 WHERE id = $3 RETURNING *',
        [newFilePath, newFilename, clipId]
      );
      return result.rows[0];
    } else {
      const result = await client.query(
        'UPDATE clips SET file_path = $1 WHERE id = $2 RETURNING *',
        [newFilePath, clipId]
      );
      return result.rows[0];
    }
  } finally {
    client.release();
  }
}

export async function createOriginal(userId: number, title: string, filePath: string, youtubeUrl?: string) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'INSERT INTO originals (user_id, title, file_path, youtube_url) VALUES ($1, $2, $3, $4) RETURNING *',
      [userId, title, filePath, youtubeUrl]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

export async function getUserOriginals(email: string) {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT o.* 
      FROM originals o 
      JOIN users u ON o.user_id = u.id 
      WHERE u.email = $1 
      ORDER BY o.created_at DESC
    `, [email]);
    return result.rows;
  } finally {
    client.release();
  }
}

export async function getOriginalById(originalId: number) {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT o.*, u.email 
      FROM originals o 
      JOIN users u ON o.user_id = u.id 
      WHERE o.id = $1
    `, [originalId]);
    return result.rows[0];
  } finally {
    client.release();
  }
}

export { pool };

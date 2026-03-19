import { NextRequest, NextResponse } from 'next/server';
import { resolve } from 'path';
import { readFile } from 'fs/promises';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');
    if (!sessionId) {
      return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });
    }
    const progressPath = resolve(process.cwd(), 'uploads', sessionId, 'progress.json');
    let progress = { percent: 0, message: 'Starting...', updated: Date.now() };
    try {
      const data = await readFile(progressPath, 'utf-8');
      progress = JSON.parse(data);
    } catch (err) {
      // If file not found, just return default progress
    }
    return NextResponse.json(progress);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to get progress' }, { status: 500 });
  }
} 
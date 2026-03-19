import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getUserByEmail, getUserProjects, getProjectClips } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user from database
    const user = await getUserByEmail(session.user.email);
    
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Get user projects with clips
    const projects = await getUserProjects(user.id);
    
    // Get clips for each project
    const projectsWithClips = await Promise.all(
      projects.map(async (project) => {
        const clips = await getProjectClips(project.id);
        return {
          ...project,
          clips
        };
      })
    );

    return NextResponse.json(projectsWithClips);

  } catch (error) {
    console.error('Error fetching user projects:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}


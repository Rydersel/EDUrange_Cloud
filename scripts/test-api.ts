import { getServerSession } from 'next-auth';
import { authOptions } from '../dashboard/lib/auth';

async function testEndpoints() {
  // Get a valid session
  const session = await getServerSession(authOptions);
  
  if (!session) {
    console.error('No session available. Please ensure you are logged in.');
    return;
  }

  // Test challenges endpoint
  try {
    const challengesResponse = await fetch('http://localhost:3000/api/challenges', {
      headers: {
        Cookie: `next-auth.session-token=${session.user.id}`,
      },
    });
    console.log('Challenges response:', await challengesResponse.json());
  } catch (error) {
    console.error('Error testing challenges endpoint:', error);
  }

  // Test instructors endpoint
  try {
    const instructorsResponse = await fetch('http://localhost:3000/api/instructors', {
      headers: {
        Cookie: `next-auth.session-token=${session.user.id}`,
      },
    });
    console.log('Instructors response:', await instructorsResponse.json());
  } catch (error) {
    console.error('Error testing instructors endpoint:', error);
  }

  // Test creating a competition group
  try {
    const createGroupResponse = await fetch('http://localhost:3000/api/competition-groups', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `next-auth.session-token=${session.user.id}`,
      },
      body: JSON.stringify({
        name: 'Test Competition',
        description: 'Test Description',
        startDate: new Date().toISOString(),
        endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        challengeIds: [],
        instructorIds: [],
        generateAccessCode: true,
      }),
    });
    console.log('Create group response:', await createGroupResponse.json());
  } catch (error) {
    console.error('Error testing create group endpoint:', error);
  }
}

testEndpoints().catch(console.error); 
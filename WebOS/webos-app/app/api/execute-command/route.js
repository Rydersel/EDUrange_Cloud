import { NextResponse } from 'next/server';

export async function POST(req) {
  try {
    const body = await req.json();
    const { command } = body;

    const response = await fetch('http://localhost:5000/execute', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ command }),
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to execute command', details: error.message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Method Not Allowed', details: 'Use POST to execute commands' }, { status: 405 });
}

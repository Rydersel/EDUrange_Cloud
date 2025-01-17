
// We don't use this anymore (since we switched to websockets, but im gonna keep it because it is useful for debugging use

import { NextResponse } from 'next/server';

export async function POST(req) {
  try {
    const body = await req.json();
    const { command } = body;

    console.log('Sending command to bridge:', command);

    const response = await fetch('http://127.0.0.1:5000/execute', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ command }),
    });

    console.log('Bridge response status:', response.status);

    if (!response.ok) {
      console.log('Bridge response text:', await response.text());
    }

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Failed to execute command:', error);
    return NextResponse.json({ error: 'Failed to execute command', details: error.message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Method Not Allowed', details: 'Use POST to execute commands' }, { status: 405 });
}

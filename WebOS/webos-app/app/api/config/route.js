import { NextResponse } from 'next/server';

export async function GET(req) {
  try {
    const response = await fetch('http://localhost:5000/config', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch config from bridge');
    }

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch config', details: error.message }, { status: 500 });
  }
}

export async function POST() {
  return NextResponse.json({ error: 'Method Not Allowed', details: 'Use GET to fetch config' }, { status: 405 });
}

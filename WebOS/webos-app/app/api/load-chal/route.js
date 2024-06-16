import { NextResponse } from 'next/server';
import { env } from 'process';

export async function POST(req) {
  const body = await req.json();
  const { ip } = body;

  if (!ip) {
    return NextResponse.json({ error: 'IP is required' }, { status: 400 });
  }

  env.IP = ip;

  return NextResponse.json({ message: `IP set to ${ip}` }, { status: 200 });
}

export async function GET() {
  const ip = env.IP;

  if (!ip) {
    return NextResponse.json({ error: 'IP not set' }, { status: 404 });
  }
  else {
    console.log(ip);
    return NextResponse.json({ ip }, { status: 200 });

  }

}

// Example curl commands
// Set IP: curl -X POST http://localhost:3000/api/load-chal -H "Content-Type: application/json" -d '{"ip": "192.168.1.1"}'
// Get IP: curl http://localhost:3000/api/load-chal
//  curl -X POST http://34.168.194.207/api/load-chal -H "Content-Type: application/json" -d '{"ip": "http://34.145.93.234/execute"}'


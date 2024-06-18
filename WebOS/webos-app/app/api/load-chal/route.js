import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const ipFilePath = path.resolve(process.cwd(), 'tmp/ip.txt');

export async function POST(req) {
  try {
    const body = await req.json();
    const { ip } = body;

    if (!ip) {
      return NextResponse.json({ error: 'IP is required' }, { status: 400 });
    }

    fs.writeFileSync(ipFilePath, ip, 'utf8');
    console.log(`IP set to: ${ip}`);

    return NextResponse.json({ message: `IP set to ${ip}` }, { status: 200 });
  } catch (error) {
    console.error('Error setting IP:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function GET() {
  try {
    if (!fs.existsSync(ipFilePath)) {
      return NextResponse.json({ error: 'IP not set' }, { status: 404 });
    }

    const ip = fs.readFileSync(ipFilePath, 'utf8');
    console.log(`Fetched IP: ${ip}`);

    return NextResponse.json({ ip }, { status: 200 });
  } catch (error) {
    console.error('Error fetching IP:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

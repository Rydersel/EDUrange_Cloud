// app/api/files/route.js

// Experimental code for persistant local file storage

import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const rootDir = path.join(process.cwd(), 'files'); // Ensure this folder exists

// Ensure the directory exists
if (!fs.existsSync(rootDir)) {
    fs.mkdirSync(rootDir, { recursive: true });
}

export async function GET(req) {
    const { searchParams } = new URL(req.url);
    const filePath = searchParams.get('filePath');

    if (!filePath) {
        return NextResponse.json({ error: 'filePath is required' }, { status: 400 });
    }

    const fullPath = path.join(rootDir, filePath);

    if (!fs.existsSync(fullPath)) {
        return NextResponse.json({ error: 'File or directory not found' }, { status: 404 });
    }

    const stats = fs.statSync(fullPath);
    if (stats.isDirectory()) {
        const files = fs.readdirSync(fullPath).map(name => {
            const fileStats = fs.statSync(path.join(fullPath, name));
            return {
                name,
                type: fileStats.isDirectory() ? 'directory' : 'file'
            };
        });
        return NextResponse.json(files, { status: 200 });
    } else {
        const content = fs.readFileSync(fullPath, 'utf8');
        return NextResponse.json({ content }, { status: 200 });
    }
}

export async function POST(req) {
    const body = await req.json();
    const { filePath, content, type } = body;

    if (!filePath) {
        return NextResponse.json({ error: 'filePath is required' }, { status: 400 });
    }

    const fullPath = path.join(rootDir, filePath);

    if (type === 'directory') {
        if (!fs.existsSync(fullPath)) {
            fs.mkdirSync(fullPath, { recursive: true });
        }
    } else {
        const dir = path.dirname(fullPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(fullPath, content, 'utf8');
    }

    return NextResponse.json({ message: 'Item saved successfully' }, { status: 200 });
}

export async function DELETE(req) {
    const body = await req.json();
    const { filePath } = body;

    if (!filePath) {
        return NextResponse.json({ error: 'filePath is required' }, { status: 400 });
    }

    const fullPath = path.join(rootDir, filePath);

    if (!fs.existsSync(fullPath)) {
        return NextResponse.json({ error: 'File or directory not found' }, { status: 404 });
    }

    const stats = fs.statSync(fullPath);
    if (stats.isDirectory()) {
        fs.rmdirSync(fullPath, { recursive: true });
    } else {
        fs.unlinkSync(fullPath);
    }

    return NextResponse.json({ message: 'Item deleted successfully' }, { status: 200 });
}

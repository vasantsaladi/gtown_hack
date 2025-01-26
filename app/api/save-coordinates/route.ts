import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

export async function POST(request: Request) {
  try {
    const { coordinates } = await request.json();
    
    // Read existing file
    const filePath = path.join(process.cwd(), 'public/data/blank.geojson');
    const fileContent = await fs.readFile(filePath, 'utf-8');
    const data = JSON.parse(fileContent);
    
    // Add new coordinates to features array
    data.features.push({
      coordinates: coordinates
    });
    
    // Write back to file
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error saving coordinates:', error);
    return NextResponse.json({ error: 'Failed to save coordinates' }, { status: 500 });
  }
} 
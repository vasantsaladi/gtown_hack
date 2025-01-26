import { NextResponse } from 'next/server';
import { MongoClient } from 'mongodb';

if (!process.env.MONGODB_URI) {
  throw new Error('Please add your Mongo URI to .env.local');
}

export async function POST(request: Request) {
  let client;
  try {
    const { coordinates } = await request.json();
    //console.log('Received coordinates:', coordinates);
    
    // Connect to MongoDB with correct database name
    client = await MongoClient.connect(process.env.MONGODB_URI as string);
    //console.log('Connected to MongoDB');
    
    const db = client.db('GTownHackDB');
    //console.log('Accessed database');
    
    // Insert into correct collection
    await db.collection('Stores').insertOne({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [coordinates[1], coordinates[0]]
      },
      properties: {
        PRESENT24: "Yes",
        STORENAME: "New Store",
        ADDRESS: "Added via Drag & Drop",
        ZIPCODE: 20001,
        created_at: new Date()
      }
    });

    //console.log('MongoDB insert result:', result);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Detailed error:', error);
    return NextResponse.json({ 
      error: 'Failed to save coordinates',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  } finally {
    if (client) {
      await client?.close();
      //console.log('MongoDB connection closed');
    }
  }
} 
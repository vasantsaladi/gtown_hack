import { NextResponse } from 'next/server';
import { MongoClient } from 'mongodb';

if (!process.env.MONGODB_URI) {
  throw new Error('Please add your Mongo URI to .env.local');
}

export async function GET() {
  let client;
  try {
    client = await MongoClient.connect(process.env.MONGODB_URI as string);
    const db = client.db('GTownHackDB');
    
    const stores = await db.collection('Stores').find({}).toArray();
    return NextResponse.json(stores);
  } catch (error) {
    console.error('Error fetching stores:', error);
    return NextResponse.json({ 
      error: 'Failed to fetch stores',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  } finally {
    if (client) {
      await client?.close();
    }
  }
}
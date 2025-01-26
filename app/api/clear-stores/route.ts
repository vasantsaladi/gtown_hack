import { NextResponse } from 'next/server';
import { MongoClient } from 'mongodb';

if (!process.env.MONGODB_URI) {
  throw new Error('Please add your Mongo URI to .env.local');
}

export async function POST() {
  let client;
  try {
    client = await MongoClient.connect(process.env.MONGODB_URI as string);
    const db = client.db('GTownHackDB');
    
    // Delete all documents from the Stores collection
    await db.collection('Stores').deleteMany({});
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error clearing stores:', error);
    return NextResponse.json({ 
      error: 'Failed to clear stores',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  } finally {
    if (client) {
      await client?.close();
    }
  }
}
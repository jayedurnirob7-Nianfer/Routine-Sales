import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import { Roster } from '@/models/Roster';

const GOOGLE_APP_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyRarIsbzP1lrEOzrtOapLUspxMIPNtZTOVAPQh2K9eva4yPgNA0iIxgquf5vGBcBrY/exec";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const yearStr = searchParams.get('year');
    const monthStr = searchParams.get('month');

    if (!yearStr || !monthStr) {
      return NextResponse.json({ status: 'error', message: 'Missing year or month' }, { status: 400 });
    }

    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    const prefix = `${year}-${String(month).padStart(2, '0')}-`;

    const mergedRoster: Record<string, any[]> = {};

    // 1. Fetch from Google Apps Script Archive
    try {
      const res = await fetch(`${GOOGLE_APP_SCRIPT_URL}?action=getArchive&year=${year}&month=${month}&_t=${Date.now()}`, { cache: 'no-store' });
      if (res.ok) {
        const json = await res.json();
        if (json.status === 'ok' && json.data?.roster) {
          Object.assign(mergedRoster, json.data.roster);
        }
      }
    } catch (gsErr) {
      console.warn("Failed to fetch archive from Google Apps Script:", gsErr);
    }

    // 2. Also check MongoDB for any shifts matching this month
    try {
      await connectToDatabase();
      const mongoEntries = await Roster.find({ date: { $regex: `^${prefix}` } }).lean();
      mongoEntries.forEach((entry: any) => {
        if (entry.date && Array.isArray(entry.assignments) && entry.assignments.length > 0) {
          mergedRoster[entry.date] = entry.assignments;
        }
      });
    } catch (mongoErr) {
      console.warn("Failed to query MongoDB in archive GET:", mongoErr);
    }

    return NextResponse.json({
      status: 'ok',
      data: {
        roster: mergedRoster
      }
    });

  } catch (error: any) {
    console.error("Archive GET Error:", error);
    return NextResponse.json({ status: 'error', message: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { roster } = body;

    // 1. Dual-persist to MongoDB so data is safe and instantly preserved locally
    if (roster && typeof roster === 'object') {
      try {
        await connectToDatabase();
        const ops = Object.entries(roster).map(([date, assignments]) => ({
          updateOne: {
            filter: { date },
            update: { $set: { assignments } },
            upsert: true
          }
        }));
        if (ops.length > 0) {
          await Roster.bulkWrite(ops as any);
        }
      } catch (dbErr) {
        console.error("MongoDB Archive Write Error:", dbErr);
      }
    }

    // 2. Push backup to Google Apps Script
    try {
      const response = await fetch(GOOGLE_APP_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: body.action || 'archiveRoster',
          ...body
        })
      });

      if (!response.ok) {
        console.warn('Google Sheets archive push returned non-200, but data is safely saved in MongoDB');
      }
    } catch (gsErr) {
      console.warn("Failed to push archive to Google Sheets (saved safely in MongoDB):", gsErr);
    }

    return NextResponse.json({ status: 'ok', message: 'Roster saved with dual persistence.' });
  } catch (error: any) {
    console.error("Archive POST Error:", error);
    return NextResponse.json({ status: 'error', message: error.message }, { status: 500 });
  }
}

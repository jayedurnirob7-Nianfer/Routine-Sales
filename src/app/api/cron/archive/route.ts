import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import { Roster } from '@/models/Roster';

const GOOGLE_APP_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyRarIsbzP1lrEOzrtOapLUspxMIPNtZTOVAPQh2K9eva4yPgNA0iIxgquf5vGBcBrY/exec";

export async function GET(request: Request) {
  try {
    // Basic authorization to prevent random people from triggering the cron
    // In production, use VERCEL_CRON_SECRET or a custom header
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET || 'secret'}`) {
       // Allow execution if no cron secret is set for local testing, but warn in production
       if (process.env.NODE_ENV === 'production' && process.env.CRON_SECRET) {
           return new NextResponse('Unauthorized', { status: 401 });
       }
    }

    await connectToDatabase();

    // Calculate last month
    const now = new Date();
    // E.g., if today is March 1st, we want to archive February (month 2).
    // Let's get the month and year for the month prior to `now`.
    let archiveMonth = now.getMonth(); // 0-indexed, so getMonth() is the previous month! (e.g. March is 2, so archiveMonth = 2, which corresponds to Feb if we use 1-indexed)
    let archiveYear = now.getFullYear();
    
    if (archiveMonth === 0) {
      archiveMonth = 12;
      archiveYear--;
    }

    // Find all roster entries for the archive month
    const prefix = `${archiveYear}-${String(archiveMonth).padStart(2, '0')}-`;
    
    const rosterEntries = await Roster.find({ date: { $regex: `^${prefix}` } }).lean();

    if (rosterEntries.length === 0) {
      return NextResponse.json({ status: 'ok', message: 'No data to archive for ' + prefix });
    }

    // Format data to match Google Sheet expectation (a single object where keys are dates)
    const rosterToArchive: Record<string, any> = {};
    rosterEntries.forEach(entry => {
      rosterToArchive[entry.date] = entry.assignments;
    });

    // Send data to Google Apps Script
    // Wait, does the Google Apps Script currently support an "archiveRoster" action?
    // According to the plan, the user will update their Google Apps Script to accept this action.
    const response = await fetch(GOOGLE_APP_SCRIPT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'archiveRoster',
        roster: rosterToArchive,
        year: archiveYear,
        month: archiveMonth
      })
    });

    if (!response.ok) {
      throw new Error('Failed to push archive to Google Sheets');
    }

    // Retain full data in MongoDB for permanent safety and dual redundancy
    return NextResponse.json({ status: 'ok', archivedEntries: rosterEntries.length, month: prefix, message: 'Safely backed up to Google Sheets and preserved in MongoDB.' });

  } catch (error: any) {
    console.error("Cron Archive Error:", error);
    return NextResponse.json({ status: 'error', message: error.message }, { status: 500 });
  }
}

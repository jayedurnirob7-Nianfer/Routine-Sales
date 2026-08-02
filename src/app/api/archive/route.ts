import { NextResponse } from 'next/server';

const GOOGLE_APP_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyRarIsbzP1lrEOzrtOapLUspxMIPNtZTOVAPQh2K9eva4yPgNA0iIxgquf5vGBcBrY/exec";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { year, month, roster } = body;

    const response = await fetch(GOOGLE_APP_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: body.action || 'archiveRoster',
        ...body
      })
    });

    if (!response.ok) {
      throw new Error('Failed to push archive to Google Sheets');
    }

    return NextResponse.json({ status: 'ok' });
  } catch (error: any) {
    console.error("Archive POST Error:", error);
    return NextResponse.json({ status: 'error', message: error.message }, { status: 500 });
  }
}

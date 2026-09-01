import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import { Employee } from '@/models/Employee';
import { Roster } from '@/models/Roster';
import { Settings } from '@/models/Settings';

const GOOGLE_APP_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyRarIsbzP1lrEOzrtOapLUspxMIPNtZTOVAPQh2K9eva4yPgNA0iIxgquf5vGBcBrY/exec";

// A simplified decoding logic for the role string for raw migration
function decodeRole(rawRole: string) {
  let role = String(rawRole ?? '');
  let profileImage, password, requests;
  if (role.includes('|REQS:')) { const p = role.split('|REQS:'); role = p[0]; try { requests = JSON.parse(p[1]); } catch {} }
  if (role.includes('|PWD:')) { const p = role.split('|PWD:'); role = p[0]; password = p[1]; }
  if (role.includes('|IMG:')) { const p = role.split('|IMG:'); role = p[0]; profileImage = p[1]; }
  return { role, profileImage, password, requests };
}

export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const secret = searchParams.get('secret');
    if (secret !== 'routine_sales_migrate_confirm') {
      return NextResponse.json({ 
        status: 'error', 
        message: 'Migration locked for data safety. Add ?secret=routine_sales_migrate_confirm to proceed.' 
      }, { status: 403 });
    }

    await connectToDatabase();

    const res = await fetch(`${GOOGLE_APP_SCRIPT_URL}?action=getAll&_t=${Date.now()}`);
    if (!res.ok) throw new Error(`Failed to fetch from Google Sheets: ${res.status}`);
    const json = await res.json();
    if (json.status !== 'ok') throw new Error(json.message || 'API error from GS');

    const data = json.data;

    if (data.employees && data.employees.length > 0) {
      const empOps = data.employees.map((e: any) => {
        const decoded = decodeRole(e.role);
        return {
          updateOne: {
            filter: { id: String(e.id ?? '') },
            update: {
              $set: {
                name: String(e.name ?? ''),
                employeeId: String(e.employeeId ?? ''),
                role: decoded.role,
                active: true,
                createdAt: String(e.createdAt ?? ''),
                weeklyOffDay: typeof e.weeklyOffDay === 'number' ? e.weeklyOffDay : (e.weeklyOffDay ? parseInt(String(e.weeklyOffDay), 10) : undefined),
                defaultShift: e.defaultShift || 'morning',
                profileImage: decoded.profileImage,
                password: decoded.password || '1234',
              },
              $setOnInsert: {
                id: String(e.id ?? ''),
                requests: decoded.requests || {},
              }
            },
            upsert: true
          }
        };
      });
      await Employee.bulkWrite(empOps as any);
    }

    if (data.roster) {
      const rosterOps = Object.entries(data.roster).map(([date, assignments]) => ({
        updateOne: {
          filter: { date },
          update: { $set: { assignments } },
          upsert: true
        }
      }));
      if (rosterOps.length > 0) {
        await Roster.bulkWrite(rosterOps as any);
      }
    }

    if (data.settings || data.auth) {
      await Settings.create({
        docId: 'global',
        siteName: data.settings?.siteName || 'PXL Sales Routine',
        logoEmoji: data.settings?.logoEmoji || '⬡',
        logoImage: data.settings?.logoImage,
        adminUsername: data.auth?.username,
        adminPassword: data.auth?.password,
      });
    }
    
    return NextResponse.json({ status: 'ok', message: 'Migration successful!' });

  } catch (error: any) {
    console.error("Migration Error:", error);
    return NextResponse.json({ status: 'error', message: error.message }, { status: 500 });
  }
}

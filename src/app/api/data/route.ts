import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import { Employee } from '@/models/Employee';
import { Roster } from '@/models/Roster';
import { Settings } from '@/models/Settings';

export async function GET() {
  try {
    await connectToDatabase();

    const employees = await Employee.find({}).lean();
    const rosters = await Roster.find({}).lean();
    let settingsDoc = await Settings.findOne({ docId: 'global' }).lean();

    if (!settingsDoc) {
      settingsDoc = {
        siteName: 'PXL Sales Routine',
        logoEmoji: '⬡',
      } as any;
    }

    const formattedEmployees = employees.map((emp: any) => ({
      id: emp.id,
      name: emp.name,
      employeeId: emp.employeeId,
      role: emp.role,
      active: emp.active,
      createdAt: emp.createdAt,
      weeklyOffDay: emp.weeklyOffDay,
      defaultShift: emp.defaultShift,
      profileImage: emp.profileImage,
      password: emp.password,
      requests: emp.requests,
    }));

    const formattedRoster: Record<string, any[]> = {};
    rosters.forEach((r: any) => {
      formattedRoster[r.date] = r.assignments;
    });

    const settings = {
      siteName: settingsDoc.siteName,
      logoEmoji: settingsDoc.logoEmoji,
      logoImage: settingsDoc.logoImage,
    };

    const auth = {
      username: settingsDoc.adminUsername,
      password: settingsDoc.adminPassword,
    };

    return NextResponse.json({
      status: 'ok',
      data: {
        employees: formattedEmployees,
        roster: formattedRoster,
        settings,
        auth,
      }
    });
  } catch (error: any) {
    console.error("API GET Error:", error);
    return NextResponse.json({ status: 'error', message: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await connectToDatabase();
    const body = await request.json();
    const { action, ...payload } = body;

    if (action === 'saveEmployees') {
      const { employees } = payload;
      // Bulk upsert employees
      const ops = employees.map((emp: any) => ({
        updateOne: {
          filter: { id: emp.id },
          update: { $set: emp },
          upsert: true
        }
      }));
      // Delete any employees not in the array (optional, but good for sync)
      const empIds = employees.map((e: any) => e.id);
      await Employee.deleteMany({ id: { $nin: empIds } });
      if (ops.length > 0) {
        await Employee.bulkWrite(ops);
      }
      return NextResponse.json({ status: 'ok' });
    }

    if (action === 'saveRoster') {
      const { roster } = payload;
      const ops = Object.entries(roster).map(([date, assignments]) => ({
        updateOne: {
          filter: { date },
          update: { $set: { assignments } },
          upsert: true
        }
      }));
      if (ops.length > 0) {
        await Roster.bulkWrite(ops);
      }
      return NextResponse.json({ status: 'ok' });
    }

    if (action === 'saveSettings') {
      const { settings } = payload;
      await Settings.findOneAndUpdate(
        { docId: 'global' },
        { $set: settings },
        { upsert: true }
      );
      return NextResponse.json({ status: 'ok' });
    }

    if (action === 'saveAuth') {
      const { auth } = payload;
      await Settings.findOneAndUpdate(
        { docId: 'global' },
        { $set: { adminUsername: auth.username, adminPassword: auth.password } },
        { upsert: true }
      );
      return NextResponse.json({ status: 'ok' });
    }

    return NextResponse.json({ status: 'error', message: 'Unknown action' }, { status: 400 });

  } catch (error: any) {
    console.error("API POST Error:", error);
    return NextResponse.json({ status: 'error', message: error.message }, { status: 500 });
  }
}

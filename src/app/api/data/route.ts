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
      siteName: settingsDoc?.siteName || 'PXL Sales Routine',
      logoEmoji: settingsDoc?.logoEmoji || '⬡',
      logoImage: settingsDoc?.logoImage || '',
    };

    const auth = {
      username: settingsDoc?.adminUsername || '',
      password: settingsDoc?.adminPassword || '',
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
      // Bulk upsert employees without destructive table wiping
      const ops = employees.map((emp: any) => ({
        updateOne: {
          filter: { id: emp.id },
          update: { $set: emp },
          upsert: true
        }
      }));
      if (ops.length > 0) {
        await Employee.bulkWrite(ops as any);
      }
      return NextResponse.json({ status: 'ok' });
    }

    if (action === 'submitRequest') {
      const { employeeId, date, requestData } = payload;
      if (!employeeId || !date || !requestData) {
        return NextResponse.json({ status: 'error', message: 'Missing parameters' }, { status: 400 });
      }
      await Employee.updateOne(
        { $or: [{ id: employeeId }, { employeeId: employeeId }] },
        { $set: { [`requests.${date}`]: requestData } }
      );
      return NextResponse.json({ status: 'ok' });
    }

    if (action === 'updateRequestStatus') {
      const { employeeId, date, status, previousAssignment } = payload;
      if (!employeeId || !date || !status) {
        return NextResponse.json({ status: 'error', message: 'Missing parameters' }, { status: 400 });
      }
      const updateFields: Record<string, any> = {
        [`requests.${date}.status`]: status,
      };
      if (previousAssignment !== undefined) {
        updateFields[`requests.${date}.previousAssignment`] = previousAssignment;
      }
      await Employee.updateOne(
        { $or: [{ id: employeeId }, { employeeId: employeeId }] },
        { $set: updateFields }
      );
      return NextResponse.json({ status: 'ok' });
    }

    if (action === 'bulkUpdateRequestStatuses') {
      const { updates } = payload;
      if (Array.isArray(updates) && updates.length > 0) {
        const ops = updates.map((u: any) => {
          const setFields: Record<string, any> = {
            [`requests.${u.date}.status`]: u.status,
          };
          if (u.previousAssignment !== undefined) {
            setFields[`requests.${u.date}.previousAssignment`] = u.previousAssignment;
          }
          return {
            updateOne: {
              filter: { $or: [{ id: u.employeeId }, { employeeId: u.employeeId }] },
              update: { $set: setFields }
            }
          };
        });
        await Employee.bulkWrite(ops as any);
      }
      return NextResponse.json({ status: 'ok' });
    }

    if (action === 'deleteRequest') {
      const { employeeId, date } = payload;
      if (!employeeId || !date) {
        return NextResponse.json({ status: 'error', message: 'Missing parameters' }, { status: 400 });
      }
      await Employee.updateOne(
        { $or: [{ id: employeeId }, { employeeId: employeeId }] },
        { $unset: { [`requests.${date}`]: 1 } }
      );
      return NextResponse.json({ status: 'ok' });
    }

    if (action === 'deleteEmployee') {
      const { id } = payload;
      if (id) {
        await Employee.deleteOne({ $or: [{ id }, { employeeId: id }] });
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
        await Roster.bulkWrite(ops as any);
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

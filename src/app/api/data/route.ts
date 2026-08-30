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

    const formattedEmployees = employees.map((emp: any) => {
      let role = String(emp.role || '');
      let requests = emp.requests;
      if (typeof requests === 'string') {
        try { requests = JSON.parse(requests); } catch { requests = {}; }
      } else if (!requests || typeof requests !== 'object') {
        requests = {};
      } else {
        requests = { ...requests };
      }

      if (role.includes('|REQS:')) {
        const parts = role.split('|REQS:');
        role = parts[0];
        try {
          const legacy = JSON.parse(parts[1]);
          requests = { ...legacy, ...requests };
        } catch {}
      }
      if (role.includes('|PWD:')) {
        role = role.split('|PWD:')[0];
      }
      if (role.includes('|IMG:')) {
        role = role.split('|IMG:')[0];
      }

      return {
        id: String(emp.id || ''),
        name: String(emp.name || ''),
        employeeId: String(emp.employeeId || ''),
        role: role,
        active: emp.active !== false,
        createdAt: emp.createdAt,
        weeklyOffDay: emp.weeklyOffDay,
        defaultShift: emp.defaultShift,
        profileImage: emp.profileImage,
        password: emp.password,
        requests: requests,
      };
    });


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

async function findEmployeeDoc(employeeId: string | number) {
  if (!employeeId) return null;
  const strId = String(employeeId).trim();
  const searchConditions: any[] = [
    { id: strId },
    { employeeId: strId },
  ];
  const numId = Number(strId);
  if (!isNaN(numId)) {
    searchConditions.push({ id: numId });
    searchConditions.push({ employeeId: numId });
  }
  return Employee.findOne({ $or: searchConditions });
}

export async function POST(request: Request) {
  try {
    await connectToDatabase();
    const body = await request.json();
    const { action, ...payload } = body;

    if (action === 'saveEmployees') {
      const { employees } = payload;
      // Bulk update employee profiles WITHOUT overwriting their requests field
      const ops = employees.map((emp: any) => {
        const { requests, ...empProfile } = emp;
        return {
          updateOne: {
            filter: { id: emp.id },
            update: { $set: empProfile },
            upsert: true
          }
        };
      });
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
      
      const empDoc = await findEmployeeDoc(employeeId);
      if (!empDoc) {
        console.error(`[submitRequest] Employee not found for ID: ${employeeId}`);
        return NextResponse.json({ status: 'error', message: `Employee with ID ${employeeId} not found` }, { status: 404 });
      }

      let currentReqs = empDoc.requests;
      if (typeof currentReqs === 'string') {
        try { currentReqs = JSON.parse(currentReqs); } catch { currentReqs = {}; }
      } else if (!currentReqs || typeof currentReqs !== 'object') {
        currentReqs = {};
      } else {
        currentReqs = { ...currentReqs };
      }
      
      currentReqs[date] = requestData;
      empDoc.requests = currentReqs;
      empDoc.markModified('requests');
      await empDoc.save();
      
      return NextResponse.json({ status: 'ok' });
    }

    if (action === 'updateRequestStatus') {
      const { employeeId, date, status, previousAssignment } = payload;
      if (!employeeId || !date || !status) {
        return NextResponse.json({ status: 'error', message: 'Missing parameters' }, { status: 400 });
      }
      
      const empDoc = await findEmployeeDoc(employeeId);
      if (empDoc && empDoc.requests) {
        let currentReqs = empDoc.requests;
        if (typeof currentReqs === 'string') {
          try { currentReqs = JSON.parse(currentReqs); } catch { currentReqs = {}; }
        } else {
          currentReqs = { ...currentReqs };
        }

        if (currentReqs[date]) {
          currentReqs[date] = { ...currentReqs[date], status };
          if (previousAssignment !== undefined) {
            currentReqs[date].previousAssignment = previousAssignment;
          }
          empDoc.requests = currentReqs;
          empDoc.markModified('requests');
          await empDoc.save();
        }
      }
      return NextResponse.json({ status: 'ok' });
    }

    if (action === 'bulkUpdateRequestStatuses') {
      const { updates } = payload;
      if (Array.isArray(updates) && updates.length > 0) {
        for (const u of updates) {
          const empDoc = await findEmployeeDoc(u.employeeId);
          if (empDoc && empDoc.requests) {
            let currentReqs = empDoc.requests;
            if (typeof currentReqs === 'string') {
              try { currentReqs = JSON.parse(currentReqs); } catch { currentReqs = {}; }
            } else {
              currentReqs = { ...currentReqs };
            }

            if (currentReqs[u.date]) {
              currentReqs[u.date] = { ...currentReqs[u.date], status: u.status };
              if (u.previousAssignment !== undefined) {
                currentReqs[u.date].previousAssignment = u.previousAssignment;
              }
              empDoc.requests = currentReqs;
              empDoc.markModified('requests');
              await empDoc.save();
            }
          }
        }
      }
      return NextResponse.json({ status: 'ok' });
    }

    if (action === 'deleteRequest') {
      const { employeeId, date } = payload;
      if (!employeeId || !date) {
        return NextResponse.json({ status: 'error', message: 'Missing parameters' }, { status: 400 });
      }
      
      const empDoc = await findEmployeeDoc(employeeId);
      if (empDoc && empDoc.requests) {
        let currentReqs = empDoc.requests;
        if (typeof currentReqs === 'string') {
          try { currentReqs = JSON.parse(currentReqs); } catch { currentReqs = {}; }
        } else {
          currentReqs = { ...currentReqs };
        }

        delete currentReqs[date];
        empDoc.requests = currentReqs;
        empDoc.markModified('requests');
        await empDoc.save();
      }
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

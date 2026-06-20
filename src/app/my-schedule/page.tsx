'use client';
import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { getRoster, getAssignment, saveEmployees, getEmployees, SHIFT_INFO, WEEKDAYS } from '@/lib/store';
import { RosterData, ShiftType, ShiftRequest } from '@/types';

export default function MySchedulePage() {
  const { employeeUser, isLoading } = useAuth();
  const [roster, setRoster] = useState<RosterData>({});
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);

  // Modal State
  const [reqDate, setReqDate] = useState<string | null>(null);
  const [reqType, setReqType] = useState<'off' | 'shift' | 'leave'>('off');
  const [reqReason, setReqReason] = useState('');
  const [reqShift, setReqShift] = useState<ShiftType>('morning');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [localRequests, setLocalRequests] = useState<Record<string, ShiftRequest>>({});

  // Password Modal State
  const [passModal, setPassModal] = useState(false);
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [passErr, setPassErr] = useState('');

  useEffect(() => {
    if (employeeUser) {
      setLocalRequests(employeeUser.requests || {});
      getRoster().then(r => { setRoster(r); setLoading(false); });
    }
  }, [employeeUser]);

  if (isLoading) return null;
  if (!employeeUser) return <div className="p-8 text-center text-red-500">Access Denied. Employee login required.</div>;
  if (loading) return <div className="p-8 text-center text-gray-500">Loading schedule...</div>;

  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDay = new Date(year, month - 1, 1).getDay();
  const weeks = [];
  let currentWeek = Array(firstDay).fill(null);

  for (let d = 1; d <= daysInMonth; d++) {
    currentWeek.push(d);
    if (currentWeek.length === 7) { weeks.push(currentWeek); currentWeek = []; }
  }
  if (currentWeek.length > 0) {
    while (currentWeek.length < 7) currentWeek.push(null);
    weeks.push(currentWeek);
  }

  async function submitRequest() {
    if (!reqDate || !employeeUser) return;
    setSaving(true);
    const emps = await getEmployees();
    const empIdx = emps.findIndex(e => e.id === employeeUser.id);
    if (empIdx === -1) return;

    const newReqs = { ...emps[empIdx].requests };
    newReqs[reqDate] = {
      date: reqDate,
      type: reqType,
      requestedShift: reqType === 'shift' ? reqShift : undefined,
      reason: reqType === 'leave' ? reqReason : undefined,
      status: 'pending',
      createdAt: new Date().toISOString()
    };
    emps[empIdx].requests = newReqs;

    await saveEmployees(emps);
    setLocalRequests(newReqs);
    setSaving(false);
    
    setReqDate(null);
    setReqReason('');
    setToast('success');
  }

  async function handleChangePassword() {
    if (!newPass || newPass !== confirmPass) {
      setPassErr('Passwords do not match or are empty.');
      return;
    }
    setSaving(true);
    setPassErr('');
    const emps = await getEmployees();
    const empIdx = emps.findIndex(e => e.id === employeeUser?.id);
    if (empIdx > -1) {
      emps[empIdx].password = newPass;
      await saveEmployees(emps);
      setPassModal(false);
      setNewPass('');
      setConfirmPass('');
      setToast('password_success');
    }
    setSaving(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            My Schedule 
            <button className="btn-ghost text-xs border border-gray-200 dark:border-gray-700 shadow-sm" onClick={() => setPassModal(true)}>
              🔑 Change Password
            </button>
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-secondary" onClick={() => {
            let m = month - 1; let y = year;
            if (m < 1) { m = 12; y--; }
            setMonth(m); setYear(y);
          }}>←</button>
          <span className="font-semibold text-lg w-32 text-center">
            {new Date(year, month - 1).toLocaleString('default', { month: 'long', year: 'numeric' })}
          </span>
          <button className="btn-secondary" onClick={() => {
            let m = month + 1; let y = year;
            if (m > 12) { m = 1; y++; }
            setMonth(m); setYear(y);
          }}>→</button>
        </div>
      </div>

      <div className="card p-6 overflow-x-auto">
        <div className="min-w-[800px]">
          <div className="grid grid-cols-7 gap-2 mb-2 text-center font-semibold text-sm text-gray-500">
            {WEEKDAYS.map(w => <div key={w}>{w}</div>)}
          </div>
          <div className="flex flex-col gap-2">
            {weeks.map((week, wi) => (
              <div key={wi} className="grid grid-cols-7 gap-2">
                {week.map((d, di) => {
                  if (!d) return <div key={di} className="h-24 bg-gray-50 dark:bg-gray-900/50 rounded-xl" />;
                  
                  const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
                  const assignment = getAssignment(roster, employeeUser, dateStr);
                  const req = localRequests[dateStr];

                  if (!assignment) {
                    return (
                      <div key={di} 
                           onClick={() => setReqDate(dateStr)}
                           className={`h-28 rounded-xl border p-2 flex flex-col gap-1 cursor-pointer transition-colors hover:border-teal-400 border-gray-200 bg-gray-50/50 dark:border-gray-800 dark:bg-gray-900/50`}>
                        <div className="font-medium text-sm flex justify-between">
                          <span className="text-gray-400">{d}</span>
                          {req && req.status === 'pending' && <span className="text-xs bg-yellow-100 text-yellow-800 px-1.5 rounded h-min">Pending</span>}
                          {req && req.status === 'approved' && <span className="text-xs bg-green-100 text-green-800 px-1.5 rounded h-min">Approved</span>}
                          {req && req.status === 'rejected' && <span className="text-xs bg-red-100 text-red-800 px-1.5 rounded h-min">Rejected</span>}
                        </div>
                        <div className="text-xs font-medium text-gray-400 italic mt-1">Not assigned</div>
                        {req && req.status === 'pending' && (
                          <div className="text-[10px] text-gray-600 mt-auto leading-tight">
                            Req: {req.type === 'leave' ? 'Leave' : req.type === 'off' ? 'Off Day' : SHIFT_INFO[req.requestedShift!].label}
                          </div>
                        )}
                      </div>
                    );
                  }

                  const isLeave = assignment.reason?.startsWith('LEAVE|');
                  const info = SHIFT_INFO[assignment.shift];

                  return (
                    <div key={di} 
                         onClick={() => setReqDate(dateStr)}
                         className={`h-28 rounded-xl border p-2 flex flex-col gap-1 cursor-pointer transition-colors hover:border-teal-400
                           ${dateStr === new Date().toISOString().split('T')[0] ? 'ring-2 ring-teal-500' : ''}
                           ${info.border} ${isLeave ? 'bg-amber-50 dark:bg-amber-900/10 border-amber-200' : info.bg}`}>
                      <div className="font-medium text-sm flex justify-between">
                        <span>{d}</span>
                        {req && req.status === 'pending' && <span className="text-xs bg-yellow-100 text-yellow-800 px-1.5 rounded h-min">Pending</span>}
                        {req && req.status === 'approved' && <span className="text-xs bg-green-100 text-green-800 px-1.5 rounded h-min">Approved</span>}
                        {req && req.status === 'rejected' && <span className="text-xs bg-red-100 text-red-800 px-1.5 rounded h-min">Rejected</span>}
                      </div>
                      <div className={`text-xs font-semibold ${isLeave ? 'text-amber-600' : info.color}`}>
                        {isLeave ? 'On Leave' : info.label}
                      </div>
                      
                      {req && req.status === 'pending' && (
                        <div className="text-[10px] text-gray-600 mt-auto leading-tight">
                          Req: {req.type === 'leave' ? 'Leave' : req.type === 'off' ? 'Off Day' : SHIFT_INFO[req.requestedShift!].label}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Request History */}
      <div className="card p-6 mt-8">
        <h2 className="text-xl font-bold mb-4">Request History</h2>
        {Object.values(localRequests).length === 0 ? (
          <p className="text-gray-500 text-sm">No requests have been submitted yet.</p>
        ) : (
          <div className="space-y-3">
            {Object.values(localRequests)
              .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
              .map((req, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 border border-gray-100 dark:border-gray-800 rounded-xl bg-gray-50/50 dark:bg-gray-900/50">
                  <div>
                    <div className="font-semibold text-sm text-gray-900 dark:text-gray-100">
                      {req.type === 'leave' ? `Leave Request` : req.type === 'off' ? `Off Day Request` : `Shift Switch (${SHIFT_INFO[req.requestedShift!].label})`}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">Requested for: <strong>{req.date}</strong></div>
                    {req.reason && <div className="text-xs text-gray-500 mt-0.5">Reason: {req.reason}</div>}
                  </div>
                  <div>
                    {req.status === 'pending' && <span className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 px-2 py-1 rounded-lg text-xs font-medium">Pending</span>}
                    {req.status === 'approved' && <span className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 px-2 py-1 rounded-lg text-xs font-medium">Approved</span>}
                    {req.status === 'rejected' && <span className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 px-2 py-1 rounded-lg text-xs font-medium">Rejected</span>}
                  </div>
                </div>
            ))}
          </div>
        )}
      </div>

      {/* Change Password Modal */}
      {passModal && (
        <div className="fixed inset-0 bg-black/50 z-[110] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 p-6 rounded-2xl max-w-sm w-full space-y-4">
            <h2 className="text-xl font-bold flex items-center gap-2">🔑 Change Password</h2>
            {passErr && <div className="text-sm text-red-500 bg-red-50 p-2 rounded-lg">{passErr}</div>}
            <div className="hidden">
              <input type="text" autoComplete="username" value={employeeUser?.employeeId || ''} readOnly />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">New Password</label>
              <input className="input" type="password" autoComplete="new-password" value={newPass} onChange={e => setNewPass(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Confirm Password</label>
              <input className="input" type="password" autoComplete="new-password" value={confirmPass} onChange={e => setConfirmPass(e.target.value)} />
            </div>

            <div className="flex gap-2 pt-2">
              <button className="btn-primary flex-1" onClick={handleChangePassword} disabled={saving}>
                {saving ? 'Saving...' : 'Update Password'}
              </button>
              <button className="btn-secondary flex-1 border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 rounded-xl px-4 py-2 text-sm" onClick={() => { setPassModal(false); setPassErr(''); setNewPass(''); setConfirmPass(''); }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {reqDate && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 p-6 rounded-2xl max-w-sm w-full space-y-4">
            <h2 className="text-xl font-bold">Request Change</h2>
            <p className="text-sm text-gray-600">Requesting change for <strong>{reqDate}</strong>.</p>
            
            {localRequests[reqDate]?.status === 'pending' && (
              <div className="bg-yellow-50 text-yellow-800 p-3 rounded-lg text-sm">
                You already have a pending request for this date. Submitting again will overwrite it.
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-1">Request Type</label>
              <select className="input" value={reqType} onChange={e => setReqType(e.target.value as 'off' | 'shift' | 'leave')}>
                <option value="off">Request Off Day</option>
                <option value="shift">Request Shift Switch</option>
                <option value="leave">Request Leave</option>
              </select>
            </div>

            {reqType === 'leave' && (
              <div>
                <label className="block text-sm font-medium mb-1">Reason (Optional)</label>
                <input className="input" type="text" placeholder="e.g., Sick, Vacation, etc." value={reqReason} onChange={e => setReqReason(e.target.value)} />
              </div>
            )}

            {reqType === 'shift' && (
              <div>
                <label className="block text-sm font-medium mb-1">Which shift?</label>
                <select className="input" value={reqShift} onChange={e => setReqShift(e.target.value as ShiftType)}>
                  <option value="morning">Morning</option>
                  <option value="evening">Evening</option>
                  <option value="night">Night</option>
                </select>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button className="btn-primary flex-1" onClick={submitRequest} disabled={saving}>
                {saving ? 'Saving...' : 'Submit Request'}
              </button>
              <button className="btn-secondary flex-1" onClick={() => setReqDate(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Success Modal Notification */}
      {(toast === 'success' || toast === 'password_success') && (
        <div className="fixed inset-0 bg-black/50 z-[120] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-gray-900 p-8 rounded-2xl max-w-sm w-full space-y-6 text-center shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="w-20 h-20 mx-auto flex items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30 text-green-500 mb-2 animate-in zoom-in duration-300 shadow-inner">
              <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                <path className="animate-check" strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Success!</h2>
              {toast === 'password_success' ? (
                <p className="text-sm text-gray-500 mt-2">Your password was updated successfully!</p>
              ) : (
                <p className="text-sm text-gray-500 mt-2">Your request was submitted successfully and is now marked as <strong>Pending</strong>.</p>
              )}
            </div>
            <div className="flex gap-3 pt-2">
              <button className="flex-1 py-2 px-4 rounded-xl font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors cursor-pointer" onClick={() => setToast('')}>
                Done
              </button>
              {toast === 'success' && (
                <button className="btn-primary flex-1" onClick={() => setToast('')}>
                  Submit another
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

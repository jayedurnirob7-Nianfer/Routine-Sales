'use client';
import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { getRoster, getAssignment, saveEmployees, getEmployees, SHIFT_INFO, WEEKDAYS } from '@/lib/store';
import { Employee, RosterData, ShiftType, ShiftRequest } from '@/types';

function Avatar({ emp, className = '' }: { emp: Employee, className?: string }) {
  if (emp.profileImage) {
    return <img src={emp.profileImage} alt={emp.name} className={`object-cover ${className}`} />;
  }
  return <div className={`flex items-center justify-center font-bold ${className}`}>{emp.name.charAt(0)}</div>;
}

export default function MySchedulePage() {
  const { employeeUser, isLoading } = useAuth();
  const [roster, setRoster] = useState<RosterData>({});
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);

  // Modal State
  const [reqDate, setReqDate] = useState<string | null>(null);
  const [reqType, setReqType] = useState<'off' | 'shift' | 'leave' | 'issue'>('off');
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
    
    // CRITICAL: Force fresh fetch to avoid overwriting Google Sheets with stale local cache!
    invalidateCache();
    const emps = await getEmployees();
    
    const empIdx = emps.findIndex(e => e.id === employeeUser.id);
    if (empIdx === -1) {
      setSaving(false);
      return;
    }

    const newReqs = { ...emps[empIdx].requests };
    newReqs[reqDate] = {
      date: reqDate,
      type: reqType,
      requestedShift: reqType === 'shift' ? reqShift : undefined,
      reason: (reqType === 'leave' || reqType === 'issue') ? reqReason : undefined,
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
    
    // CRITICAL: Force fresh fetch to avoid overwriting Google Sheets with stale local cache!
    invalidateCache();
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
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Premium Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 card p-6 bg-gradient-to-r from-teal-500/10 to-blue-500/10 dark:from-teal-500/5 dark:to-blue-500/5 border-none shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-white dark:bg-gray-800 shadow-sm flex items-center justify-center overflow-hidden shrink-0 border border-gray-100 dark:border-gray-700 text-teal-600 dark:text-teal-400 text-2xl">
            <Avatar emp={employeeUser} className="w-full h-full" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{employeeUser.name}</h1>
            <p className="text-sm font-medium text-teal-600 dark:text-teal-400 opacity-90">{employeeUser.role.split('|IMG:')[0]} • ID: {employeeUser.employeeId}</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-4">
          <button className="btn-ghost text-sm bg-white/50 dark:bg-gray-800/50 backdrop-blur-md shadow-sm border border-gray-200/50 dark:border-gray-700/50 w-full sm:w-auto" onClick={() => setPassModal(true)}>
            🔑 Change Password
          </button>
          <div className="flex items-center gap-2 bg-white/50 dark:bg-gray-800/50 backdrop-blur-md rounded-xl p-1 shadow-sm border border-gray-200/50 dark:border-gray-700/50">
            <button className="p-2 hover:bg-white dark:hover:bg-gray-700 rounded-lg transition-colors text-gray-500 hover:text-gray-900 dark:hover:text-white" onClick={() => {
              let m = month - 1; let y = year;
              if (m < 1) { m = 12; y--; }
              setMonth(m); setYear(y);
            }}>←</button>
            <span className="font-semibold text-sm w-32 text-center">
              {new Date(year, month - 1).toLocaleString('default', { month: 'long', year: 'numeric' })}
            </span>
            <button className="p-2 hover:bg-white dark:hover:bg-gray-700 rounded-lg transition-colors text-gray-500 hover:text-gray-900 dark:hover:text-white" onClick={() => {
              let m = month + 1; let y = year;
              if (m > 12) { m = 1; y++; }
              setMonth(m); setYear(y);
            }}>→</button>
          </div>
        </div>
      </div>

      {/* --- DESKTOP CALENDAR GRID (Hidden on mobile) --- */}
      <div className="hidden md:block card p-6 shadow-md border-0 bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm mt-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7 gap-3">
          {Array.from({ length: daysInMonth }).map((_, idx) => {
            const d = idx + 1;
            const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
            const isToday = dateStr === new Date().toISOString().split('T')[0];
            const assignment = getAssignment(roster, employeeUser, dateStr);
            const req = localRequests[dateStr];
            const weekday = new Date(year, month - 1, d).toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();

            return (
              <div key={dateStr} className={`p-3 rounded-2xl border transition-all duration-300 hover:shadow-xl hover:-translate-y-1 hover:border-teal-400 cursor-pointer group relative overflow-hidden
                ${isToday ? 'bg-teal-50 dark:bg-teal-900/10 border-teal-200 dark:border-teal-800/50 shadow-sm ring-1 ring-teal-500/20' : 'bg-white dark:bg-gray-900 border-gray-100 dark:border-gray-800'}`}
                onClick={() => setReqDate(dateStr)}>
                
                <div className="flex justify-between items-start mb-0.5">
                  <div className={`text-[10px] font-bold tracking-wider ${isToday ? 'text-teal-600 dark:text-teal-400' : 'text-gray-400'}`}>
                    {weekday} {isToday && '(TODAY)'}
                  </div>
                  <div className="flex gap-1">
                    {req && req.status === 'pending' && <span className="w-2.5 h-2.5 rounded-full bg-yellow-400 shadow-[0_0_10px_rgba(250,204,21,0.8)] animate-pulse" title="Pending"></span>}
                    {req && req.status === 'approved' && <span className="w-2.5 h-2.5 rounded-full bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.8)]" title="Approved"></span>}
                    {req && req.status === 'rejected' && <span className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)]" title="Rejected"></span>}
                  </div>
                </div>
                
                <div className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-2">
                  {new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </div>
                
                {!assignment ? (
                   <div className="text-xs text-gray-400 italic">Not assigned</div>
                ) : (
                  <div className="flex items-center gap-2">
                    {(() => {
                      const isLeave = assignment.reason?.startsWith('LEAVE|');
                      const info = SHIFT_INFO[assignment.shift] || SHIFT_INFO['morning'];
                      return (
                        <span className={`text-[10px] font-black tracking-widest px-2 py-0.5 rounded-lg border shadow-sm ${isLeave ? 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-400 dark:border-amber-800' : `${info.bg} ${info.color} ${info.border}`}`}>
                          {isLeave ? 'LEAVE' : info.label.toUpperCase()}
                        </span>
                      );
                    })()}
                  </div>
                )}
                
                {req && req.status === 'pending' && (
                  <div className={`mt-2 text-[10px] font-bold truncate px-2 py-1 rounded-md border ${req.type === 'issue' ? 'text-red-700 bg-red-100 dark:bg-red-900/40 border-red-200 dark:border-red-900/50 dark:text-red-400' : 'text-yellow-700 bg-yellow-100 dark:bg-yellow-900/40 border-yellow-200 dark:border-yellow-900/50 dark:text-yellow-400'}`}>
                    {req.type === 'issue' ? 'ISSUE REPORTED' : req.type === 'leave' ? 'WAIT: LEAVE' : req.type === 'off' ? 'WAIT: OFF DAY' : `WAIT: ${(SHIFT_INFO[req.requestedShift!]?.label || '').toUpperCase()}`}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* --- MOBILE VERTICAL TIMELINE (Hidden on desktop) --- */}
      <div className="md:hidden space-y-3">
        {Array.from({ length: daysInMonth }).map((_, idx) => {
          const d = idx + 1;
          const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
          const isToday = dateStr === new Date().toISOString().split('T')[0];
          const assignment = getAssignment(roster, employeeUser, dateStr);
          const req = localRequests[dateStr];
          const weekday = new Date(year, month - 1, d).toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();

          return (
            <div key={d} onClick={() => setReqDate(dateStr)} 
                 className={`p-4 rounded-2xl flex items-center gap-4 cursor-pointer transition-all active:scale-[0.98]
                   ${isToday ? 'bg-teal-50 dark:bg-teal-900/20 ring-2 ring-teal-500 shadow-md border-transparent' : 'bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm'}`}>
              
              <div className="flex flex-col items-center justify-center w-12 shrink-0">
                <span className={`text-[10px] font-black tracking-widest ${isToday ? 'text-teal-600 dark:text-teal-400' : 'text-gray-400'}`}>{weekday}</span>
                <span className={`text-2xl font-black ${isToday ? 'text-teal-600 dark:text-teal-400' : 'text-gray-800 dark:text-gray-100'}`}>{d}</span>
              </div>

              <div className="w-px h-10 bg-gray-200 dark:bg-gray-700 shrink-0" />

              <div className="flex-1 flex flex-col gap-1 min-w-0">
                {!assignment ? (
                  <div className="text-gray-400 dark:text-gray-500 font-medium text-sm italic">No Shift Assigned</div>
                ) : (
                  <div className="flex items-center gap-2">
                    {(() => {
                      const isLeave = assignment.reason?.startsWith('LEAVE|');
                      const info = SHIFT_INFO[assignment.shift] || SHIFT_INFO['morning'];
                      return (
                        <span className={`text-xs font-black tracking-widest px-3 py-1 rounded-lg border shadow-sm ${isLeave ? 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-400 dark:border-amber-800' : `${info.bg} ${info.color} ${info.border}`}`}>
                          {isLeave ? 'LEAVE' : info.label.toUpperCase()}
                        </span>
                      );
                    })()}
                  </div>
                )}
                
                {req && req.status === 'pending' && (
                  <div className={`text-xs font-bold flex items-center gap-1.5 truncate ${req.type === 'issue' ? 'text-red-600 dark:text-red-400' : 'text-yellow-600 dark:text-yellow-400'}`}>
                    <span className={`w-2 h-2 rounded-full animate-pulse ${req.type === 'issue' ? 'bg-red-400' : 'bg-yellow-400'}`}></span>
                    {req.type === 'issue' ? 'Reported Issue' : `Waiting for ${req.type === 'leave' ? 'Leave' : req.type === 'off' ? 'Off Day' : 'Switch'}`}
                  </div>
                )}
              </div>
              
              <div className="text-gray-300 dark:text-gray-600 shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                </svg>
              </div>
            </div>
          );
        })}
      </div>

      {/* Request History */}
      <div className="card p-6 mt-8 shadow-sm">
        <h2 className="text-xl font-bold mb-6 flex items-center gap-2">📝 Request History</h2>
        {Object.values(localRequests).length === 0 ? (
          <div className="py-12 flex flex-col items-center justify-center text-gray-400 bg-gray-50/50 dark:bg-gray-900/30 rounded-2xl border border-dashed border-gray-200 dark:border-gray-800">
             <div className="text-4xl mb-3 opacity-50 grayscale"> Inbox </div>
             <p className="text-sm">No requests have been submitted yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.values(localRequests)
              .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
              .map((req, idx) => (
                <div key={idx} className="flex flex-col p-4 border border-gray-100 dark:border-gray-800 rounded-2xl bg-white dark:bg-gray-900 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] hover:shadow-md transition-shadow">
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-2">
                       <span className="text-xl">
                         {req.type === 'issue' ? '⚠️' : req.type === 'leave' ? '✈️' : req.type === 'off' ? '🛌' : '🔄'}
                       </span>
                       <div className="font-bold text-sm text-gray-900 dark:text-gray-100">
                         {req.type === 'issue' ? `Reported Issue` : req.type === 'leave' ? `Leave Request` : req.type === 'off' ? `Off Day Request` : `Shift Switch (${SHIFT_INFO[req.requestedShift!]?.label || ''})`}
                       </div>
                    </div>
                    <div>
                      {req.status === 'pending' && <span className="bg-yellow-50 text-yellow-700 border border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-900/50 dark:text-yellow-400 px-2.5 py-1 rounded-full text-xs font-bold tracking-wide">PENDING</span>}
                      {req.status === 'approved' && <span className="bg-green-50 text-green-700 border border-green-200 dark:bg-green-900/20 dark:border-green-900/50 dark:text-green-400 px-2.5 py-1 rounded-full text-xs font-bold tracking-wide">APPROVED</span>}
                      {req.status === 'rejected' && <span className="bg-red-50 text-red-700 border border-red-200 dark:bg-red-900/20 dark:border-red-900/50 dark:text-red-400 px-2.5 py-1 rounded-full text-xs font-bold tracking-wide">REJECTED</span>}
                    </div>
                  </div>
                  <div className="text-xs text-gray-500 font-medium">Requested Date: <span className="text-gray-900 dark:text-gray-200">{req.date}</span></div>
                  {req.reason && <div className="text-xs text-gray-500 font-medium mt-1">Reason: <span className="text-gray-900 dark:text-gray-200">{req.reason}</span></div>}
                </div>
            ))}
          </div>
        )}
      </div>

      {/* Change Password Modal */}
      {passModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-gray-900 p-8 rounded-3xl max-w-sm w-full space-y-5 shadow-2xl animate-in zoom-in-95 duration-200">
            <h2 className="text-xl font-bold flex items-center gap-2">🔑 Change Password</h2>
            {passErr && <div className="text-sm text-red-600 font-medium bg-red-50 dark:bg-red-900/30 dark:text-red-400 p-3 rounded-xl border border-red-100 dark:border-red-900/50">{passErr}</div>}
            <div className="hidden">
              <input type="text" autoComplete="username" value={employeeUser?.employeeId || ''} readOnly />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1.5 text-gray-700 dark:text-gray-300">New Password</label>
              <input className="input" type="password" autoComplete="new-password" value={newPass} onChange={e => setNewPass(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1.5 text-gray-700 dark:text-gray-300">Confirm Password</label>
              <input className="input" type="password" autoComplete="new-password" value={confirmPass} onChange={e => setConfirmPass(e.target.value)} />
            </div>

            <div className="flex gap-3 pt-4">
              <button className="btn-primary flex-1 shadow-md shadow-teal-500/20" onClick={handleChangePassword} disabled={saving}>
                {saving ? 'Saving...' : 'Update Password'}
              </button>
              <button className="btn-ghost flex-1 border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800" onClick={() => { setPassModal(false); setPassErr(''); setNewPass(''); setConfirmPass(''); }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {reqDate && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-gray-900 p-8 rounded-3xl max-w-sm w-full space-y-5 shadow-2xl animate-in zoom-in-95 duration-200">
            <h2 className="text-xl font-bold">Request Change</h2>
            <p className="text-sm text-gray-500 font-medium">Requesting change for <strong className="text-teal-600 dark:text-teal-400">{reqDate}</strong>.</p>
            
            {localRequests[reqDate]?.status === 'pending' && (
              <div className="bg-yellow-50 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 p-3 rounded-xl border border-yellow-200 dark:border-yellow-900/50 text-sm font-medium">
                ⚠️ You already have a pending request for this date. Submitting again will overwrite it.
              </div>
            )}

            <div>
              <label className="block text-sm font-semibold mb-1.5 text-gray-700 dark:text-gray-300">Request Type</label>
              <select className="input font-medium" value={reqType} onChange={e => setReqType(e.target.value as 'off' | 'shift' | 'leave' | 'issue')}>
                <option value="off">🛌 Request Off Day</option>
                <option value="shift">🔄 Request Shift Switch</option>
                <option value="leave">✈️ Request Leave</option>
                <option value="issue">⚠️ Report Issue / Ticket</option>
              </select>
            </div>

            {(reqType === 'leave' || reqType === 'issue') && (
              <div className="animate-in slide-in-from-top-1 fade-in duration-200">
                <label className="block text-sm font-semibold mb-1.5 text-gray-700 dark:text-gray-300">
                  {reqType === 'issue' ? 'Describe the Problem (Required)' : 'Reason (Optional)'}
                </label>
                <textarea 
                  className="input min-h-[80px]" 
                  placeholder={reqType === 'issue' ? 'e.g., Odoo marked me as late but I was present...' : 'e.g., Sick, Vacation, etc.'} 
                  value={reqReason} 
                  onChange={e => setReqReason(e.target.value)} 
                />
              </div>
            )}

            {reqType === 'shift' && (
              <div className="animate-in slide-in-from-top-1 fade-in duration-200">
                <label className="block text-sm font-semibold mb-1.5 text-gray-700 dark:text-gray-300">Which shift?</label>
                <select className="input font-medium" value={reqShift} onChange={e => setReqShift(e.target.value as ShiftType)}>
                  <option value="morning">🌅 Morning</option>
                  <option value="evening">🌆 Evening</option>
                  <option value="night">🌙 Night</option>
                </select>
              </div>
            )}

            <div className="flex gap-3 pt-4">
              <button 
                className="btn-primary flex-1 shadow-md shadow-teal-500/20 disabled:opacity-50" 
                onClick={submitRequest} 
                disabled={saving || (reqType === 'issue' && !reqReason.trim())}
              >
                {saving ? 'Saving...' : 'Submit Request'}
              </button>
              <button className="btn-ghost flex-1 border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800" onClick={() => setReqDate(null)}>Cancel</button>
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

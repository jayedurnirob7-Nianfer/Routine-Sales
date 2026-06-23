'use client';
import { useEffect, useState, useCallback } from 'react';
import { getEmployees, saveEmployees, invalidateCache, getRoster, upsertAssignment, SHIFT_INFO, getAssignment } from '@/lib/store';
import { Employee, ShiftRequest, RosterData } from '@/types';
import { useAuth } from '@/lib/auth';
import { useRouter } from 'next/navigation';

export default function IssuesPage() {
  const { isAdmin } = useAuth();
  const router = useRouter();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'pending' | 'resolved'>('pending');
  const [roster, setRoster] = useState<RosterData>({});
  const [processingId, setProcessingId] = useState<string | null>(null);

  const load = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    setError(null);
    if (forceRefresh) invalidateCache();
    try {
      const [emps, ros] = await Promise.all([getEmployees(), getRoster()]);
      setEmployees(emps);
      setRoster(ros);
    } catch (e: any) {
      setError(`Failed to load data: ${e.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAdmin && isAdmin !== undefined) {
      router.push('/');
      return;
    }
    load();
  }, [load, isAdmin, router]);

  // Extract all requests
  const allRequests = employees.flatMap(emp => {
    if (!emp.requests) return [];
    return Object.values(emp.requests).map(r => ({ emp, req: r }));
  }).sort((a, b) => b.req.createdAt.localeCompare(a.req.createdAt));

  const pendingRequests = allRequests.filter(i => i.req.status === 'pending');
  const resolvedRequests = allRequests.filter(i => i.req.status !== 'pending');

  const displayRequests = activeTab === 'pending' ? pendingRequests : resolvedRequests;

  async function handleApprove(emp: Employee, req: ShiftRequest) {
    const id = `${emp.id}-${req.date}-approve`;
    setProcessingId(id);
    const isLeave = req.type === 'leave';
    
    if (req.type !== 'issue') {
      const newRoster = await upsertAssignment(roster, req.date, {
        employeeId: emp.id,
        shift: (req.type === 'off' || isLeave) ? 'off' : (req.requestedShift || 'morning'),
        effectiveFrom: req.date,
        effectiveTo: req.date,
        isOffDayOverride: true,
        reason: isLeave ? `LEAVE|${req.date}|${req.date}|${req.reason || 'Leave'}` : `Approved Request: ${req.type}`,
      });
      setRoster(newRoster);
    }

    invalidateCache();
    const freshEmps = await getEmployees();
    const e = freshEmps.find(x => x.id === emp.id);
    if (e && e.requests) {
      e.requests[req.date] = { ...e.requests[req.date], status: 'approved' };
      setEmployees(freshEmps);
      await saveEmployees(freshEmps);
    }
    setProcessingId(null);
  }

  async function handleReject(emp: Employee, req: ShiftRequest) {
    const id = `${emp.id}-${req.date}-reject`;
    setProcessingId(id);
    invalidateCache();
    const freshEmps = await getEmployees();
    const e = freshEmps.find(x => x.id === emp.id);
    if (e && e.requests) {
      e.requests[req.date] = { ...e.requests[req.date], status: 'rejected' };
      setEmployees(freshEmps);
      await saveEmployees(freshEmps);
    }
    setProcessingId(null);
  }

  async function handleDeleteRequest(emp: Employee, req: ShiftRequest) {
    if (!confirm('Are you sure you want to permanently delete this request?')) return;
    const id = `${emp.id}-${req.date}-delete`;
    setProcessingId(id);
    invalidateCache();
    const freshEmps = await getEmployees();
    const e = freshEmps.find(x => x.id === emp.id);
    if (e && e.requests) {
      delete e.requests[req.date];
      setEmployees(freshEmps);
      await saveEmployees(freshEmps);
    }
    setProcessingId(null);
  }

  function downloadRequestsCSV(type: 'all' | 'pending' | 'resolved') {
    let source = allRequests;
    if (type === 'pending') source = pendingRequests;
    if (type === 'resolved') source = resolvedRequests;

    if (source.length === 0) return;

    const headers = ['Employee ID', 'Name', 'Date', 'Type', 'Reason', 'Status', 'Submitted At'];
    const rows = source.map(({ emp, req }) => {
      const escapeCsv = (val: any) => {
        if (val == null) return '""';
        return `"${String(val).replace(/"/g, '""').replace(/\r?\n/g, ' | ')}"`;
      };
      
      let reasonStr = req.reason || '';
      
      if (req.type === 'shift') {
        if (req.reason && req.reason.startsWith('From:')) {
          reasonStr = `${req.reason} -> To: ${SHIFT_INFO[req.requestedShift as ShiftType]?.label || req.requestedShift}`;
        } else {
          let currentAssignment = getAssignment(roster, emp, req.date);
          let fromShiftStr = currentAssignment?.shift || emp.defaultShift || 'unknown';
          
          if (req.status === 'approved' && currentAssignment?.shift === req.requestedShift) {
             fromShiftStr = emp.defaultShift || 'unknown';
          }

          if (SHIFT_INFO[fromShiftStr as ShiftType]) {
            fromShiftStr = SHIFT_INFO[fromShiftStr as ShiftType].label;
          }
          let toShiftStr = req.requestedShift || 'unknown';
          if (SHIFT_INFO[toShiftStr as ShiftType]) {
            toShiftStr = SHIFT_INFO[toShiftStr as ShiftType].label;
          }
          reasonStr = `From: ${fromShiftStr} -> To: ${toShiftStr}`;
        }
      }

      return [
        escapeCsv(emp.employeeId || emp.id),
        escapeCsv(emp.name),
        escapeCsv(req.date),
        escapeCsv(req.type === 'issue' ? 'Reported Issue' : req.type === 'leave' ? 'Leave Request' : req.type === 'off' ? 'Off Day Request' : 'Shift Change Request'),
        escapeCsv(reasonStr),
        escapeCsv(req.status === 'pending' ? 'Pending' : 'Resolved'),
        escapeCsv(new Date(req.createdAt).toLocaleString())
      ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    const today = new Date().toISOString().split('T')[0];
    link.setAttribute('download', `${type}_requests_${today}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  if (!isAdmin) return null;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 border-b border-gray-200 dark:border-gray-800 pb-4">
        <h1 className="text-2xl font-bold">Requests & Issues</h1>
        <div className="flex items-center gap-3 w-full md:w-auto">
          <button className="btn-ghost text-xs border border-gray-200 dark:border-gray-700 w-full md:w-auto" onClick={() => load(true)}>
            ↻ Refresh
          </button>
          <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800/50 p-1 rounded-xl border border-gray-200 dark:border-gray-700">
            <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider pl-2 hidden sm:inline">Export CSV:</span>
            <button className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1.5 border-none shadow-sm" onClick={() => downloadRequestsCSV('pending')}>
              <span>📥</span> Pending
            </button>
            <button className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1.5 border-none shadow-sm" onClick={() => downloadRequestsCSV('resolved')}>
              <span>📥</span> Resolved
            </button>
            <button className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5 shadow-sm" onClick={() => downloadRequestsCSV('all')}>
              <span>📥</span> All
            </button>
          </div>
        </div>
      </div>

      <div className="flex gap-2 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl w-fit">
        <button 
          className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors ${activeTab === 'pending' ? 'bg-white dark:bg-gray-700 shadow-sm text-teal-600' : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'}`}
          onClick={() => setActiveTab('pending')}
        >
          Pending ({pendingRequests.length})
        </button>
        <button 
          className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors ${activeTab === 'resolved' ? 'bg-white dark:bg-gray-700 shadow-sm text-teal-600' : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'}`}
          onClick={() => setActiveTab('resolved')}
        >
          Resolved ({resolvedRequests.length})
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-center space-y-3">
            <div className="animate-spin text-4xl">⏳</div>
            <p className="text-gray-400 text-sm">Loading issues…</p>
          </div>
        </div>
      ) : error ? (
        <div className="card p-8 text-center border-none shadow-sm bg-red-50 dark:bg-red-900/10">
          <p className="text-red-500">{error}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {displayRequests.length === 0 ? (
            <div className="card p-12 text-center text-gray-400 border-none shadow-sm bg-gray-50 dark:bg-gray-800/40">
              <span className="text-4xl mb-4 block opacity-50">👍</span>
              No {activeTab} requests or issues found.
            </div>
          ) : (
            displayRequests.map(({ emp, req }) => {
              const isIssue = req.type === 'issue';
              return (
              <div key={`${emp.id}-${req.date}`} className={`card p-5 border-none shadow-sm bg-white dark:bg-gray-900 border-l-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:shadow-md transition-shadow ${isIssue ? 'border-l-red-500' : 'border-l-yellow-500'}`}>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold text-gray-900 dark:text-white">{emp.name}</span>
                    <span className="text-xs text-gray-400">({emp.employeeId})</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ml-2 ${isIssue ? 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400' : 'bg-yellow-50 text-yellow-600 dark:bg-yellow-900/20 dark:text-yellow-400'}`}>
                      {isIssue ? `Issue Date: ${req.date}` : `Request Date: ${req.date}`}
                    </span>
                  </div>
                  <div className={`text-sm mt-2 p-3 rounded-lg border shadow-inner ${isIssue ? 'bg-red-50/50 border-red-100 text-gray-700 dark:text-gray-300 dark:bg-red-900/10 dark:border-red-900/30' : 'bg-yellow-50/50 border-yellow-100 text-gray-700 dark:text-gray-300 dark:bg-yellow-900/10 dark:border-yellow-900/30'}`}>
                    {isIssue ? (
                      <>
                        <strong className="text-gray-800 dark:text-gray-200">Reported Issue:</strong> <br/>
                        {req.reason}
                      </>
                    ) : (
                      <>Requested <strong>{req.type === 'leave' ? `Leave${req.reason ? ` (${req.reason})` : ''}` : req.type === 'off' ? 'Off Day' : (SHIFT_INFO[req.requestedShift!]?.label || '') + ' Shift'}</strong> for <strong>{req.date}</strong></>
                    )}
                  </div>
                  <div className="text-xs text-gray-400 mt-2">
                    Submitted: {new Date(req.createdAt).toLocaleString()}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {activeTab === 'pending' ? (
                    <>
                      <button 
                        disabled={!!processingId}
                        className="btn-primary flex items-center justify-center gap-1 disabled:opacity-50 disabled:cursor-wait text-xs" 
                        onClick={() => handleApprove(emp, req)}
                      >
                        {processingId === `${emp.id}-${req.date}-approve` ? '⏳ Processing...' : isIssue ? '✅ Mark Resolved' : '✅ Approve'}
                      </button>
                      {!isIssue && (
                        <button 
                          disabled={!!processingId}
                          className="btn-secondary text-red-500 border-red-200 hover:bg-red-50 disabled:opacity-50 disabled:cursor-wait text-xs" 
                          onClick={() => handleReject(emp, req)}
                        >
                          {processingId === `${emp.id}-${req.date}-reject` ? '⏳...' : 'Reject'}
                        </button>
                      )}
                    </>
                  ) : (
                    <div className="px-4 py-2 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 font-bold rounded-xl text-sm flex items-center gap-2">
                      <span>✓</span> {req.status === 'approved' ? 'Approved' : 'Rejected'}
                    </div>
                  )}
                  <button 
                    disabled={!!processingId}
                    className="text-gray-400 hover:text-red-500 transition-colors p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50" 
                    onClick={() => handleDeleteRequest(emp, req)}
                    title="Delete"
                  >
                    {processingId === `${emp.id}-${req.date}-delete` ? '⏳' : '🗑️'}
                  </button>
                </div>
              </div>
            )})
          )}
        </div>
      )}
    </div>
  );
}

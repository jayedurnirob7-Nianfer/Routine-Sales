'use client';
import { useEffect, useState, useCallback } from 'react';
import { getEmployees, saveEmployees, invalidateCache, getRoster, upsertAssignment, SHIFT_INFO, getAssignment } from '@/lib/store';
import { Employee, ShiftRequest, RosterData } from '@/types';
import { useAuth } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import { ConfirmDialog } from '@/components/shared/Dialogs';

export default function IssuesPage() {
  const { isAdmin } = useAuth();
  const router = useRouter();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'handler_pending' | 'hr_pending' | 'resolved' | 'canceled'>('handler_pending');
  const [roster, setRoster] = useState<RosterData>({});
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [confirmConfig, setConfirmConfig] = useState<{ open: boolean; title: string; message: string; action: () => void; isDestructive?: boolean }>({ open: false, title: '', message: '', action: () => {} });

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

  const handlerPendingRequests = allRequests.filter(i => i.req.status === 'pending');
  const hrPendingRequests = allRequests.filter(i => i.req.status === 'handler_approved');
  const resolvedRequests = allRequests.filter(i => i.req.status === 'resolved' || i.req.status === 'approved');
  const canceledRequests = allRequests.filter(i => i.req.status === 'canceled' || i.req.status === 'rejected');

  const displayRequests = activeTab === 'handler_pending' ? handlerPendingRequests :
                          activeTab === 'hr_pending' ? hrPendingRequests :
                          activeTab === 'resolved' ? resolvedRequests : canceledRequests;

  async function handleApproveAll() {
    setProcessingId('approve-all');
    invalidateCache();
    const freshEmps = await getEmployees();
    let updatedRoster = { ...roster };
    let hasRosterChanges = false;
    let hasEmpChanges = false;
    
    for (const { emp, req } of handlerPendingRequests) {
      const e = freshEmps.find(x => x.id === emp.id);
      if (e && e.requests && e.requests[req.date] && e.requests[req.date].status === 'pending') {
        const isLeave = req.type === 'leave';
        let previousAssignment: import('@/types').ShiftAssignment | null = null;
        
        if (req.type !== 'issue') {
          previousAssignment = getAssignment(updatedRoster, emp, req.date) || null;
          const others = (updatedRoster[req.date] ?? []).filter(a => a.employeeId !== emp.id && a.employeeId !== emp.employeeId);
          updatedRoster[req.date] = [...others, {
            employeeId: emp.id,
            shift: (req.type === 'off' || isLeave) ? 'off' : (req.requestedShift || 'morning'),
            effectiveFrom: req.date,
            effectiveTo: req.date,
            isOffDayOverride: true,
            reason: isLeave ? `LEAVE|${req.date}|${req.date}|${req.reason || 'Leave'}` : `Approved Request: ${req.type}`,
          }];
          hasRosterChanges = true;
        }

        const newStatus = isLeave ? 'resolved' : 'handler_approved';
        e.requests[req.date] = { ...e.requests[req.date], status: newStatus, previousAssignment };
        hasEmpChanges = true;
      }
    }

    if (hasRosterChanges) {
      setRoster(updatedRoster);
      await import('@/lib/store').then(m => m.saveRoster(updatedRoster));
    }
    if (hasEmpChanges) {
      setEmployees(freshEmps);
      await saveEmployees(freshEmps);
    }
    setProcessingId(null);
  }

  async function handleHRApproveAll() {
    setProcessingId('hrapprove-all');
    invalidateCache();
    const freshEmps = await getEmployees();
    let hasEmpChanges = false;
    
    for (const { emp, req } of hrPendingRequests) {
      const e = freshEmps.find(x => x.id === emp.id);
      if (e && e.requests && e.requests[req.date] && e.requests[req.date].status === 'handler_approved') {
        e.requests[req.date] = { ...e.requests[req.date], status: 'resolved' };
        hasEmpChanges = true;
      }
    }
    
    if (hasEmpChanges) {
      setEmployees(freshEmps);
      await saveEmployees(freshEmps);
    }
    setProcessingId(null);
  }

  async function handleApprove(emp: Employee, req: ShiftRequest) {
    const id = `${emp.id}-${req.date}-approve`;
    setProcessingId(id);
    const isLeave = req.type === 'leave';
    let previousAssignment: import('@/types').ShiftAssignment | null = null;
    
    if (req.type !== 'issue') {
      previousAssignment = getAssignment(roster, emp, req.date) || null;
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
      const newStatus = isLeave ? 'resolved' : 'handler_approved';
      e.requests[req.date] = { ...e.requests[req.date], status: newStatus, previousAssignment };
      setEmployees(freshEmps);
      await saveEmployees(freshEmps);
    }
    setProcessingId(null);
  }

  async function handleHRApprove(emp: Employee, req: ShiftRequest) {
    const id = `${emp.id}-${req.date}-hrapprove`;
    setProcessingId(id);
    invalidateCache();
    const freshEmps = await getEmployees();
    const e = freshEmps.find(x => x.id === emp.id);
    if (e && e.requests) {
      e.requests[req.date] = { ...e.requests[req.date], status: 'resolved' };
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

  async function handleHRCancel(emp: Employee, req: ShiftRequest) {
    const id = `${emp.id}-${req.date}-hrcancel`;
    setProcessingId(id);
    
    if (req.type !== 'issue') {
      if (req.previousAssignment) {
        const newRoster = await upsertAssignment(roster, req.date, req.previousAssignment);
        setRoster(newRoster);
      } else {
        const others = (roster[req.date] || []).filter(a => a.employeeId !== emp.id && a.employeeId !== emp.employeeId);
        const newRoster = { ...roster, [req.date]: others };
        setRoster(newRoster);
        await import('@/lib/store').then(m => m.saveRoster(newRoster));
      }
    }

    invalidateCache();
    const freshEmps = await getEmployees();
    const e = freshEmps.find(x => x.id === emp.id);
    if (e && e.requests) {
      e.requests[req.date] = { ...e.requests[req.date], status: 'canceled' };
      setEmployees(freshEmps);
      await saveEmployees(freshEmps);
    }
    setProcessingId(null);
  }

  async function handleDeleteRequest(emp: Employee, req: ShiftRequest) {
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

  function downloadRequestsCSV(type: 'all' | 'handler_pending' | 'hr_pending' | 'resolved' | 'canceled') {
    let source = allRequests;
    if (type === 'handler_pending') source = handlerPendingRequests;
    if (type === 'hr_pending') source = hrPendingRequests;
    if (type === 'resolved') source = resolvedRequests;
    if (type === 'canceled') source = canceledRequests;

    if (source.length === 0) return;

    const headers = ['Employee ID', 'Name', 'Target Date', 'Assigned Shift', 'Type', 'Reason', 'Status', 'Date Applied'];
    const rows = source.map(({ emp, req }) => {
      const escapeCsv = (val: any) => {
        if (val == null) return '""';
        return `"${String(val).replace(/"/g, '""').replace(/\r?\n/g, ' | ')}"`;
      };
      
      let reasonStr = req.reason || '';
      
      let currentAssignment = getAssignment(roster, emp, req.date);
      let fromShiftStr = currentAssignment?.shift || emp.defaultShift || 'unknown';
      let currentShiftLabel = SHIFT_INFO[fromShiftStr as keyof typeof SHIFT_INFO]?.label || fromShiftStr;
      
      if (req.type === 'shift') {
        if (req.reason && req.reason.startsWith('From:')) {
          reasonStr = `${req.reason} -> To: ${SHIFT_INFO[req.requestedShift as keyof typeof SHIFT_INFO]?.label || req.requestedShift}`;
        } else {
          if (req.status === 'approved' && currentAssignment?.shift === req.requestedShift) {
             fromShiftStr = emp.defaultShift || 'unknown';
          }

          if (SHIFT_INFO[fromShiftStr as keyof typeof SHIFT_INFO]) {
            fromShiftStr = SHIFT_INFO[fromShiftStr as keyof typeof SHIFT_INFO].label;
          }
          let toShiftStr = req.requestedShift || 'unknown';
          if (SHIFT_INFO[toShiftStr as keyof typeof SHIFT_INFO]) {
            toShiftStr = SHIFT_INFO[toShiftStr as keyof typeof SHIFT_INFO].label;
          }
          reasonStr = `From: ${fromShiftStr} -> To: ${toShiftStr}`;
        }
      }

      return [
        escapeCsv(emp.employeeId || emp.id),
        escapeCsv(emp.name),
        escapeCsv(req.date),
        escapeCsv(currentShiftLabel),
        escapeCsv(req.type === 'issue' ? 'Reported Issue' : req.type === 'leave' ? 'Leave Request' : req.type === 'off' ? 'Off Day Request' : 'Shift Change Request'),
        escapeCsv(reasonStr),
        escapeCsv((req.status === 'pending' || req.status === 'handler_approved') ? 'Pending' : (req.status === 'canceled' || req.status === 'rejected') ? 'Canceled' : 'Resolved'),
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
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 pb-4">
        <div>
          <h1 className="text-2xl font-black bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-400 bg-clip-text text-transparent">Requests & Issues</h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 font-medium">Manage and export all employee shift and leave requests</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <button 
            className="flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/80 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow transition-all group active:scale-95"
            onClick={() => load(true)}
          >
            <svg className="w-3.5 h-3.5 text-gray-400 group-hover:text-teal-500 group-hover:rotate-180 transition-transform duration-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
          
          <div className="flex items-center bg-gray-100/80 dark:bg-gray-800/60 p-1.5 rounded-xl border border-gray-200/50 dark:border-gray-700/50 shadow-inner overflow-x-auto w-full md:w-auto">
            <div className="text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest px-3 hidden sm:flex items-center gap-1.5 shrink-0">
              <svg className="w-3 h-3 text-teal-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Export CSV
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button 
                className="px-3 py-1.5 text-xs font-bold rounded-lg bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 shadow-sm border border-gray-200 dark:border-gray-600 hover:text-blue-600 dark:hover:text-blue-400 hover:border-blue-300 dark:hover:border-blue-500/50 transition-all flex items-center gap-1.5 hover:shadow active:scale-95" 
                onClick={() => downloadRequestsCSV('handler_pending')}
              >
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" /> Pending Handler
              </button>
              <button 
                className="px-3 py-1.5 text-xs font-bold rounded-lg bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 shadow-sm border border-gray-200 dark:border-gray-600 hover:text-amber-600 dark:hover:text-amber-400 hover:border-amber-300 dark:hover:border-amber-500/50 transition-all flex items-center gap-1.5 hover:shadow active:scale-95" 
                onClick={() => downloadRequestsCSV('hr_pending')}
              >
                <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" /> Pending HR
              </button>
              <button 
                className="px-3 py-1.5 text-xs font-bold rounded-lg bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 shadow-sm border border-gray-200 dark:border-gray-600 hover:text-teal-600 dark:hover:text-teal-400 hover:border-teal-300 dark:hover:border-teal-500/50 transition-all flex items-center gap-1.5 hover:shadow active:scale-95" 
                onClick={() => downloadRequestsCSV('resolved')}
              >
                <div className="w-1.5 h-1.5 rounded-full bg-teal-500" /> Resolved
              </button>
              <button 
                className="px-3 py-1.5 text-xs font-bold rounded-lg bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 shadow-sm border border-gray-200 dark:border-gray-600 hover:text-red-600 dark:hover:text-red-400 hover:border-red-300 dark:hover:border-red-500/50 transition-all flex items-center gap-1.5 hover:shadow active:scale-95 hidden lg:flex" 
                onClick={() => downloadRequestsCSV('canceled')}
              >
                <div className="w-1.5 h-1.5 rounded-full bg-red-500" /> Canceled
              </button>
              <button 
                className="px-4 py-1.5 text-xs font-bold rounded-lg bg-gradient-to-r from-teal-500 to-emerald-500 text-white shadow-md hover:shadow-lg hover:-translate-y-0.5 hover:scale-105 transition-all flex items-center gap-1.5 border border-teal-400/50 active:scale-95" 
                onClick={() => downloadRequestsCSV('all')}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download All
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between w-full">
        <div className="flex flex-wrap gap-2 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl w-fit">
          <button 
            className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors ${activeTab === 'handler_pending' ? 'bg-white dark:bg-gray-700 shadow-sm text-teal-600' : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'}`}
            onClick={() => setActiveTab('handler_pending')}
          >
            Pending Handler ({handlerPendingRequests.length})
          </button>
          <button 
            className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors ${activeTab === 'hr_pending' ? 'bg-white dark:bg-gray-700 shadow-sm text-teal-600' : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'}`}
            onClick={() => setActiveTab('hr_pending')}
          >
            Pending HR ({hrPendingRequests.length})
          </button>
          <button 
            className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors ${activeTab === 'resolved' ? 'bg-white dark:bg-gray-700 shadow-sm text-teal-600' : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'}`}
            onClick={() => setActiveTab('resolved')}
          >
            Resolved ({resolvedRequests.length})
          </button>
          <button 
            className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors ${activeTab === 'canceled' ? 'bg-white dark:bg-gray-700 shadow-sm text-red-600' : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'}`}
            onClick={() => setActiveTab('canceled')}
          >
            Canceled / Rejected ({canceledRequests.length})
          </button>
        </div>

        {activeTab === 'handler_pending' && handlerPendingRequests.length > 0 && (
          <button 
            disabled={!!processingId}
            className="btn-primary text-xs flex items-center gap-2 bg-teal-500 hover:bg-teal-600 px-5 py-2.5 disabled:opacity-50 shadow-md hover:shadow-lg transition-all active:scale-95"
            onClick={() => setConfirmConfig({
              open: true,
              title: 'Accept All Requests',
              message: 'Are you sure you want to accept ALL pending requests and forward them to HR?',
              action: handleApproveAll
            })}
          >
            {processingId === 'approve-all' ? '⏳ Processing...' : '✅ Accept All (To HR)'}
          </button>
        )}
        {activeTab === 'hr_pending' && hrPendingRequests.length > 0 && (
          <button 
            disabled={!!processingId}
            className="btn-primary text-xs flex items-center gap-2 bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700 px-5 py-2.5 disabled:opacity-50 shadow-md hover:shadow-lg transition-all active:scale-95"
            onClick={() => setConfirmConfig({
              open: true,
              title: 'Final Approve All',
              message: 'Are you sure you want to final approve ALL pending HR requests? This will update the dashboard roster immediately.',
              action: handleHRApproveAll
            })}
          >
            {processingId === 'hrapprove-all' ? '⏳ Processing...' : '⭐ Final Approve All'}
          </button>
        )}
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
                  {activeTab === 'handler_pending' && (
                    <>
                      <button 
                        disabled={!!processingId}
                        className="btn-primary flex items-center justify-center gap-1 disabled:opacity-50 disabled:cursor-wait text-xs" 
                        onClick={() => handleApprove(emp, req)}
                      >
                        {processingId === `${emp.id}-${req.date}-approve` ? '⏳ Processing...' : isIssue ? '✅ Accept (To HR)' : '✅ Accept (To HR)'}
                      </button>
                      <button 
                        disabled={!!processingId}
                        className="px-4 py-2 rounded-lg text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/40 dark:text-red-400 transition-colors shadow-sm disabled:opacity-50 border border-red-200 dark:border-red-900/50 hover:shadow" 
                        onClick={() => handleReject(emp, req)}
                      >
                        {processingId === `${emp.id}-${req.date}-reject` ? '⏳...' : 'Reject'}
                      </button>
                    </>
                  )}
                  {activeTab === 'hr_pending' && (
                    <>
                      <button 
                        disabled={!!processingId}
                        className="btn-primary flex items-center justify-center gap-1 disabled:opacity-50 disabled:cursor-wait text-xs bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700" 
                        onClick={() => handleHRApprove(emp, req)}
                      >
                        {processingId === `${emp.id}-${req.date}-hrapprove` ? '⏳ Processing...' : '⭐ Final Approve'}
                      </button>
                      <button 
                        disabled={!!processingId}
                        className="px-4 py-2 rounded-lg text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/40 dark:text-red-400 transition-colors shadow-sm disabled:opacity-50 border border-red-200 dark:border-red-900/50 hover:shadow" 
                        onClick={() => handleHRCancel(emp, req)}
                        title="Cancel this request and revert any changes to the roster"
                      >
                        {processingId === `${emp.id}-${req.date}-hrcancel` ? '⏳...' : 'Cancel & Revert'}
                      </button>
                    </>
                  )}
                  {activeTab === 'resolved' && (
                    <div className="px-4 py-2 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 font-bold rounded-xl text-sm flex items-center gap-2">
                      <span>✓</span> HR Approved
                    </div>
                  )}
                  {activeTab === 'canceled' && (
                    <div className="px-4 py-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 font-bold rounded-xl text-sm flex items-center gap-2">
                      <span>✕</span> {req.status === 'canceled' ? 'Canceled by HR' : 'Rejected'}
                    </div>
                  )}
                  
                  <button 
                    disabled={!!processingId}
                    className="text-gray-400 hover:text-red-500 transition-colors p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 ml-2" 
                    onClick={() => handleDeleteRequest(emp, req)}
                    title="Delete Permanently"
                  >
                    {processingId === `${emp.id}-${req.date}-delete` ? '⏳' : '🗑️'}
                  </button>
                </div>
              </div>
            )})
          )}
        </div>
      )}
      <ConfirmDialog 
        open={confirmConfig.open}
        title={confirmConfig.title}
        message={confirmConfig.message}
        isDestructive={confirmConfig.isDestructive}
        onConfirm={() => {
          setConfirmConfig(prev => ({ ...prev, open: false }));
          confirmConfig.action();
        }}
        onCancel={() => setConfirmConfig(prev => ({ ...prev, open: false }))}
      />
    </div>
  );
}

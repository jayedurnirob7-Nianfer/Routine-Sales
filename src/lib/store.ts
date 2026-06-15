// ============================================================
//  src/lib/store.ts  —  Google Sheets backend
//
//  SETUP: Replace the placeholder below with your deployed
//  Google Apps Script Web App URL.
// ============================================================

import {
  Employee, RosterData, ShiftAssignment,
  ShiftInfo, ShiftType, SiteSettings, AdminCredentials,
} from '@/types';

// ─── 🔑  PASTE YOUR WEB APP URL HERE ────────────────────────
export const SHEET_API_URL =
  'https://script.google.com/macros/s/AKfycbyVLtvdweyOQuXep_eJ5Kqzbn9uJrTr5fiFaxlLX0w9u6u2UI2267XjAkg7JuhmvWBk/exec';
// ────────────────────────────────────────────────────────────

export const SHIFT_INFO: Record<ShiftType, ShiftInfo> = {
  morning: { type: 'morning', label: 'Morning', time: '7:00 AM – 3:30 PM',  color: 'text-amber-700',  bg: 'bg-amber-50',   border: 'border-amber-200'  },
  evening: { type: 'evening', label: 'Evening', time: '2:30 PM – 11:00 PM', color: 'text-blue-700',   bg: 'bg-blue-50',    border: 'border-blue-200'   },
  night:   { type: 'night',   label: 'Night',   time: '10:30 PM – 7:00 AM', color: 'text-purple-700', bg: 'bg-purple-50',  border: 'border-purple-200' },
  off:     { type: 'off',     label: 'Off Day', time: '—',                  color: 'text-gray-500',   bg: 'bg-gray-50',    border: 'border-gray-200'   },
};

export const WEEKDAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

const SEED_EMPLOYEES: Employee[] = [
  { id: 'e1', employeeId: '29001', name: 'Alice Rahman',  role: 'Sales Rep',    active: true,  createdAt: '2025-01-01' },
  { id: 'e2', employeeId: '29002', name: 'Boro Karim',    role: 'Senior Sales', active: true,  createdAt: '2025-01-01' },
  { id: 'e3', employeeId: '29003', name: 'Chandni Islam', role: 'Sales Rep',    active: true,  createdAt: '2025-01-01' },
  { id: 'e4', employeeId: '29004', name: 'Dipak Hossain', role: 'Team Lead',    active: true,  createdAt: '2025-01-01' },
  { id: 'e5', employeeId: '29005', name: 'Eva Begum',     role: 'Sales Rep',    active: false, createdAt: '2025-01-01' },
];

// ─── Normalise an employee row coming back from the sheet ───
// The Apps Script returns active as boolean already (normaliseEmployee runs server-side),
// but guard here too in case the seed path or a future change skips that.
function normaliseEmployeeClient(e: Record<string, unknown>): Employee {
  return {
    id:           String(e.id          ?? ''),
    employeeId:   String(e.employeeId  ?? ''),
    name:         String(e.name        ?? ''),
    role:         String(e.role        ?? ''),
    active:       e.active === true || e.active === 'TRUE',
    createdAt:    String(e.createdAt   ?? ''),
    weeklyOffDay: (e.weeklyOffDay !== undefined && e.weeklyOffDay !== '' && e.weeklyOffDay !== null)
                    ? Number(e.weeklyOffDay)
                    : undefined,
    defaultShift: (e.defaultShift && e.defaultShift !== '')
                    ? e.defaultShift as ShiftType
                    : undefined,
  };
}

// ─── Normalise a single roster assignment coming back from sheet ───
function normaliseAssignment(a: Record<string, unknown>): ShiftAssignment {
  return {
    employeeId:      String(a.employeeId      ?? ''),
    shift:           (a.shift as ShiftType)   ?? 'morning',
    effectiveFrom:   String(a.effectiveFrom   ?? ''),
    effectiveTo:     String(a.effectiveTo     ?? ''),
    reason:          (a.reason && a.reason !== '') ? String(a.reason) : undefined,
    isOffDayOverride: a.isOffDayOverride === true || a.isOffDayOverride === 'TRUE',
  };
}

// ─── Normalise the full roster map coming back from sheet ───
function normaliseRoster(raw: Record<string, unknown[]>): RosterData {
  const result: RosterData = {};
  for (const [date, assignments] of Object.entries(raw)) {
    if (!date || !Array.isArray(assignments)) continue;
    result[date] = assignments.map(a => normaliseAssignment(a as Record<string, unknown>));
  }
  return result;
}

let _cache: {
  employees: Employee[];
  roster: RosterData;
  settings: SiteSettings;
  auth: AdminCredentials;
} | null = null;

let _loadPromise: Promise<typeof _cache> | null = null;

async function apiGet<T = unknown>(params: Record<string, string>): Promise<T> {
  const url = new URL(SHEET_API_URL);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  // no-cache forces a fresh read from Google Sheets every time, bypassing
  // the browser's HTTP cache which can serve a stale Apps Script response.
  const res = await fetch(url.toString(), { cache: 'no-store' });
  const json = await res.json();
  if (json.status !== 'ok') throw new Error(json.message ?? 'API error');
  return json.data as T;
}

async function apiPost<T = unknown>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch(SHEET_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (json.status !== 'ok') throw new Error(json.message ?? 'API error');
  return json.data as T;
}

export async function loadAll(): Promise<NonNullable<typeof _cache>> {
  if (_cache) return _cache;
  if (_loadPromise) return _loadPromise as Promise<NonNullable<typeof _cache>>;

  _loadPromise = (async () => {
    try {
      const raw = await apiGet<{
        employees: Record<string, unknown>[];
        roster: Record<string, unknown[]>;
        settings: Record<string, string>;
        auth: Record<string, string>;
      }>({ action: 'getAll' });

      // ✅ FIX: always normalise every employee coming back from the sheet
      const rawEmps = Array.isArray(raw.employees) ? raw.employees : [];
      const employees: Employee[] = rawEmps.length > 0
        ? rawEmps.map(normaliseEmployeeClient)
        : SEED_EMPLOYEES;

      // ✅ FIX: normalise roster so booleans and optional fields are correct
      const roster: RosterData = raw.roster ? normaliseRoster(raw.roster) : {};

      const settings: SiteSettings = {
        siteName  : raw.settings?.siteName  ?? 'PXL_Sales_Routine',
        logoEmoji : raw.settings?.logoEmoji ?? '⬡',
        logoImage : raw.settings?.logoImage || undefined,
      };
      const auth: AdminCredentials = {
        username: raw.auth?.username ?? 'admin',
        password: raw.auth?.password ?? 'admin123',
      };

      if (rawEmps.length === 0) {
        await apiPost({ action: 'saveEmployees', employees });
      }

      _cache = { employees, roster, settings, auth };
      return _cache;
    } catch (e) {
      console.error('[store] loadAll failed:', e);
      // ✅ FIX: on error, clear the promise so the next call retries the network
      _loadPromise = null;
      _cache = {
        employees: SEED_EMPLOYEES,
        roster: {},
        settings: { siteName: 'PXL_Sales_Routine', logoEmoji: '⬡' },
        auth: { username: 'admin', password: 'admin123' },
      };
      return _cache;
    }
  })();

  return _loadPromise as Promise<NonNullable<typeof _cache>>;
}

// ✅ Clears both cache and the pending promise so the next read hits the sheet
export function invalidateCache() {
  _cache = null;
  _loadPromise = null;
}

export async function getEmployees(): Promise<Employee[]> {
  return (await loadAll()).employees;
}

export async function saveEmployees(employees: Employee[]): Promise<void> {
  // ✅ FIX: update cache optimistically, then persist
  if (_cache) _cache.employees = employees;
  await apiPost({ action: 'saveEmployees', employees });
}

export async function getRoster(): Promise<RosterData> {
  return (await loadAll()).roster;
}

export async function saveRoster(roster: RosterData): Promise<void> {
  // ✅ FIX: update cache optimistically, then persist
  if (_cache) _cache.roster = roster;
  await apiPost({ action: 'saveRoster', roster });
}

export async function getSiteSettings(): Promise<SiteSettings> {
  return (await loadAll()).settings;
}
export async function saveSiteSettings(settings: SiteSettings): Promise<void> {
  if (_cache) _cache.settings = settings;
  await apiPost({ action: 'saveSettings', settings });
}

export async function getAdminCreds(): Promise<AdminCredentials> {
  return (await loadAll()).auth;
}
export async function saveAdminCreds(creds: AdminCredentials): Promise<void> {
  if (_cache) _cache.auth = creds;
  await apiPost({ action: 'saveAuth', auth: creds });
}

export function getDateAssignments(roster: RosterData, date: string): ShiftAssignment[] {
  return roster[date] ?? [];
}

// ✅ FIX: does NOT save — caller is responsible for one final saveRoster()
// This prevents N API calls when looping over a date range.
export function upsertAssignmentLocal(
  roster: RosterData, date: string, assignment: ShiftAssignment,
): RosterData {
  const existing = (roster[date] ?? []).filter(a => a.employeeId !== assignment.employeeId);
  return { ...roster, [date]: [...existing, assignment] };
}

// Convenience: upsert a single assignment and immediately persist
export async function upsertAssignment(
  roster: RosterData, date: string, assignment: ShiftAssignment,
): Promise<RosterData> {
  const next = upsertAssignmentLocal(roster, date, assignment);
  await saveRoster(next);
  return next;
}

export async function removeAssignment(
  roster: RosterData, date: string, employeeId: string,
): Promise<RosterData> {
  const next = { ...roster, [date]: (roster[date] ?? []).filter(a => a.employeeId !== employeeId) };
  await saveRoster(next);
  return next;
}

export function getWeekdayDatesInMonth(year: number, month: number, weekday: number): string[] {
  const dates: string[] = [];
  const daysInMonth = new Date(year, month, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month - 1, d);
    if (date.getDay() === weekday) {
      dates.push(`${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`);
    }
  }
  return dates;
}

// ✅ FIX: accumulate all assignments locally, then ONE saveRoster at the end
export async function applyWeeklyOffDay(
  roster: RosterData, employee: Employee,
  newOffWeekday: number, year: number, month: number,
): Promise<RosterData> {
  const daysInMonth = new Date(year, month, 0).getDate();
  let updated = { ...roster };
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr  = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const weekday  = new Date(year, month - 1, d).getDay();
    const isOffDay = weekday === newOffWeekday;
    const existing = (updated[dateStr] ?? []).filter(a => a.employeeId !== employee.id);
    const assignment: ShiftAssignment = {
      employeeId:   employee.id,
      shift:        isOffDay ? 'off' : (employee.defaultShift ?? 'morning'),
      effectiveFrom: dateStr,
      effectiveTo:   dateStr,
    };
    // local-only update — no network call inside the loop
    updated = { ...updated, [dateStr]: [...existing, assignment] };
  }
  // ✅ single save after the loop
  await saveRoster(updated);
  return updated;
}

// ✅ FIX: accumulate locally, single save at the end
export async function overrideSingleDay(
  roster: RosterData, employee: Employee,
  date: string, newShift: ShiftType, reason?: string,
): Promise<RosterData> {
  return upsertAssignment(roster, date, {
    employeeId: employee.id, shift: newShift,
    effectiveFrom: date, effectiveTo: date, reason, isOffDayOverride: true,
  });
}

export function get15Days(startDate: string): string[] {
  return Array.from({ length: 15 }, (_, i) => {
    const [y, m, d] = startDate.split('-').map(Number);
    const date = new Date(y, m - 1, d + i);
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  });
}

export function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });
}

export function formatDateFull(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
}

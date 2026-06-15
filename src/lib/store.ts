// ============================================================
//  src/lib/store.ts  —  Google Sheets backend
// ============================================================

import {
  Employee, RosterData, ShiftAssignment,
  ShiftInfo, ShiftType, SiteSettings, AdminCredentials,
} from '@/types';

export const SHEET_API_URL =
  'https://script.google.com/macros/s/AKfycbyRarIsbzP1lrEOzrtOapLUspxMIPNtZTOVAPQh2K9eva4yPgNA0iIxgquf5vGBcBrY/exec';

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

type CacheType = {
  employees: Employee[];
  roster: RosterData;
  settings: SiteSettings;
  auth: AdminCredentials;
  loadedAt: number;
};

// FIX: TTL reduced to 10s so other browsers see updates quickly.
// The current browser always has the latest data in memory anyway
// (optimistic updates), so the short TTL only costs one extra
// network call per 10s on the saving browser — acceptable.
const CACHE_TTL_MS = 10_000;
let _cache: CacheType | null = null;
let _loadPromise: Promise<CacheType> | null = null;

function isCacheValid(): boolean {
  if (!_cache) return false;
  return Date.now() - _cache.loadedAt < CACHE_TTL_MS;
}

// ─── Debounced batch flush ────────────────────────────────────
const DEBOUNCE_MS = 1500;
const _dirtyDates = new Set<string>();
let _flushTimer: ReturnType<typeof setTimeout> | null = null;
let _flushPromise: Promise<void> | null = null;

function scheduleBatchFlush(): void {
  if (_flushTimer) clearTimeout(_flushTimer);
  _flushTimer = setTimeout(() => {
    _flushTimer = null;
    _flushPromise = _flushDirtyDates().finally(() => { _flushPromise = null; });
  }, DEBOUNCE_MS);
}

async function _flushDirtyDates(): Promise<void> {
  if (_dirtyDates.size === 0 || !_cache) return;
  const datesToFlush = [..._dirtyDates];
  _dirtyDates.clear();
  const partial: RosterData = {};
  for (const d of datesToFlush) partial[d] = _cache.roster[d] ?? [];
  try {
    await apiPost({ action: 'saveRosterDates', partial });
    // FIX: Don't expire cache after save — we already have correct data.
    // Other browsers will pick up changes within CACHE_TTL_MS (10s).
  } catch (e) {
    datesToFlush.forEach(d => _dirtyDates.add(d));
    console.error('[store] batch flush failed — will retry:', e);
    scheduleBatchFlush();
  }
}

export async function flushPendingSaves(): Promise<void> {
  if (_flushTimer) {
    clearTimeout(_flushTimer);
    _flushTimer = null;
    await _flushDirtyDates();
  } else if (_flushPromise) {
    await _flushPromise;
  }
}

// ─── API helpers ───────────────────────────────────────────────
async function apiGet<T = unknown>(params: Record<string, string>): Promise<T> {
  const url = new URL(SHEET_API_URL);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  // FIX: Cache-bust every request so the browser never serves a stale
  // response from its HTTP cache (Google Apps Script URLs are notorious
  // for being cached aggressively by browsers and CDNs).
  url.searchParams.set('_t', String(Date.now()));
  const res = await fetch(url.toString(), {
    cache: 'no-store',
    headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' },
  });
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

// ─── Load ──────────────────────────────────────────────────────
export async function loadAll(): Promise<CacheType> {
  if (isCacheValid()) return _cache!;
  if (_loadPromise) return _loadPromise;

  _loadPromise = (async (): Promise<CacheType> => {
    try {
      const raw = await apiGet<{
        employees: Employee[];
        roster: RosterData;
        settings: Record<string, string>;
        auth: Record<string, string>;
      }>({ action: 'getAll' });

      const employees: Employee[] = raw.employees.length > 0 ? raw.employees : SEED_EMPLOYEES;
      const roster: RosterData = raw.roster ?? {};
      const settings: SiteSettings = {
        siteName  : raw.settings?.siteName  ?? 'PXL_Sales_Routine',
        logoEmoji : raw.settings?.logoEmoji ?? '⬡',
        logoImage : raw.settings?.logoImage || undefined,
      };
      const auth: AdminCredentials = {
        username: raw.auth?.username ?? 'admin',
        password: raw.auth?.password ?? 'admin123',
      };

      if (raw.employees.length === 0) {
        await apiPost({ action: 'saveEmployees', employees });
      }

      _cache = { employees, roster, settings, auth, loadedAt: Date.now() };
      _loadPromise = null;
      return _cache;
    } catch (e) {
      console.error('[store] loadAll failed:', e);
      _loadPromise = null;
      if (_cache) return _cache; // return stale cache rather than crashing
      _cache = {
        employees: SEED_EMPLOYEES,
        roster: {},
        settings: { siteName: 'PXL_Sales_Routine', logoEmoji: '⬡' },
        auth: { username: 'admin', password: 'admin123' },
        loadedAt: Date.now(),
      };
      return _cache;
    }
  })();

  return _loadPromise;
}

// FIX: invalidateCache expires the TTL timestamp rather than nulling
// the cache object — this prevents a flash of empty data during refetch.
export function invalidateCache() {
  if (_cache) _cache.loadedAt = 0;
  _loadPromise = null;
}

// ─── Employees ─────────────────────────────────────────────────
export async function getEmployees(): Promise<Employee[]> {
  return (await loadAll()).employees;
}

export async function saveEmployees(employees: Employee[]): Promise<void> {
  if (_cache) _cache.employees = employees;
  await apiPost({ action: 'saveEmployees', employees });
  invalidateCache();
}

// ─── Roster ────────────────────────────────────────────────────
export async function getRoster(): Promise<RosterData> {
  return (await loadAll()).roster;
}

export async function saveRoster(roster: RosterData): Promise<void> {
  if (_cache) _cache.roster = roster;
  await apiPost({ action: 'saveRoster', roster });
  invalidateCache();
}

// ─── Settings / Auth ───────────────────────────────────────────
export async function getSiteSettings(): Promise<SiteSettings> {
  return (await loadAll()).settings;
}

export async function saveSiteSettings(settings: SiteSettings): Promise<void> {
  if (_cache) _cache.settings = settings;
  await apiPost({ action: 'saveSettings', settings });
  invalidateCache();
}

export async function getAdminCreds(): Promise<AdminCredentials> {
  return (await loadAll()).auth;
}

export async function saveAdminCreds(creds: AdminCredentials): Promise<void> {
  if (_cache) _cache.auth = creds;
  await apiPost({ action: 'saveAuth', auth: creds });
  invalidateCache();
}

// ─── Roster mutations (optimistic + debounced) ─────────────────
export function getDateAssignments(roster: RosterData, date: string): ShiftAssignment[] {
  return roster[date] ?? [];
}

export async function upsertAssignment(
  roster: RosterData,
  date: string,
  assignment: ShiftAssignment,
): Promise<RosterData> {
  const existing = (roster[date] ?? []).filter(a => a.employeeId !== assignment.employeeId);
  const next = { ...roster, [date]: [...existing, assignment] };
  // FIX: Update cache immediately so UI is instant
  if (_cache) _cache.roster = next;
  _dirtyDates.add(date);
  scheduleBatchFlush();
  return next;
}

export async function removeAssignment(
  roster: RosterData,
  date: string,
  employeeId: string,
): Promise<RosterData> {
  const next = { ...roster, [date]: (roster[date] ?? []).filter(a => a.employeeId !== employeeId) };
  if (_cache) _cache.roster = next;
  _dirtyDates.add(date);
  scheduleBatchFlush();
  return next;
}

// ─── Bulk operations ───────────────────────────────────────────
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

// FIX: applyWeeklyOffDay now does ONE full saveRoster call instead of
// queuing 30 dirty dates through saveRosterDates. For bulk operations
// that touch every date anyway, a single full write is faster than
// read-merge-write via the debounce path.
export async function applyWeeklyOffDay(
  roster: RosterData,
  employee: Employee,
  newOffWeekday: number,
  year: number,
  month: number,
): Promise<RosterData> {
  const daysInMonth = new Date(year, month, 0).getDate();
  let updated = { ...roster };

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr  = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const weekday  = new Date(year, month - 1, d).getDay();
    const isOffDay = weekday === newOffWeekday;
    const existing = (updated[dateStr] ?? []).filter(a => a.employeeId !== employee.id);
    const assignment: ShiftAssignment = {
      employeeId: employee.id,
      shift: isOffDay ? 'off' : (employee.defaultShift ?? 'morning'),
      effectiveFrom: dateStr,
      effectiveTo: dateStr,
    };
    updated = { ...updated, [dateStr]: [...existing, assignment] };
  }

  // Update cache instantly so UI reflects changes immediately
  if (_cache) _cache.roster = updated;

  // Cancel any pending debounced partial saves — we're doing a full save now
  if (_flushTimer) { clearTimeout(_flushTimer); _flushTimer = null; }
  _dirtyDates.clear();

  // Single full save for bulk operations
  await apiPost({ action: 'saveRoster', roster: updated });

  return updated;
}

export async function overrideSingleDay(
  roster: RosterData,
  employee: Employee,
  date: string,
  newShift: ShiftType,
  reason?: string,
): Promise<RosterData> {
  return upsertAssignment(roster, date, {
    employeeId: employee.id,
    shift: newShift,
    effectiveFrom: date,
    effectiveTo: date,
    reason,
    isOffDayOverride: true,
  });
}

// ─── Date utilities ────────────────────────────────────────────
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

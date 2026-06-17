export type ShiftType = 'morning' | 'evening' | 'night' | 'off';

export interface ShiftInfo {
  type: ShiftType;
  label: string;
  time: string;
  color: string;
  bg: string;
  border: string;
}

export interface Employee {
  id: string;
  name: string;
  employeeId: string;
  role: string;
  active: boolean;
  createdAt: string;
  weeklyOffDay?: number; 
  defaultShift?: ShiftType; 
}

export interface ShiftAssignment {
  employeeId: string;
  shift: ShiftType;
  effectiveFrom: string;
  effectiveTo: string;
  reason?: string;
  isOffDayOverride?: boolean;
}

export type RosterData = Record<string, ShiftAssignment[]>;

export interface SiteSettings {
  siteName: string;
  logoEmoji: string;
  logoImage?: string;
}

export interface AdminCredentials {
  username?: string;
  password?: string;
}

export interface LeaveRecord {
  employeeId: string;
  fromDate: string;
  toDate: string;
  reason?: string;
}

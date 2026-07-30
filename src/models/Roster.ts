import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IShiftAssignment {
  employeeId: string;
  shift: string;
  effectiveFrom: string;
  effectiveTo: string;
  reason?: string;
  isOffDayOverride?: boolean;
}

export interface IRoster extends Document {
  date: string; // The date string e.g. "2024-01-01"
  assignments: IShiftAssignment[];
}

const ShiftAssignmentSchema = new Schema<IShiftAssignment>({
  employeeId: { type: String, required: true },
  shift: { type: String, required: true },
  effectiveFrom: { type: String, required: true },
  effectiveTo: { type: String, required: true },
  reason: { type: String },
  isOffDayOverride: { type: Boolean, default: false },
}, { _id: false });

const RosterSchema = new Schema<IRoster>({
  date: { type: String, required: true, unique: true },
  assignments: { type: [ShiftAssignmentSchema], default: [] },
});

export const Roster: Model<IRoster> = mongoose.models.Roster || mongoose.model<IRoster>('Roster', RosterSchema);

import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IEmployee extends Document {
  id: string;
  name: string;
  employeeId: string;
  role: string;
  active: boolean;
  createdAt: string;
  weeklyOffDay?: number;
  defaultShift?: string;
  profileImage?: string;
  password?: string;
  requests?: any; // Record<string, ShiftRequest> stored as mixed
}

const EmployeeSchema = new Schema<IEmployee>({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  employeeId: { type: String, required: true },
  role: { type: String, required: true },
  active: { type: Boolean, default: true },
  createdAt: { type: String, required: true },
  weeklyOffDay: { type: Number },
  defaultShift: { type: String },
  profileImage: { type: String },
  password: { type: String },
  requests: { type: Schema.Types.Mixed },
});

// Since Next.js API routes are serverless, we must check if the model already exists.
export const Employee: Model<IEmployee> = mongoose.models.Employee || mongoose.model<IEmployee>('Employee', EmployeeSchema);

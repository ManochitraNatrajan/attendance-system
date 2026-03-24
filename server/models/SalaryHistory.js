import mongoose from 'mongoose';

const salaryHistorySchema = new mongoose.Schema({
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
  month: { type: String, required: true }, 
  totalDays: { type: Number, default: 0 },
  monthlySalary: { type: Number, default: 0 },
  baseSalary: { type: Number, default: 0 },
  bonus: { type: Number, default: 0 },
  deductions: { type: Number, default: 0 },
  travelExpense: { type: Number, default: 0 },
  foodExpense: { type: Number, default: 0 },
  netSalary: { type: Number, default: 0 },
  isPaid: { type: Boolean, default: false }
}, { timestamps: true });

salaryHistorySchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    ret.employeeId = ret.employeeId.toString();
    delete ret._id;
  }
});

export default mongoose.model('SalaryHistory', salaryHistorySchema);

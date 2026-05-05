import mongoose from 'mongoose';

const salaryArchiveSchema = new mongoose.Schema({
  employeeName: { type: String, required: true },
  month: { type: String, required: true }, // Format "YYYY-MM"
  totalWorkingDays: { type: Number, default: 0 },
  totalWorkingHours: { type: Number, default: 0 },
  finalSalary: { type: Number, default: 0 }
}, { timestamps: true });

salaryArchiveSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
  }
});

export default mongoose.model('SalaryArchive', salaryArchiveSchema);

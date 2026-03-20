import mongoose from 'mongoose';

const employeeSchema = new mongoose.Schema({
  name: { type: String, required: true },
  role: { type: String, required: true },
  contact: { type: String, required: true },
  password: { type: String, required: true },
  monthlySalary: { type: Number, default: 0 },
  dailyWage: { type: Number, default: 0 }
}, { timestamps: true });

employeeSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
  }
});

export default mongoose.model('Employee', employeeSchema);

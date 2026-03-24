import mongoose from 'mongoose';

const attendanceSchema = new mongoose.Schema({
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
  date: { type: String, required: true }, 
  checkIn: { type: String }, 
  checkOut: { type: String, default: null }, 
  status: { type: String, default: 'Pending' }, 
  checkInLocation: {
    lat: Number,
    lng: Number
  },
  checkOutLocation: {
    lat: Number,
    lng: Number
  },
  currentLocation: { 
    lat: Number,
    lng: Number,
    timestamp: Date
  },
  locationHistory: [{
    lat: Number,
    lng: Number,
    timestamp: Date
  }],
  distanceTraveled: { type: Number, default: 0 },
  travelExpense: { type: Number, default: 0 },
  foodExpense: { type: Number, default: 0 },
  checkInLocationName: { type: String, default: '' },
  checkOutLocationName: { type: String, default: '' },
  workDetails: [{ type: String }]
}, { timestamps: true });

attendanceSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    ret.employeeId = ret.employeeId.toString();
    delete ret._id;
  }
});

export default mongoose.model('Attendance', attendanceSchema);

import mongoose from 'mongoose';

const attendanceSchema = new mongoose.Schema({
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
  date: { type: String, required: true }, 
  checkIn: { type: String }, 
  checkOut: { type: String, default: null }, 
  checkoutType: { type: String, enum: ['manual', 'auto'], default: null },
  isCheckedOut: { type: Boolean, default: false },
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
  workDetails: [{ type: String }],
  routeTracking: {
    startedAt: Date,
    endedAt: Date,
    startLocation: { latitude: Number, longitude: Number, city: String, timestamp: Date },
    endLocation: { latitude: Number, longitude: Number, city: String, timestamp: Date },
    locations: [{ latitude: Number, longitude: Number, city: String, timestamp: Date }],
    stopPoints: [
      {
        city: String,
        latitude: Number,
        longitude: Number,
        startTime: Date,
        endTime: Date,
        durationMinutes: Number
      }
    ],
    totalDistanceKm: { type: Number, default: 0 }
  }
}, { timestamps: true });

attendanceSchema.index({ date: 1, employeeId: 1 });
attendanceSchema.index({ checkIn: 1 });
attendanceSchema.index({ 'routeTracking.startedAt': 1 });

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

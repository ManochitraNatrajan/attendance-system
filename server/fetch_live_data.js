import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

const employeeSchema = new mongoose.Schema({}, { strict: false });
const Employee = mongoose.model('Employee', employeeSchema);

const attendanceSchema = new mongoose.Schema({}, { strict: false });
const Attendance = mongoose.model('Attendance', attendanceSchema);

async function run() {
  try {
    let records = [];
    let employees = [];

    try {
      const res = await fetch('https://attendance-system-4-blz0.onrender.com/api/attendance');
      if (res.ok) {
        records = await res.json();
      }
    } catch (apiErr) {
      console.log("Live API fetch failed, attempting direct MongoDB fallback...", apiErr.message);
    }

    if (records.length === 0 && process.env.MONGODB_URI) {
      await mongoose.connect(process.env.MONGODB_URI);
      const Employee = mongoose.model('Employee', new mongoose.Schema({}, { strict: false }));
      const Attendance = mongoose.model('Attendance', new mongoose.Schema({}, { strict: false }));
      employees = await Employee.find().lean();
      records = await Attendance.find().sort({ createdAt: -1 }).lean();
    }

    const nowIST = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    const todayStr = nowIST.toISOString().split('T')[0];

    const todayRecords = records.filter(r => r.date === todayStr);
    const activeRecords = todayRecords.filter(r => !r.isCheckedOut || !r.checkOut || r.checkOut === '-' || r.checkOut === '');

    const output = {
      todayDate: todayStr,
      currentlyActiveSessionsCount: activeRecords.length,
      currentlyActiveSessions: activeRecords.map(a => ({
        id: a._id || a.id,
        employeeName: a.employeeName || 'Unknown',
        role: a.role || '',
        checkIn: a.checkIn || '-',
        checkOut: a.checkOut || 'Currently Active (Running)',
        status: a.status || 'Present',
        location: a.checkInLocationName || (a.currentLocation ? `${a.currentLocation.lat}, ${a.currentLocation.lng}` : '-'),
        currentLocation: a.currentLocation ? `${a.currentLocation.lat}, ${a.currentLocation.lng}` : null,
        distanceTraveled: a.distanceTraveled || 0,
        travelExpense: a.travelExpense || 0,
        foodExpense: a.foodExpense || 0,
        workDetails: (a.workDetails || []).filter(w => w && w.trim())
      })),
      todayTotalRecordsCount: todayRecords.length,
      todayTotalRecords: todayRecords.map(a => ({
        id: a._id || a.id,
        employeeName: a.employeeName || 'Unknown',
        role: a.role || '',
        checkIn: a.checkIn || '-',
        checkOut: a.checkOut || 'Currently Active (Running)',
        status: a.status || 'Present',
        isCheckedOut: a.isCheckedOut,
        location: a.checkInLocationName || '-',
        distanceTraveled: a.distanceTraveled || 0,
        travelExpense: a.travelExpense || 0,
        foodExpense: a.foodExpense || 0,
        workDetails: (a.workDetails || []).filter(w => w && w.trim())
      }))
    };

    console.log("===CURRENTLY_ACTIVE_DATA_START===");
    console.log(JSON.stringify(output, null, 2));
    console.log("===CURRENTLY_ACTIVE_DATA_END===");

  } catch (err) {
    console.error("Error fetching currently active data:", err);
  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    process.exit(0);
  }
}

run();

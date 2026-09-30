import mongoose from 'mongoose';
import 'dotenv/config';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Minimal schemas to fetch all data
const employeeSchema = new mongoose.Schema({}, { strict: false });
const Employee = mongoose.model('Employee', employeeSchema);

const attendanceSchema = new mongoose.Schema({}, { strict: false });
const Attendance = mongoose.model('Attendance', attendanceSchema);

const salaryHistorySchema = new mongoose.Schema({}, { strict: false });
const SalaryHistory = mongoose.model('SalaryHistory', salaryHistorySchema);

const salaryArchiveSchema = new mongoose.Schema({}, { strict: false });
const SalaryArchive = mongoose.model('SalaryArchive', salaryArchiveSchema);

const geofenceZoneSchema = new mongoose.Schema({}, { strict: false });
const GeofenceZone = mongoose.model('GeofenceZone', geofenceZoneSchema);

async function exportData() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected!');

    const data = {
      employees: await Employee.find().lean(),
      attendance: await Attendance.find().lean(),
      salaryHistory: await SalaryHistory.find().lean(),
      salaryArchive: await SalaryArchive.find().lean(),
      geofenceZones: await GeofenceZone.find().lean()
    };

    const backupPath = path.join(__dirname, 'data', 'backup.json');
    await fs.writeFile(backupPath, JSON.stringify(data, null, 2));
    console.log(`Backup successfully saved to ${backupPath}`);
    console.log(`Exported ${data.employees.length} employees, ${data.attendance.length} attendance records.`);

  } catch (err) {
    console.error('Error exporting data:', err);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

exportData();

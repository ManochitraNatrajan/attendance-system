import express from 'express';
import cors from 'cors';
import compression from 'compression';
import { format } from 'date-fns';
import nodemailer from 'nodemailer';
import 'dotenv/config';
import PDFDocument from 'pdfkit';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';
import { Server } from 'socket.io';
import cron from 'node-cron';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// =======================
// === MONGODB SCHEMAS ===
// =======================
const employeeSchema = new mongoose.Schema({
  name: { type: String, required: true },
  role: { type: String, required: true },
  contact: { type: String, required: true, index: true },
  password: { type: String, required: true },
  monthlySalary: { type: Number, default: 0 },
  dailyWage: { type: Number, default: 0 }
}, { timestamps: true });
employeeSchema.set('toJSON', { virtuals: true, versionKey: false, transform: (d, r) => { r.id = r._id.toString(); delete r._id; }});
const Employee = mongoose.model('Employee', employeeSchema);

const attendanceSchema = new mongoose.Schema({
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
  date: { type: String, required: true, index: true }, 
  checkIn: { type: String }, 
  checkOut: { type: String, default: null }, 
  checkoutType: { type: String, enum: ['manual', 'auto'], default: null },
  isCheckedOut: { type: Boolean, default: false },
  status: { type: String, default: 'Pending' }, 
  checkInLocation: { lat: Number, lng: Number },
  checkInLocationName: { type: String, default: '' },
  checkOutLocation: { lat: Number, lng: Number },
  checkOutLocationName: { type: String, default: '' },
  currentLocation: { lat: Number, lng: Number, timestamp: Date },
  locationHistory: [{ lat: Number, lng: Number, timestamp: Date }],
  distanceTraveled: { type: Number, default: 0 },
  travelExpense: { type: Number, default: 0 },
  foodExpense: { type: Number, default: 0 },
  workDetails: [{ type: String }],
  routeTracking: {
    startedAt: Date,
    endedAt: Date,
    startLocation: { latitude: Number, longitude: Number, city: String, timestamp: Date },
    endLocation: { latitude: Number, longitude: Number, city: String, timestamp: Date },
    locations: [{ latitude: Number, longitude: Number, city: String, timestamp: Date, isRepeat: { type: Boolean, default: false } }],
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
    geofenceEvents: [
      {
        zoneName: String,
        action: String, // 'ENTER' or 'EXIT'
        timestamp: Date
      }
    ],
    sessionCount: { type: Number, default: 0 },
    totalDistanceKm: { type: Number, default: 0 },
    totalTravelMinutes: { type: Number, default: 0 },
    totalStopMinutes: { type: Number, default: 0 }
  }
}, { timestamps: true });
attendanceSchema.index({ date: 1, employeeId: 1 });
attendanceSchema.index({ checkIn: 1 });
attendanceSchema.index({ 'routeTracking.startedAt': 1 });
attendanceSchema.set('toJSON', { virtuals: true, versionKey: false, transform: (d, r) => { r.id = r._id.toString(); r.employeeId = r.employeeId.toString(); delete r._id; }});
const Attendance = mongoose.model('Attendance', attendanceSchema);

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
salaryHistorySchema.index({ employeeId: 1, month: -1 });
salaryHistorySchema.set('toJSON', { virtuals: true, versionKey: false, transform: (d, r) => { r.id = r._id.toString(); r.employeeId = r.employeeId.toString(); delete r._id; }});
const SalaryHistory = mongoose.model('SalaryHistory', salaryHistorySchema);

const geofenceZoneSchema = new mongoose.Schema({
  name: { type: String, required: true },
  latitude: { type: Number, required: true },
  longitude: { type: Number, required: true },
  radius: { type: Number, default: 100 } // radius in meters
}, { timestamps: true });
geofenceZoneSchema.set('toJSON', { virtuals: true, versionKey: false, transform: (d, r) => { r.id = r._id.toString(); delete r._id; }});
const GeofenceZone = mongoose.model('GeofenceZone', geofenceZoneSchema);
// =======================

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});
app.locals.io = io;

io.on('connection', (socket) => {
  console.log('Client connected for live tracking:', socket.id);
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/attendance_system';

mongoose.connect(MONGODB_URI)
  .then(async () => {
    console.log('Connected to MongoDB');
    
    // Force close old sessions that weren't closed properly
    const forceCloseOldSessions = async () => {
      const nowIST = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Kolkata"}));
      const today = format(nowIST, 'yyyy-MM-dd');
      
      const unclosedSessions = await Attendance.find({ date: { $ne: today }, checkOut: null });
      if (unclosedSessions.length > 0) {
        console.log(`Found ${unclosedSessions.length} unclosed old sessions. Auto-closing them.`);
        for (const session of unclosedSessions) {
          if (session.isCheckedOut) continue;
          session.checkOut = "23:59:00";
          session.checkoutType = "auto";
          session.isCheckedOut = true;
          session.status = "Auto Closed";
          if (session.routeTracking && !session.routeTracking.endedAt) {
             session.routeTracking.endedAt = new Date(`${session.date}T23:59:00+05:30`);
          }
          await session.save();
        }
      }
    };
    await forceCloseOldSessions();

    const adminExists = await Employee.countDocuments();
    if (adminExists === 0) {
      await Employee.create({
        name: 'Balakrishnan',
        role: 'Admin',
        contact: 'admin@dairy.com',
        password: 'pass',
        monthlySalary: 30000,
        dailyWage: 0
      });
      console.log('Default admin created.');
    }
  })
  .catch(err => console.error('MongoDB connection error:', err));

// Auto Checkout Cron Job at 11:59 PM EVERY DAY
cron.schedule('59 23 * * *', async () => {
  console.log("Running Auto-checkout CRON Job at 11:59 PM...");
  try {
    const nowIST = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Kolkata"}));
    const today = format(nowIST, 'yyyy-MM-dd');
    
    const unclosedAttendances = await Attendance.find({ date: today, checkOut: null });
    
    for (const record of unclosedAttendances) {
      if (record.isCheckedOut) continue;
      record.checkOut = "23:59:00";
      record.checkoutType = "auto";
      record.isCheckedOut = true;
      const checkInTime = record.checkIn;
      const inDate = new Date(`1970-01-01T${checkInTime}Z`);
      const outDate = new Date(`1970-01-01T23:59:00Z`);
      const diffHours = (outDate - inDate) / (1000 * 60 * 60);
      
      record.status = 'Auto Closed'; // Keep it Auto Closed but effectively treated by payroll depending on diffHours
      
      if (record.routeTracking && !record.routeTracking.endedAt) {
          const lastLoc = record.routeTracking.locations.length > 0 ? record.routeTracking.locations[record.routeTracking.locations.length - 1] : null;
          record.routeTracking.endedAt = new Date(`${today}T23:59:00+05:30`);
          if (lastLoc) {
            record.routeTracking.endLocation = {
               latitude: lastLoc.latitude,
               longitude: lastLoc.longitude,
               city: lastLoc.city || '',
               timestamp: new Date(`${today}T23:59:00+05:30`)
            };
          }
      }
      if (req.app.locals.io) {
        req.app.locals.io.emit('employee-check-out', { employeeId: record.employeeId.toString() });
      }
      await record.save();
      console.log(`Auto closed attendance for Employee: ${record.employeeId}`);
    }
    
    // Auto mark Absent for full day missing
    const allEmployees = await Employee.find();
    for (const emp of allEmployees) {
      const isPresent = await Attendance.findOne({ employeeId: emp._id, date: today });
      if (!isPresent) {
         await Attendance.create({
            employeeId: emp._id,
            date: today,
            checkIn: '-',
            checkOut: '-',
            status: 'Absent'
         });
         console.log(`Auto marked absent: ${emp.name}`);
      }
    }
    
  } catch(e) {
     console.error("Error running auto-checkout cron job:", e);
  }
}, {
  scheduled: true,
  timezone: "Asia/Kolkata"
});

app.use(cors());
app.use(compression());
app.use(express.json());

// === Caching & OTP Storage ===
const employeeCache = { data: null, lastFetched: 0 };
const CACHE_TTL = 30000; // 30 seconds
const invalidateEmployeeCache = () => { employeeCache.data = null; employeeCache.lastFetched = 0; };
const otpStore = new Map();
let etherealTransporter = null;
const getTransporter = async () => {
  if (etherealTransporter) return etherealTransporter;
  if (process.env.SMTP_USER && process.env.SMTP_PASS) {
    etherealTransporter = nodemailer.createTransport({
      service: process.env.SMTP_SERVICE || 'gmail',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });
    return etherealTransporter;
  }
  const testAccount = await nodemailer.createTestAccount();
  console.log("Created Ethereal Test Email Account.");
  etherealTransporter = nodemailer.createTransport({
    host: "smtp.ethereal.email",
    port: 587,
    secure: false,
    auth: { user: testAccount.user, pass: testAccount.pass },
    tls: { rejectUnauthorized: false }
  });
  return etherealTransporter;
};

// === Auth & Utility API ===
app.get('/api/time', (req, res) => {
  res.json({ serverTime: Date.now() });
});

app.get('/api/health', (req, res) => {
  const isConnected = mongoose.connection.readyState === 1;
  res.json({ status: isConnected ? 'online' : 'database_disconnected' });
});

app.post('/api/login', async (req, res) => {
  try {
    const { contact, password } = req.body;
    
    // Diagnostic logging for login issues
    const isConn = mongoose.connection.readyState === 1;
    if (!isConn) console.error("LOGIN FAILED: Database not connected!");

    const user = await Employee.findOne({ contact }).lean();
    
    if (user && (user.password === password || (!user.password && password === '123456'))) {
      const plain = user;
      plain.id = plain._id.toString();
      res.json({ success: true, user: plain });
    } else {
      res.status(401).json({ success: false, message: 'Invalid credentials. User not found.' });
    }
  } catch (err) {
    console.error("LOGIN ERROR:", err);
    res.status(500).json({ message: 'Server error: ' + (err.message || 'unknown') });
  }
});

// === Employee API ===
app.get('/api/employees', async (req, res) => {
  try {
    const now = Date.now();
    if (employeeCache.data && (now - employeeCache.lastFetched < CACHE_TTL)) {
      return res.json(employeeCache.data);
    }
    const users = (await Employee.find().lean()).map(u => ({ ...u, id: u._id.toString() }));
    employeeCache.data = users;
    employeeCache.lastFetched = now;
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

app.post('/api/employees/send-otp', async (req, res) => {
  const { contact, name } = req.body;
  if (!contact) return res.status(400).json({ message: 'Contact email is required.' });
  
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  otpStore.set(contact, { otp, expiresAt: Date.now() + 5 * 60 * 1000 });
  
  try {
    const transporter = await getTransporter();
    const info = await transporter.sendMail({
      from: '"Sri Krishna Milk Dairy" <noreply@krishnadairy.com>',
      to: contact,
      subject: "Admin Registration - Your OTP Code",
      text: `Hello ${name || 'Employee'},\n\nYour secure OTP to verify this registration is: ${otp}\n\nIt is valid for 5 minutes.`,
      html: `<b>Hello ${name || 'Employee'},</b><br/><br/>Your secure OTP to verify this registration is: <b style="font-size:20px; color:indigo;">${otp}</b><br/><br/>It is valid for 5 minutes.`
    });
    const previewUrl = nodemailer.getTestMessageUrl(info);
    res.json({ success: true, previewUrl });
  } catch (err) {
    console.error("OTP send failure:", err);
    res.status(500).json({ message: 'Failed to send OTP email.' });
  }
});

app.post('/api/employees/verify-otp', (req, res) => {
  const { contact, otp } = req.body;
  const record = otpStore.get(contact);
  
  if (!record) return res.status(400).json({ message: 'No OTP found or it has expired.' });
  if (Date.now() > record.expiresAt) {
    otpStore.delete(contact);
    return res.status(400).json({ message: 'OTP has expired.' });
  }
  if (record.otp === otp) {
    otpStore.delete(contact);
    return res.json({ success: true, message: 'OTP verified.' });
  }
  return res.status(400).json({ message: 'Invalid OTP.' });
});

app.post('/api/employees', async (req, res) => {
  try {
    const emp = await Employee.create({
      name: req.body.name,
      role: req.body.role,
      contact: req.body.contact,
      dailyWage: Number(req.body.dailyWage) || 0,
      monthlySalary: Number(req.body.monthlySalary) || 0,
      password: req.body.password || '123456',
    });
    
    invalidateEmployeeCache();
    
    res.status(201).json(emp);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

app.put('/api/employees/:id', async (req, res) => {
  try {
    const updateData = { ...req.body };
    if (updateData.dailyWage) updateData.dailyWage = Number(updateData.dailyWage);
    if (!updateData.password) delete updateData.password;
    
    const emp = await Employee.findByIdAndUpdate(req.params.id, updateData, { new: true });
    if (!emp) return res.status(404).json({ message: 'Employee not found' });
    
    invalidateEmployeeCache();
    
    res.json(emp);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

app.delete('/api/employees/:id', async (req, res) => {
  try {
    await Employee.findByIdAndDelete(req.params.id);
    await Attendance.deleteMany({ employeeId: req.params.id });
    await SalaryHistory.deleteMany({ employeeId: req.params.id });
    
    invalidateEmployeeCache();
    
    res.json({ message: 'Employee deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// === Attendance API ===
app.get('/api/attendance', async (req, res) => {
  try {
    const { date, employeeId, page, limit } = req.query;
    let query = {};
    if (date) query.date = date;
    if (employeeId) query.employeeId = employeeId;
    
    if (!date && !employeeId) {
      const thirtyDaysAgoStr = new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0];
      query.date = { $gte: thirtyDaysAgoStr };
    }
    
    let qBuilder = Attendance.find(query).populate('employeeId').select('-locationHistory -routeTracking').sort({ date: -1, checkIn: -1 });
    
    if (page || limit) {
      const pg = parseInt(page) || 1;
      const lmt = parseInt(limit) || 20;
      qBuilder = qBuilder.skip((pg - 1) * lmt).limit(lmt);
    }
    
    const records = await qBuilder.lean();
    
    const enrichedRecords = records.map(r => ({
      ...r,
      id: r._id.toString(),
      employeeName: r.employeeId ? r.employeeId.name : 'Unknown',
      role: r.employeeId ? r.employeeId.role : 'Unknown',
      employeeId: r.employeeId ? r.employeeId._id.toString() : null
    }));
    
    res.json(enrichedRecords);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

app.get('/api/attendance/:id', async (req, res) => {
  try {
    const record = await Attendance.findById(req.params.id).populate('employeeId').lean();
    if (!record) return res.status(404).json({ message: 'Record not found' });
    res.json(record);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

app.post('/api/attendance/check-in', async (req, res) => {
  try {
    const { employeeId, latitude, longitude, locationName } = req.body;
    const nowIST = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Kolkata"}));
    const today = format(nowIST, 'yyyy-MM-dd');
    const nowTime = format(nowIST, 'HH:mm:ss');
    
    const existingRecord = await Attendance.findOne({ employeeId, date: today });
    if (existingRecord) {
      return res.status(400).json({ message: 'Already checked in today' });
    }

    const newRecord = await Attendance.create({
      employeeId,
      date: today,
      checkIn: nowTime,
      checkOut: null,
      status: 'Present',
      checkInLocation: (latitude && longitude) ? { lat: Number(latitude), lng: Number(longitude) } : null,
      checkInLocationName: locationName || '',
      checkOutLocation: null
    });
    
    if (req.app.locals.io) {
      const emp = await Employee.findById(employeeId).lean();
      req.app.locals.io.emit('employee-check-in', {
        employeeId,
        id: employeeId,
        employeeName: emp ? emp.name : 'Unknown',
        checkIn: nowTime,
        latitude,
        longitude,
        locationName,
        timestamp: new Date()
      });
    }
    
    res.status(201).json(newRecord);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

app.post('/api/attendance/work-details', async (req, res) => {
  try {
    const { employeeId, workDetails, distanceTraveled, foodExpense } = req.body;
    const nowIST = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Kolkata"}));
    const today = format(nowIST, 'yyyy-MM-dd');
    
    const dist = Number(distanceTraveled) || 0;
    const food = Number(foodExpense) || 0;
    const travelExp = dist * 2.5;
    
    const record = await Attendance.findOneAndUpdate(
      { employeeId, date: today }, 
      { 
        workDetails,
        distanceTraveled: dist,
        travelExpense: travelExp,
        foodExpense: food
      },
      { new: true }
    );
    
    if (record) {
      res.json(record);
    } else {
      res.status(404).json({ message: 'No check-in record found for today' });
    }
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

app.post('/api/attendance/live-location', async (req, res) => {
  try {
    const { employeeId, lat, lng } = req.body;
    if (!lat || !lng) return res.status(400).json({message: 'Invalid coords'});
    
    const nowIST = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Kolkata"}));
    const today = format(nowIST, 'yyyy-MM-dd');
    const record = await Attendance.findOneAndUpdate(
      { employeeId, date: today, checkOut: null },
      { 
        currentLocation: { lat: Number(lat), lng: Number(lng), timestamp: new Date() },
        $push: { 
          locationHistory: { lat: Number(lat), lng: Number(lng), timestamp: new Date() }
        }
      },
      { new: true, select: '-locationHistory -routeTracking' }
    ).populate('employeeId', 'name role').lean();
    
    if (record) {
      const plain = record;
      plain.id = plain._id.toString();
      if (req.app.locals.io) {
        req.app.locals.io.emit('live-location-update', {
           employeeId: plain.employeeId._id.toString(),
           employeeName: plain.employeeId.name,
           latitude: Number(lat),
           longitude: Number(lng),
           timestamp: new Date()
        });
      }
      res.json({ success: true, record: plain });
    }
    else res.status(404).json({ message: 'No active shift found to sync.' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

app.post('/api/attendance/check-out', async (req, res) => {
  try {
    const { employeeId, latitude, longitude, status, distanceTraveled, foodExpense, workDetails } = req.body;
    const nowIST = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Kolkata"}));
    const today = format(nowIST, 'yyyy-MM-dd');
    const nowTime = format(nowIST, 'HH:mm:ss');
    
    const record = await Attendance.findOne({ employeeId, date: today });
    if (!record) return res.status(404).json({ message: 'No check-in record found for today' });
    if (record.checkOut || record.isCheckedOut) return res.status(400).json({ message: 'Already checked out today' });
    
    record.checkOut = nowTime;
    record.checkoutType = "manual";
    record.isCheckedOut = true;
    
    const checkInTime = record.checkIn;
    const inDate = new Date(`1970-01-01T${checkInTime}Z`);
    const outDate = new Date(`1970-01-01T${nowTime}Z`);
    const diffHours = (outDate - inDate) / (1000 * 60 * 60);
    
    record.status = diffHours >= 4 ? 'Full Day Present' : 'Half Day Present';
    
    if (latitude && longitude) {
      record.checkOutLocation = { lat: Number(latitude), lng: Number(longitude) };
      record.checkOutLocationName = req.body.locationName || '';
    }
    
    if (distanceTraveled !== undefined) {
      const dist = Number(distanceTraveled) || 0;
      record.distanceTraveled = dist;
      record.travelExpense = dist * 2.5; 
    }
    if (foodExpense !== undefined) {
      record.foodExpense = Number(foodExpense) || 0;
    }
    
    if (workDetails !== undefined) {
      record.workDetails = workDetails;
    }
    
    if (req.app.locals.io) {
      req.app.locals.io.emit('employee-check-out', { employeeId });
    }
    await record.save();
    res.json(record);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// === Reports API ===
app.get('/api/reports', async (req, res) => {
  try {
    const records = await Attendance.find().populate('employeeId').select('-locationHistory -routeTracking').lean();
    const enrichedRecords = records.map(r => ({
      ...r,
      id: r._id.toString(),
      employeeName: r.employeeId ? r.employeeId.name : 'Unknown',
      role: r.employeeId ? r.employeeId.role : 'Unknown',
      employeeId: r.employeeId ? r.employeeId._id.toString() : null
    }));
    res.json(enrichedRecords);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// === Salary API ===
app.get('/api/salary/:employeeId', async (req, res) => {
  try {
    const { employeeId } = req.params;
    const nowIST = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Kolkata"}));
    const targetYearMonth = req.query.month || format(nowIST, 'yyyy-MM');
    
    const emp = await Employee.findById(employeeId);
    if (!emp) return res.status(404).json({ message: 'Employee not found' });
    
    const monthlySalary = emp.monthlySalary || 0;
    
    const [year, month] = targetYearMonth.split('-').map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    
    let sundays = 0;
    for (let day = 1; day <= daysInMonth; day++) {
      if (new Date(year, month - 1, day).getDay() === 0) sundays++;
    }
    
    const expectedWorkingDays = daysInMonth - sundays;
    
    // Find attendance records for the month using indexed range queries instead of RegExp
    const nextMonth = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`;
    const monthRecords = await Attendance.find({ 
      employeeId, 
      date: { $gte: targetYearMonth, $lt: nextMonth }
    }).select('-locationHistory -routeTracking').lean();
    
    let totalDaysWorked = 0;
    let totalTravelExpense = 0;
    let totalFoodExpense = 0;
    monthRecords.forEach(r => {
      if (r.status === 'Full Day Present' || r.status === 'Present') totalDaysWorked += 1;
      else if (r.status === 'Half Day Present') totalDaysWorked += 0.5;
      
      totalTravelExpense += (r.travelExpense || 0);
      totalFoodExpense += (r.foodExpense || 0);
    });
    
    const paidDays = Math.min(daysInMonth, totalDaysWorked + sundays);
    const dailyWage = monthlySalary / daysInMonth;
    const estimatedSalary = Math.round(paidDays * dailyWage);

    const history = (await SalaryHistory.find({ employeeId }).sort({ createdAt: -1 }).lean())
      .map(h => ({ ...h, id: h._id.toString(), employeeId: h.employeeId.toString() }));

    res.json({
      currentMonth: {
        month: targetYearMonth,
        daysInMonth,
        sundays,
        expectedWorkingDays,
        totalDaysWorked,
        totalPaidDays: paidDays,
        monthlySalary,
        estimatedSalary,
        totalTravelExpense,
        totalFoodExpense
      },
      history
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

app.post('/api/salary/save', async (req, res) => {
  try {
    const { employeeId, month, totalDays, monthlySalary, totalSalary, bonus = 0, deductions = 0, travelExpense = 0, foodExpense = 0 } = req.body;
    
    const exists = await SalaryHistory.findOne({ employeeId, month });
    if (exists) {
      return res.status(400).json({ message: 'Salary for this month is already saved. Use update instead.' });
    }
    
    const record = await SalaryHistory.create({
      employeeId, month, totalDays, monthlySalary,
      baseSalary: totalSalary,
      bonus: Number(bonus),
      deductions: Number(deductions),
      travelExpense: Number(travelExpense),
      foodExpense: Number(foodExpense),
      netSalary: totalSalary + Number(bonus) - Number(deductions) + Number(travelExpense) + Number(foodExpense),
      isPaid: false
    });
    
    res.status(201).json(record);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

app.put('/api/salary/history/:id', async (req, res) => {
  try {
    const record = await SalaryHistory.findById(req.params.id);
    if (!record) return res.status(404).json({ message: 'Salary record not found' });
    
    Object.assign(record, req.body);
    record.netSalary = record.baseSalary + Number(record.bonus || 0) - Number(record.deductions || 0) + Number(record.travelExpense || 0) + Number(record.foodExpense || 0);
    await record.save();
    res.json(record);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

const generatePDFBuffer = (record, emp) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50 });
      let buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      
      doc.fontSize(24).fillColor('#4f46e5').text('Sri Krishna Milk Dairy', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(16).fillColor('#111827').text('CONFIDENTIAL PAYSLIP', { align: 'center' });
      doc.moveDown(2);
      
      doc.fontSize(12).fillColor('#374151');
      doc.text(`Employee Name : ${emp.name}`, { continued: true }).text(`Role : ${emp.role}`, { align: 'right' });
      doc.text(`Email Contact : ${emp.contact}`);
      doc.moveDown(1.5);
      
      doc.rect(50, doc.y, 500, 20).fill('#f3f4f6');
      doc.fillColor('#111827').text(`Salary Details for Month: ${record.month}`, 60, doc.y + 5);
      doc.moveDown(2);
      
      doc.text(`Total Paid Days (Inc. Sundays): ${record.totalDays}`);
      doc.text(`Monthly Base Salary: Rs. ${record.monthlySalary || 0}`);
      doc.moveDown();
      
      doc.text(`Calculated Base Earnings: Rs. ${record.baseSalary}`);
      doc.text(`Bonus (+): Rs. ${record.bonus || 0}`);
      doc.text(`Travel Expense (+): Rs. ${record.travelExpense || 0}`);
      doc.text(`Food Expense (+): Rs. ${record.foodExpense || 0}`);
      doc.text(`Advance / Deductions (-): Rs. ${record.deductions || 0}`);
      doc.moveDown(2);
      
      doc.fontSize(16).fillColor('#059669').text(`NET PAY: Rs. ${record.netSalary}`, { underline: true });
      
      doc.moveDown(4);
      doc.fontSize(10).fillColor('#9ca3af').text('This is a system-generated document. Ensure advances and bonuses are verified by the admin.', { align: 'center' });
      
      doc.end();
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);
    } catch (err) {
      reject(err);
    }
  });
};

app.post('/api/salary/send-payslip', async (req, res) => {
  try {
    const { recordId } = req.body;
    const record = await SalaryHistory.findById(recordId).populate('employeeId');
    if (!record) return res.status(404).json({ message: 'Salary record not found' });
    
    const emp = record.employeeId;
    if (!emp || !emp.contact) return res.status(400).json({ message: 'Employee email not found' });
    
    const pdfData = await generatePDFBuffer(record, emp);
    const transporter = await getTransporter();
    
    const info = await transporter.sendMail({
      from: '"Sri Krishna Milk Dairy" <noreply@krishnadairy.com>',
      to: emp.contact,
      subject: `Your Payslip for ${record.month}`,
      text: `Hello ${emp.name},\n\nPlease find your official payslip for ${record.month} attached.\n\nNet Pay: Rs. ${record.netSalary}\n\nThank you for your hard work!`,
      attachments: [{
        filename: `Payslip_${emp.name.replace(/\s+/g, '_')}_${record.month}.pdf`,
        content: pdfData
      }]
    });
    
    res.json({ success: true, message: 'Payslip sent', url: nodemailer.getTestMessageUrl(info) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to generate and send PDF' });
  }
});

app.get('/api/salary/download-payslip/:recordId', async (req, res) => {
  try {
    const { recordId } = req.params;
    const record = await SalaryHistory.findById(recordId).populate('employeeId');
    if (!record) return res.status(404).send('Record not found');
    
    const emp = record.employeeId;
    if (!emp) return res.status(404).send('Employee not found');
    
    const pdfBuffer = await generatePDFBuffer(record, emp);
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=Payslip_${emp.name.replace(/\s+/g, '_')}_${record.month}.pdf`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error(err);
    res.status(500).send('Failed to download PDF');
  }
});

// === Route Tracking API ===

app.post('/api/route/snap', async (req, res) => {
  try {
    let { coordinates } = req.body;
    if (!coordinates || coordinates.length < 2) {
      return res.json({ snappedPoints: null, distance: 0 });
    }
    
    // Prune identical points and obvious noise
    let filtered = [coordinates[0]];
    for (let i = 1; i < coordinates.length; i++) {
        const prev = filtered[filtered.length - 1];
        const curr = coordinates[i];
        if (getDistanceKm(prev.lat, prev.lng, curr.lat, curr.lng) > 0.01) {
             filtered.push(curr);
        }
    }
    if (filtered[filtered.length - 1] !== coordinates[coordinates.length - 1]) {
       filtered[filtered.length - 1] = coordinates[coordinates.length - 1];
    }
    
    let sampled = [];
    sampled.push(filtered[0]);
    const maxPoints = 100;
    
    if (filtered.length > 2) {
      const intermediate = filtered.slice(1, filtered.length - 1);
      if (intermediate.length <= maxPoints - 2) {
         sampled.push(...intermediate);
      } else {
         // simple sampling strategy
         const step = intermediate.length / (maxPoints - 2);
         for (let i = 0; i < maxPoints - 2; i++) {
            sampled.push(intermediate[Math.floor(i * step)]);
         }
      }
    }
    sampled.push(filtered[filtered.length - 1]);
    
    const pathStr = sampled.map(p => `${p.lat},${p.lng}`).join('|');
    
    const API_KEY = process.env.GOOGLE_MAPS_API_KEY || '';
    if (!API_KEY) {
       console.warn("GOOGLE_MAPS_API_KEY not configured. Falling back to straight lines.");
       return res.status(400).json({ message: "API key missing" });
    }
    
    const url = `https://roads.googleapis.com/v1/snapToRoads?path=${pathStr}&interpolate=true&key=${API_KEY}`;
    
    const gRes = await axios.get(url);
    
    if (!gRes.data.snappedPoints) {
       console.error("Google Roads API Error:", gRes.data);
       return res.status(400).json({ message: `Google Roads API Error` });
    }
    
    const snappedCoords = gRes.data.snappedPoints.map(p => ({
        lat: p.location.latitude,
        lng: p.location.longitude
    }));

    let distance = 0;
    for (let i = 0; i < snappedCoords.length - 1; i++) {
        distance += getDistanceKm(snappedCoords[i].lat, snappedCoords[i].lng, snappedCoords[i+1].lat, snappedCoords[i+1].lng);
    }
    
    res.json({ snappedPoints: snappedCoords, distance: distance });
  } catch (err) {
    if (err.response && err.response.data) {
       console.error("Route proxy failed", err.response.data);
    } else {
       console.error("Route proxy failed", err);
    }
    res.status(500).json({ message: "Server Error routing path" });
  }
});

// Helper to calculate distance in KM
const getDistanceKm = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

app.post('/api/location/start', async (req, res) => {
  try {
    const { employeeId, latitude, longitude, city } = req.body;
    const nowIST = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Kolkata"}));
    const today = format(nowIST, 'yyyy-MM-dd');

    const record = await Attendance.findOne({ employeeId, date: today });
    if (!record) return res.status(404).json({ message: 'No check-in record found for today' });

    record.routeTracking = {
      startedAt: new Date(),
      startLocation: { latitude: Number(latitude), longitude: Number(longitude), city: city || '', timestamp: new Date() },
      locations: [{ latitude: Number(latitude), longitude: Number(longitude), city: city || '', timestamp: new Date() }],
      totalDistanceKm: 0,
      stopPoints: []
    };

    await record.save();
    res.json({ success: true, routeTracking: record.routeTracking });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error starting location tracking' });
  }
});

app.post('/api/location/update', async (req, res) => {
  try {
    const { employeeId, latitude, longitude, city } = req.body;
    const nowIST = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Kolkata"}));
    const today = format(nowIST, 'yyyy-MM-dd');

    const record = await Attendance.findOne({ employeeId, date: today });
    if (!record || record.isCheckedOut || record.checkOut) {
       return res.status(404).json({ message: 'Active session ended. Tracking should stop.' });
    }
    if (!record.routeTracking || !record.routeTracking.startedAt) {
      return res.status(400).json({ message: 'Route tracking not initialized' });
    }

    const currentLoc = { latitude: Number(latitude), longitude: Number(longitude), city: city || '', timestamp: new Date() };

    // Update raw current location for live status
    record.currentLocation = { lat: currentLoc.latitude, lng: currentLoc.longitude, timestamp: currentLoc.timestamp };
    record.locationHistory.push({ lat: currentLoc.latitude, lng: currentLoc.longitude, timestamp: currentLoc.timestamp });

    // Track movement logic for polyline and distance
    const locations = record.routeTracking.locations;
    let distKm = 0;
    
    if (locations && locations.length > 0) {
      const lastLoc = locations[locations.length - 1];
      distKm = getDistanceKm(lastLoc.latitude, lastLoc.longitude, currentLoc.latitude, currentLoc.longitude);
      
      const timeDiffHours = (currentLoc.timestamp - lastLoc.timestamp) / (1000 * 60 * 60);
      
      // Spike detection: ignore unrealistic speeds > 150km/h
      if (timeDiffHours > 0 && distKm > 0.1 && (distKm / timeDiffHours) > 150) {
         console.warn(`[GPS] Spike ignored for ${employeeId}: ${distKm.toFixed(2)}km in ${timeDiffHours.toFixed(4)}hrs`);
         return res.json({ success: true, message: 'Spike ignored' });
      }

      // NO MOVEMENT LOGIC: Ignore movement < 20 meters (0.02 km) for polyline/distance
      if (distKm < 0.02) {
        // Evaluate Stop Point Logic
        // Find how long we've been within this 20m radius
        let stayStartTime = lastLoc.timestamp;
        // Search backwards through raw history or previous route points to find start of stability
        for (let i = record.locationHistory.length - 1; i >= 0; i--) {
           const l = record.locationHistory[i];
           if (getDistanceKm(l.lat, l.lng, currentLoc.latitude, currentLoc.longitude) < 0.02) {
              stayStartTime = l.timestamp;
           } else {
              break;
           }
        }

        const durationMinutes = (currentLoc.timestamp - new Date(stayStartTime)) / (1000 * 60);

        if (durationMinutes >= 5) {
          const stops = record.routeTracking.stopPoints || [];
          let activeStop = stops.length > 0 ? stops[stops.length - 1] : null;

          // If last stop's end time is very close, we are continuing the same stop
          if (activeStop && (currentLoc.timestamp - new Date(activeStop.endTime)) / (1000 * 60) < 10) {
             activeStop.endTime = currentLoc.timestamp;
             activeStop.durationMinutes = (currentLoc.timestamp - new Date(activeStop.startTime)) / (1000 * 60);
          } else {
             record.routeTracking.stopPoints.push({
               city: city || lastLoc.city,
               latitude: currentLoc.latitude,
               longitude: currentLoc.longitude,
               startTime: stayStartTime,
               endTime: currentLoc.timestamp,
               durationMinutes: durationMinutes
             });
          }
        }
        
        // DO NOT push to routeTracking.locations or add to totalDistanceKm if < 20m
        await record.save();
        
        // Still emit for live marker update on map, but without path growth
        if (req.app.locals.io) {
          req.app.locals.io.emit('live-route-update', {
             employeeId,
             location: currentLoc,
             totalDistanceKm: record.routeTracking.totalDistanceKm,
             noMove: true
          });
        }
        return res.json({ success: true, stationary: true });
      }

      // SIGNIFICANT MOVEMENT DETECTED (>= 20m)
      record.routeTracking.totalDistanceKm += distKm;
    }

    // Return Path Detection Logic
    let isRepeat = false;
    if (locations && locations.length > 5) {
      for (let i = 0; i < locations.length - 5; i++) {
        const prev = locations[i];
        if (getDistanceKm(prev.latitude, prev.longitude, currentLoc.latitude, currentLoc.longitude) < 0.03) {
          isRepeat = true;
          break;
        }
      }
    }
    currentLoc.isRepeat = isRepeat;

    record.routeTracking.locations.push(currentLoc);
    await record.save();

    if (req.app.locals.io) {
      const employeePopulated = await Employee.findById(employeeId).lean();
      req.app.locals.io.emit('live-route-update', {
         employeeId,
         employeeName: employeePopulated ? employeePopulated.name : 'Unknown',
         location: currentLoc,
         totalDistanceKm: record.routeTracking.totalDistanceKm
      });
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error updating location' });
  }
});

app.post('/api/location/stop', async (req, res) => {
  try {
    const { employeeId, latitude, longitude, city } = req.body;
    const nowIST = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Kolkata"}));
    const today = format(nowIST, 'yyyy-MM-dd');

    const record = await Attendance.findOne({ employeeId, date: today });
    if (!record) return res.status(404).json({ message: 'No check-in record found' });
    if (!record.routeTracking || !record.routeTracking.startedAt) {
      return res.status(400).json({ message: 'Route tracking not initialized' });
    }

    // Only set end location if it's open
    if (!record.routeTracking.endedAt) {
       record.routeTracking.endLocation = {
          latitude: Number(latitude),
          longitude: Number(longitude),
          city: city || '',
          timestamp: new Date()
       };
       record.routeTracking.endedAt = new Date();
       record.routeTracking.locations.push(record.routeTracking.endLocation);
       
       // Add final distance
       const locations = record.routeTracking.locations;
       if (locations.length >= 2) {
         const preLast = locations[locations.length - 2];
         const distKm = getDistanceKm(preLast.latitude, preLast.longitude, latitude, longitude);
         if (distKm >= 0.005) { // 5 meters filter
             record.routeTracking.totalDistanceKm += distKm;
         }
       }
       await record.save();
    }
    
    res.json({ success: true, routeTracking: record.routeTracking });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error stopping location tracking' });
  }
});

app.get('/api/location/history/:employeeId/:date', async (req, res) => {
  try {
    const { employeeId, date } = req.params;
    const record = await Attendance.findOne({ employeeId, date }).lean();
    
    if (!record || !record.routeTracking) {
      return res.status(404).json({ message: 'No route history found' });
    }
    
    const tracking = record.routeTracking;
    tracking.checkIn = record.checkIn;
    tracking.checkOut = record.checkOut;
    tracking.date = record.date;
    tracking.isCheckedOut = record.isCheckedOut;
    tracking.checkoutType = record.checkoutType;
    tracking.status = record.status;

    // Dynamically build Travel Sessions
    let sessions = [];
    const stops = tracking.stopPoints || [];
    const locations = tracking.locations || [];

    if (locations.length > 0) {
      let currentSession = {
         startTime: tracking.startedAt || locations[0].timestamp,
         startCity: tracking.startLocation ? tracking.startLocation.city : locations[0].city,
         endTime: null,
         endCity: '',
         distanceKm: 0
      };
      
      let stopIdx = 0;
      let lastLoc = null;

      for (const loc of locations) {
         const locTime = new Date(loc.timestamp).getTime();
         
         // Fast-forward stops if loc is past them entirely
         while (stopIdx < stops.length && locTime > new Date(stops[stopIdx].endTime).getTime()) {
             if (currentSession.startTime && !currentSession.endTime) {
                currentSession.endTime = stops[stopIdx].startTime;
                currentSession.endCity = stops[stopIdx].city;
                sessions.push({...currentSession});
             }
             currentSession = {
                startTime: stops[stopIdx].endTime,
                startCity: stops[stopIdx].city,
                endTime: null,
                endCity: '',
                distanceKm: 0
             };
             stopIdx++;
         }

         // Are we exactly INSIDE the current stop?
         if (stopIdx < stops.length && locTime >= new Date(stops[stopIdx].startTime).getTime() && locTime <= new Date(stops[stopIdx].endTime).getTime()) {
             if (currentSession.startTime && !currentSession.endTime) {
                currentSession.endTime = stops[stopIdx].startTime;
                currentSession.endCity = stops[stopIdx].city;
                sessions.push({...currentSession});
                currentSession.startTime = null; // Mark as suspended
             }
             lastLoc = loc;
             continue; // Don't add distance while stopped
         }

         // We are travelling
         if (!currentSession.startTime) {
             currentSession = {
                startTime: loc.timestamp,
                startCity: loc.city || '',
                endTime: null,
                endCity: '',
                distanceKm: 0
             };
         }

         if (lastLoc) {
            const d = getDistanceKm(lastLoc.latitude, lastLoc.longitude, loc.latitude, loc.longitude);
            if (d >= 0.005) {
                currentSession.distanceKm += d;
            }
         }
         lastLoc = loc;
      }

      if (currentSession.startTime && !currentSession.endTime) {
         currentSession.endTime = tracking.endedAt || (lastLoc ? lastLoc.timestamp : new Date());
         currentSession.endCity = tracking.endLocation ? tracking.endLocation.city : (lastLoc ? lastLoc.city : '');
         sessions.push({...currentSession});
      }
      
      tracking.travelSessions = sessions.filter(s => {
          const mins = (new Date(s.endTime) - new Date(s.startTime)) / 60000;
          return s.distanceKm >= 0.01 || mins >= 1;
      });
    }

    res.json(tracking);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error fetching location history' });
  }
});

app.post('/api/location/sync', async (req, res) => {
  try {
    const { employeeId, locations: offlineLocations } = req.body;
    if (!offlineLocations || !offlineLocations.length) return res.json({ success: true, message: 'No points to sync' });
    
    const nowIST = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Kolkata"}));
    const today = format(nowIST, 'yyyy-MM-dd');

    const record = await Attendance.findOne({ employeeId, date: today });
    if (!record || !record.routeTracking || !record.routeTracking.startedAt) {
      return res.status(404).json({ message: 'No active session found for sync' });
    }

    // Sort received points by time
    const sorted = offlineLocations.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    
    for (const loc of sorted) {
      const currentLoc = { latitude: Number(loc.latitude), longitude: Number(loc.longitude), city: loc.city || '', timestamp: new Date(loc.timestamp) };
      const locations = record.routeTracking.locations;
      
      if (locations && locations.length > 0) {
        const lastLoc = locations[locations.length - 1];
        // Time order check: Ensure we do not add old points if a newer point exists
        if (currentLoc.timestamp <= lastLoc.timestamp) continue;

        const distKm = getDistanceKm(lastLoc.latitude, lastLoc.longitude, currentLoc.latitude, currentLoc.longitude);
        const timeDiffHours = (currentLoc.timestamp - lastLoc.timestamp) / (1000 * 60 * 60);
        
        if (timeDiffHours > 0 && distKm > 0.05 && (distKm / timeDiffHours) > 150) {
           continue; // Spike
        }

        if (distKm < 0.02) {
          let stayStartTime = lastLoc.timestamp;
          for (let i = locations.length - 1; i >= 0; i--) {
            if (getDistanceKm(locations[i].latitude, locations[i].longitude, currentLoc.latitude, currentLoc.longitude) < 0.02) {
              stayStartTime = locations[i].timestamp;
            } else {
              break;
            }
          }
          const durationMinutes = (currentLoc.timestamp - new Date(stayStartTime)) / (1000 * 60);

          if (durationMinutes >= 5) {
            const stops = record.routeTracking.stopPoints || [];
            let activeStop = stops.length > 0 ? stops[stops.length - 1] : null;

            if (activeStop && (currentLoc.timestamp - new Date(activeStop.endTime)) / (1000 * 60) < 5) {
               activeStop.endTime = currentLoc.timestamp;
               activeStop.durationMinutes = (currentLoc.timestamp - new Date(activeStop.startTime)) / (1000 * 60);
            } else {
               record.routeTracking.stopPoints.push({
                 city: currentLoc.city || lastLoc.city,
                 latitude: currentLoc.latitude,
                 longitude: currentLoc.longitude,
                 startTime: stayStartTime,
                 endTime: currentLoc.timestamp,
                 durationMinutes: durationMinutes
               });
            }
          }
        }

        if (distKm >= 0.005) {
           record.routeTracking.totalDistanceKm += distKm;
        }

        // Repeat Path Detection for Sync
        let isRepeat = false;
        if (locations && locations.length > 5) {
          for (let i = 0; i < locations.length - 5; i++) {
            const prev = locations[i];
            const d = getDistanceKm(prev.latitude, prev.longitude, currentLoc.latitude, currentLoc.longitude);
            if (d < 0.03) {
              isRepeat = true;
              break;
            }
          }
        }
        currentLoc.isRepeat = isRepeat;
      }
      record.routeTracking.locations.push(currentLoc);
    }
    await record.save();
    res.json({ success: true, syncedCount: sorted.length });
  } catch (err) {
    console.error('Offline sync error', err);
    res.status(500).json({ message: 'Server error syncing offline locations' });
  }
});

// Geofencing Endpoints
app.get('/api/geofence', async (req, res) => {
  try {
    const zones = await GeofenceZone.find().lean();
    res.json(zones);
  } catch (e) {
    res.status(500).json({ message: 'Error fetching geofences' });
  }
});

app.post('/api/geofence', async (req, res) => {
  try {
    const zone = await GeofenceZone.create(req.body);
    res.status(201).json(zone);
  } catch (e) {
    res.status(500).json({ message: 'Error creating geofence' });
  }
});

app.post('/api/geofence/event', async (req, res) => {
  try {
    const { employeeId, zoneName, action, timestamp } = req.body;
    const nowIST = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Kolkata"}));
    const today = format(nowIST, 'yyyy-MM-dd');
    
    // We update the active route tracking with this event
    const record = await Attendance.findOne({ employeeId, date: today, checkOut: null });
    if (!record) return res.status(404).json({ message: 'No active session' });
    
    if (!record.routeTracking.geofenceEvents) record.routeTracking.geofenceEvents = [];
    
    record.routeTracking.geofenceEvents.push({
       zoneName,
       action,
       timestamp: timestamp ? new Date(timestamp) : new Date()
    });
    await record.save();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ message: 'Error logging geofence event' });
  }
});

app.get('/api/ping', (req, res) => res.json({ status: 'ok' }));

// === Serve Static Files in Production ===
const distPath = path.join(__dirname, '../dist');
app.use(express.static(distPath));

// === Catch-all Route for SPA Navigation ===
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(distPath, 'index.html'));
  }
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

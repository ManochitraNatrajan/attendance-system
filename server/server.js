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
// =======================

const app = express();
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/attendance_system';

mongoose.connect(MONGODB_URI)
  .then(async () => {
    console.log('Connected to MongoDB');
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

// === Auth API ===
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
    ).lean();
    
    if (record) {
      const plain = record;
      plain.id = plain._id.toString();
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
    if (record.checkOut) return res.status(400).json({ message: 'Already checked out today' });
    
    record.checkOut = nowTime;
    
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

    const record = await Attendance.findOne({ employeeId, date: today, checkOut: null });
    if (!record) return res.status(404).json({ message: 'No active check-in record found for tracking' });
    if (!record.routeTracking || !record.routeTracking.startedAt) {
      return res.status(400).json({ message: 'Route tracking not initialized' });
    }

    const currentLoc = { latitude: Number(latitude), longitude: Number(longitude), city: city || '', timestamp: new Date() };

    // Get last location
    const locations = record.routeTracking.locations;
    if (locations && locations.length > 0) {
      const lastLoc = locations[locations.length - 1];
      const distKm = getDistanceKm(lastLoc.latitude, lastLoc.longitude, currentLoc.latitude, currentLoc.longitude);
      
      const timeDiffHours = (currentLoc.timestamp - lastLoc.timestamp) / (1000 * 60 * 60);
      
      // Spike detection: ignore unrealistic speeds > 150km/h
      if (timeDiffHours > 0 && distKm > 0.05 && (distKm / timeDiffHours) > 150) {
         return res.json({ success: true, message: 'Spike ignored' });
      }

      // Stop logic detection: distance < 0.02 km (20m)
      if (distKm < 0.02) {
        // Calculate duration since we arrived at this spot
        // We'll walk backwards from locations to find the first time we were at this ~spot
        let stayStartTime = lastLoc.timestamp;
        for (let i = locations.length - 1; i >= 0; i--) {
          const l = locations[i];
          if (getDistanceKm(l.latitude, l.longitude, currentLoc.latitude, currentLoc.longitude) < 0.02) {
            stayStartTime = l.timestamp;
          } else {
            break;
          }
        }

        const durationMinutes = (currentLoc.timestamp - new Date(stayStartTime)) / (1000 * 60);

        if (durationMinutes >= 5) {
          // It's a stop point. Check if we already recorded this stop.
          const stops = record.routeTracking.stopPoints || [];
          let activeStop = stops.length > 0 ? stops[stops.length - 1] : null;

          // If last stop's end time is very close to current, we are just continuing the same stop
          if (activeStop && (currentLoc.timestamp - new Date(activeStop.endTime)) / (1000 * 60) < 5) {
             activeStop.endTime = currentLoc.timestamp;
             activeStop.durationMinutes = (currentLoc.timestamp - new Date(activeStop.startTime)) / (1000 * 60);
          } else {
             // New stop point
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
      }

      // Add to total distance if we moved slightly
      if (distKm >= 0.005) { // 5 meters filter to avoid accumulating jitter but keep slow movement
         record.routeTracking.totalDistanceKm += distKm;
      }
    }

    record.routeTracking.locations.push(currentLoc);

    await record.save();

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

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

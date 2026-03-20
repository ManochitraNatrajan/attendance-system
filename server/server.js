import express from 'express';
import cors from 'cors';
import { format } from 'date-fns';
import nodemailer from 'nodemailer';
import 'dotenv/config';
import PDFDocument from 'pdfkit';
import mongoose from 'mongoose';

// =======================
// === MONGODB SCHEMAS ===
// =======================
const employeeSchema = new mongoose.Schema({
  name: { type: String, required: true },
  role: { type: String, required: true },
  contact: { type: String, required: true },
  password: { type: String, required: true },
  monthlySalary: { type: Number, default: 0 },
  dailyWage: { type: Number, default: 0 }
}, { timestamps: true });
employeeSchema.set('toJSON', { virtuals: true, versionKey: false, transform: (d, r) => { r.id = r._id.toString(); delete r._id; }});
const Employee = mongoose.model('Employee', employeeSchema);

const attendanceSchema = new mongoose.Schema({
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
  date: { type: String, required: true }, 
  checkIn: { type: String }, 
  checkOut: { type: String, default: null }, 
  status: { type: String, default: 'Pending' }, 
  checkInLocation: { lat: Number, lng: Number },
  checkOutLocation: { lat: Number, lng: Number },
  currentLocation: { lat: Number, lng: Number, timestamp: Date },
  workDetails: [{ type: String }]
}, { timestamps: true });
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
  netSalary: { type: Number, default: 0 },
  isPaid: { type: Boolean, default: false }
}, { timestamps: true });
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
app.use(express.json());

// === OTP Storage ===
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
app.post('/api/login', async (req, res) => {
  try {
    const { contact, password } = req.body;
    const user = await Employee.findOne({ contact });
    
    if (user && (user.password === password || (!user.password && password === '123456'))) {
      res.json({ success: true, user });
    } else {
      res.status(401).json({ success: false, message: 'Invalid credentials. User not found.' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// === Employee API ===
app.get('/api/employees', async (req, res) => {
  try {
    const users = await Employee.find();
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
    const generatedPassword = Math.floor(100000 + Math.random() * 900000).toString();
    const emp = await Employee.create({
      name: req.body.name,
      role: req.body.role,
      contact: req.body.contact,
      dailyWage: Number(req.body.dailyWage) || 0,
      monthlySalary: Number(req.body.monthlySalary) || 0,
      password: generatedPassword,
    });
    
    // Welcome email has been disabled as requested
    
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
    res.json({ message: 'Employee deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// === Attendance API ===
app.get('/api/attendance', async (req, res) => {
  try {
    const { date, employeeId } = req.query;
    let query = {};
    if (date) query.date = date;
    if (employeeId) query.employeeId = employeeId;
    
    // Default filter for last 30 days if no specific date
    if (!date && !employeeId) {
      const thirtyDaysAgoStr = new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0];
      query.date = { $gte: thirtyDaysAgoStr };
    }
    
    const records = await Attendance.find(query).populate('employeeId').lean();
    
    const enrichedRecords = records.map(r => ({
      ...r,
      employeeName: r.employeeId ? r.employeeId.name : 'Unknown',
      role: r.employeeId ? r.employeeId.role : 'Unknown',
      employeeId: r.employeeId ? r.employeeId._id : null
    }));
    
    res.json(enrichedRecords);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

app.post('/api/attendance/check-in', async (req, res) => {
  try {
    const { employeeId, latitude, longitude } = req.body;
    const today = format(new Date(), 'yyyy-MM-dd');
    const nowTime = format(new Date(), 'HH:mm:ss');
    
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
    const { employeeId, workDetails } = req.body;
    const today = format(new Date(), 'yyyy-MM-dd');
    
    const record = await Attendance.findOneAndUpdate(
      { employeeId, date: today }, 
      { workDetails },
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
    
    const today = format(new Date(), 'yyyy-MM-dd');
    const record = await Attendance.findOneAndUpdate(
      { employeeId, date: today, checkOut: null },
      { currentLocation: { lat: Number(lat), lng: Number(lng), timestamp: new Date() } }
    );
    
    if (record) res.json({ success: true });
    else res.status(404).json({ message: 'No active shift found to sync.' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

app.post('/api/attendance/check-out', async (req, res) => {
  try {
    const { employeeId, latitude, longitude, status } = req.body;
    const today = format(new Date(), 'yyyy-MM-dd');
    const nowTime = format(new Date(), 'HH:mm:ss');
    
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
    const records = await Attendance.find().populate('employeeId').lean();
    const enrichedRecords = records.map(r => ({
      ...r,
      employeeName: r.employeeId ? r.employeeId.name : 'Unknown',
      role: r.employeeId ? r.employeeId.role : 'Unknown',
      employeeId: r.employeeId ? r.employeeId._id : null
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
    const targetYearMonth = req.query.month || format(new Date(), 'yyyy-MM');
    
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
    
    // Find attendance records for the month using Regex
    const monthRecords = await Attendance.find({ 
      employeeId, 
      date: new RegExp('^' + targetYearMonth) 
    });
    
    let totalDaysWorked = 0;
    monthRecords.forEach(r => {
      if (r.status === 'Full Day Present' || r.status === 'Present') totalDaysWorked += 1;
      else if (r.status === 'Half Day Present') totalDaysWorked += 0.5;
    });
    
    const paidDays = Math.min(daysInMonth, totalDaysWorked + sundays);
    const dailyWage = monthlySalary / daysInMonth;
    const estimatedSalary = Math.round(paidDays * dailyWage);

    const history = await SalaryHistory.find({ employeeId }).sort({ createdAt: -1 });

    res.json({
      currentMonth: {
        month: targetYearMonth,
        daysInMonth,
        sundays,
        expectedWorkingDays,
        totalDaysWorked,
        totalPaidDays: paidDays,
        monthlySalary,
        estimatedSalary
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
    const { employeeId, month, totalDays, monthlySalary, totalSalary, bonus = 0, deductions = 0 } = req.body;
    
    const exists = await SalaryHistory.findOne({ employeeId, month });
    if (exists) {
      return res.status(400).json({ message: 'Salary for this month is already saved. Use update instead.' });
    }
    
    const record = await SalaryHistory.create({
      employeeId, month, totalDays, monthlySalary,
      baseSalary: totalSalary,
      bonus: Number(bonus),
      deductions: Number(deductions),
      netSalary: totalSalary + Number(bonus) - Number(deductions),
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
    record.netSalary = record.baseSalary + Number(record.bonus || 0) - Number(record.deductions || 0);
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

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

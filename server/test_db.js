const mongoose = require("mongoose");
mongoose.connect("mongodb://127.0.0.1:27017/attendance_system").then(async () => {
    console.log("Connected");
    const db = mongoose.connection.db;
    const Attendance = mongoose.connection.collection('attendances');
    const records = await Attendance.find({}).toArray();
    console.log("Attendances found:", records.length);
    if(records.length > 0) {
       console.log("First record:", records[0].employeeId, records[0].date);
       // Test findOne like API
       const res = await Attendance.findOne({ employeeId: records[0].employeeId, date: records[0].date });
       console.log("findOne:", res ? "Found" : "Not Found");
    }
    process.exit(0);
}).catch(console.error);

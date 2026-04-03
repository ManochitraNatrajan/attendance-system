const mongoose = require("mongoose");
mongoose.connect("mongodb://127.0.0.1:27017/attendance_system").then(async () => {
    try {
        const Attendance = mongoose.connection.collection('attendances');
        const Employee = mongoose.connection.collection('employees');

        const allRecords = await Attendance.find({ routeTracking: { $exists: true, $ne: null } }).toArray();
        console.log("Records with routeTracking:", allRecords.length);

        for (let r of allRecords) {
            const emp = await Employee.findOne({ _id: r.employeeId });
            console.log(`Date: ${r.date}, EmpName: ${emp ? emp.name : 'Unknown'}, EmpID: ${r.employeeId}`);
        }
        
    } catch(err) {
        console.error(err);
    }
    process.exit(0);
});

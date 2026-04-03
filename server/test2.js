const mongoose = require("mongoose");
mongoose.connect("mongodb://127.0.0.1:27017/attendance_system").then(async () => {
    try {
        const Employee = mongoose.connection.collection('employees');
        const emp = await Employee.findOne({name: /Balakrishnan/});
        if (!emp) { console.log('no emp'); process.exit(0); }
        
        const Attendance = mongoose.connection.collection('attendances');
        console.log("Querying for:", emp._id, "and date: 2026-03-31");
        
        let done = false;
        const timer = setTimeout(() => {
            if(!done) { console.log('HOOK HUNG'); process.exit(1); }
        }, 3000);
        
        const att = await Attendance.findOne({ employeeId: emp._id, date: '2026-03-31' });
        done = true;
        clearTimeout(timer);
        console.log('Result:', att ? 'Found' : 'Not found');
    } catch(err) {
        console.log('Error', err);
    }
    process.exit(0);
});

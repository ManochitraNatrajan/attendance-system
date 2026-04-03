import mongoose from 'mongoose';
mongoose.connect('mongodb://127.0.0.1:27017/attendance_system').then(async () => {
    const db = mongoose.connection.db;
    const att = await db.collection('attendances').find({}).toArray();
    console.log('TOTAL ATTENDANCES:', att.length);
    att.forEach(a => {
        if(a.routeTracking) {
             console.log('HAS ROUTE. Emp:', a.employeeId, 'Date:', a.date);
        }
    });
    process.exit(0);
});

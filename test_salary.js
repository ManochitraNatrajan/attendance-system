import fs from 'fs/promises';

async function test() {
  const data = await fs.readFile('./server/data/db.json', 'utf8');
  const db = JSON.parse(data);
  const employeeId = "fedeaa4d-0c2d-4f7b-8df2-44cf65a24da2"; // mano
  const targetYearMonth = "2026-03";
  
  const emp = db.employees.find(e => e.id === employeeId);
  const monthlySalary = emp ? emp.monthlySalary || 0 : 0;
  
  const [year, month] = targetYearMonth.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  
  let sundays = 0;
  for (let day = 1; day <= daysInMonth; day++) {
    if (new Date(year, month - 1, day).getDay() === 0) sundays++;
  }
  
  const expectedWorkingDays = daysInMonth - sundays;
  const monthRecords = db.attendance.filter(a => a.employeeId === employeeId && a.date.startsWith(targetYearMonth));
  
  let totalDaysWorked = 0;
  monthRecords.forEach(r => {
    if (r.status === 'Full Day Present' || r.status === 'Present') totalDaysWorked += 1;
    else if (r.status === 'Half Day Present') totalDaysWorked += 0.5;
  });
  
  const paidDays = Math.min(daysInMonth, totalDaysWorked + sundays);
  const dailyWage = monthlySalary / daysInMonth;
  const estimatedSalary = Math.round(paidDays * dailyWage);
  
  console.log({
     empName: emp.name,
     monthlySalary,
     daysInMonth,
     sundays,
     totalDaysWorked,
     paidDays,
     dailyWage,
     estimatedSalary,
     jsonEstimated: JSON.stringify(estimatedSalary)
  });
}
test();

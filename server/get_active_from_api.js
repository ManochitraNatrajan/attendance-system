import http from 'http';

http.get('http://localhost:5000/api/attendance', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const records = JSON.parse(data);
      const nowIST = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
      const todayStr = nowIST.toISOString().split('T')[0];

      // Active / Running sessions (no checkout yet or isCheckedOut: false)
      const active = records.filter(r => !r.checkOut || r.checkOut === '' || r.isCheckedOut === false);
      const today = records.filter(r => r.date === todayStr);

      console.log("===LIVE_API_DATA_START===");
      console.log(JSON.stringify({
        todayStr,
        totalRecordsFromAPI: records.length,
        activeRunningSessionsCount: active.length,
        activeRunningSessions: active,
        todayRecordsCount: today.length,
        todayRecords: today
      }, null, 2));
      console.log("===LIVE_API_DATA_END===");
    } catch (e) {
      console.error("Parse error:", e);
    }
  });
}).on('error', (err) => {
  console.error("HTTP error:", err.message);
});

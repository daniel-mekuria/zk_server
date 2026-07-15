# Production Deployment Guide - Attendance API Fix

## 📋 Overview

This guide covers deploying the attendance API fix to your production server.

**What Changed**:
- ✅ Added `GET /api/attendance` endpoint in `managementAPI.js`
- ✅ Route registration in `setupRoutes()`
- ✅ Database schema already exists (`attendance_logs` table)
- ✅ ATTLOG processing already implemented

**Files Modified**:
- `managementAPI.js` - Added `getAttendance()` method and route

## 🚀 Deployment Steps

### 1. Backup Current Production Code
```bash
# On production server
cd /path/to/zk_server
cp -r . ../zk_server_backup_$(date +%Y%m%d_%H%M%S)
```

### 2. Copy Updated File to Production
```bash
# Copy managementAPI.js to production server
scp managementAPI.js user@production-server:/path/to/zk_server/
```

### 3. Verify No Syntax Errors
```bash
# On production server
cd /path/to/zk_server
node -c managementAPI.js
# Should return nothing if syntax is correct
```

### 4. Restart the Server
```bash
# Stop current server process
pm2 stop zk-server
# OR
pkill -f "node server.js"

# Start server again
pm2 start server.js --name zk-server
# OR
node server.js &
```

### 5. Verify Server Started Successfully
```bash
# Check server logs
pm2 logs zk-server
# OR
tail -f /path/to/server.log

# Should see:
# "ZK Push Server listening on port 8002"
```

## 🧪 Testing in Production

### Test 1: Verify Endpoint is Accessible
```bash
curl http://localhost:8002/api/attendance

# Expected response:
# {
#   "success": true,
#   "data": [],
#   "count": 0,
#   "query": {
#     "device": "all",
#     "startDate": "2026-06-26 00:00:00",
#     "endDate": "2026-06-26 23:59:59"
#   }
# }
```

### Test 2: Test with Device Filter
```bash
curl "http://localhost:8002/api/attendance?device=10.10.10.8"

# Should return JSON structure (not undefined)
```

### Test 3: Test with Date Range
```bash
curl "http://localhost:8002/api/attendance?startDate=2026-06-19&endDate=2026-06-26"

# Should return attendance records within date range
```

### Test 4: Verify Existing Endpoints Still Work
```bash
# Test devices endpoint
curl http://localhost:8002/api/devices

# Test users endpoint
curl http://localhost:8002/api/users

# Test status endpoint
curl http://localhost:8002/api/status

# All should return valid JSON responses
```

## 📊 Monitoring in Production

### Watch for Attendance Push Activity
```bash
# Monitor server logs for ATTLOG activity
tail -f /path/to/server.log | grep -E "ATTLOG|PUNCH|Attendance API"
```

### Check Database for Stored Records
```bash
sqlite3 /path/to/attendance.db

# Check table exists
.tables

# Check record count
SELECT COUNT(*) FROM attendance_logs;

# View recent records
SELECT * FROM attendance_logs ORDER BY created_at DESC LIMIT 10;

# Check records per device
SELECT device_serial, COUNT(*) as count 
FROM attendance_logs 
GROUP BY device_serial;
```

### Monitor API Usage
```bash
# Watch for API requests
tail -f /path/to/server.log | grep "Attendance API request"

# Should see:
# 📊 Attendance API request: device=10.10.10.8, startDate=2026-06-19, endDate=2026-06-26
# ✅ Attendance API: Returning 42 records
```

## 🔍 Troubleshooting

### Problem: Server Won't Start After Update

**Check 1**: Syntax errors
```bash
node -c managementAPI.js
```

**Check 2**: Missing dependencies
```bash
npm install
```

**Check 3**: Port already in use
```bash
lsof -i :8002
# Kill the process using the port
kill -9 <PID>
```

### Problem: Endpoint Returns 404

**Cause**: Route not registered

**Check**: Look for this in server startup logs:
```
ZK Push Server listening on port 8002
```

**Fix**: Verify `managementAPI.js` has the route:
```javascript
this.router.get('/attendance', this.getAttendance.bind(this));
```

### Problem: Empty Results When You Expect Data

**Check 1**: Devices pushing attendance?
```bash
grep "ATTLOG PUNCH RECORD RECEIVED" /path/to/server.log
```

**Check 2**: Database has records?
```bash
sqlite3 attendance.db "SELECT COUNT(*) FROM attendance_logs;"
```

**Check 3**: Date range correct?
```bash
# Check what dates have records
sqlite3 attendance.db "SELECT DATE(punch_time) as date, COUNT(*) FROM attendance_logs GROUP BY DATE(punch_time);"
```

**Check 4**: Device filter correct?
```bash
# Check what devices have records
sqlite3 attendance.db "SELECT DISTINCT device_serial FROM attendance_logs;"
```

### Problem: Server Crashes After Deployment

**Check logs**:
```bash
pm2 logs zk-server --lines 100
```

**Common causes**:
- Syntax error in JavaScript
- Missing dependency (moment)
- Database file permissions

**Rollback**:
```bash
# Restore backup
cp ../zk_server_backup_YYYYMMDD_HHMMSS/managementAPI.js ./
pm2 restart zk-server
```

## 📈 Performance Monitoring

### Monitor Response Times
```bash
# Watch API response times in logs
tail -f /path/to/server.log | grep "Attendance API"

# Should see fast responses:
# ✅ Attendance API: Returning 100 records (took 45ms)
```

### Check Database Size Growth
```bash
# Check database file size
ls -lh attendance.db

# Monitor attendance_logs table size
sqlite3 attendance.db "SELECT COUNT(*) as records, 
  (COUNT(*) * 200) / 1024 / 1024 as estimated_mb 
FROM attendance_logs;"
```

### Monitor Memory Usage
```bash
# Check server memory usage
pm2 show zk-server

# OR
ps aux | grep node
```

## 🔒 Security Considerations

### 1. Access Control
Currently, the endpoint has no authentication. Consider adding:
```javascript
// Add authentication middleware if needed
this.router.get('/attendance', authMiddleware, this.getAttendance.bind(this));
```

### 2. Rate Limiting
Consider adding rate limiting for production:
```javascript
const rateLimit = require('express-rate-limit');
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100 // limit each IP to 100 requests per windowMs
});
this.router.get('/attendance', limiter, this.getAttendance.bind(this));
```

### 3. Input Validation
Date parameters are validated by moment.js, but consider adding:
- Maximum date range (e.g., 31 days)
- SQL injection protection (already using parameterized queries ✅)

## 📝 Rollback Plan

If issues arise in production:

### Step 1: Stop Server
```bash
pm2 stop zk-server
```

### Step 2: Restore Backup
```bash
cp ../zk_server_backup_YYYYMMDD_HHMMSS/managementAPI.js ./
```

### Step 3: Restart Server
```bash
pm2 start zk-server
```

### Step 4: Verify Rollback
```bash
curl http://localhost:8002/api/status
# Should return valid response
```

## ✅ Success Checklist

Before considering deployment complete:

- [ ] Server starts without errors
- [ ] GET /api/attendance returns JSON (not undefined)
- [ ] Existing endpoints still functional (/api/devices, /api/users, etc.)
- [ ] No errors in server logs
- [ ] Database queries executing correctly
- [ ] Response times acceptable (<100ms for typical queries)
- [ ] External code now receives structured data instead of undefined

## 📞 Support

If issues persist:

1. Check server logs: `pm2 logs zk-server`
2. Check database: `sqlite3 attendance.db`
3. Verify network: `netstat -an | grep 8002`
4. Review implementation: Check `managementAPI.js` around line 885

## 🎉 Expected Outcome

**Before**:
```javascript
const result = await getAttendance();
console.log(result); // undefined
```

**After**:
```javascript
const result = await fetch('http://production-server:8002/api/attendance?device=10.10.10.8');
const json = await result.json();
console.log(json);
// {
//   success: true,
//   data: [
//     { pin: "123", timestamp: "2026-06-26 10:35:00", status: 0, verifyType: 1, ... }
//   ],
//   count: 1
// }
```

Your external code will now receive structured attendance data instead of `undefined`! 🎊

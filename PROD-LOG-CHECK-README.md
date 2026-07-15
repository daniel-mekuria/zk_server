# Production Log Check - Quick Guide

## Prerequisites

Before running diagnostics on your production server, ensure you have:

1. SSH access to the production server
2. The server is running (`node server.js`)
3. You know the locations of:
   - Log file (default: `server.log`)
   - Database file (default: `attendance.db`)

## Quick Start

### Option 1: Full Diagnostic Script (Recommended)

Upload and run the comprehensive diagnostic script:

```bash
# Upload the script to your server
scp prod-attendance-diagnostic.sh user@your-server:/path/to/app/

# SSH into your server
ssh user@your-server

# Navigate to app directory
cd /path/to/app

# Make script executable
chmod +x prod-attendance-diagnostic.sh

# Run the diagnostic
./prod-attendance-diagnostic.sh
```

**Custom log/database locations:**
```bash
LOG_FILE=/var/log/attendance-server.log DB_FILE=/var/db/attendance.db ./prod-attendance-diagnostic.sh
```

### Option 2: Manual Log Checks (Quick)

If you prefer manual checks, use these commands:

#### 1. Check if server is running
```bash
ps aux | grep "node.*server.js"
```

#### 2. Check if server is listening on port 8002
```bash
netstat -tuln | grep 8002
# OR
ss -tuln | grep 8002
```

#### 3. Check for ATTLOG push activity
```bash
grep "ATTLOG PUNCH RECORD RECEIVED" server.log | wc -l
```
- If count is **0**: Machines are NOT pushing attendance data
- If count is **> 0**: Machines ARE pushing data successfully

#### 4. View recent ATTLOG activity
```bash
grep -A 5 "ATTLOG PUNCH RECORD RECEIVED" server.log | tail -n 50
```

#### 5. Check for punch records processed
```bash
grep "🕐 PUNCH" server.log | tail -n 20
```

#### 6. View real-time logs (watch mode)
```bash
tail -f server.log | grep -E "ATTLOG|PUNCH|Device"
```

#### 7. Check database for stored records
```bash
sqlite3 attendance.db "SELECT COUNT(*) FROM attendance_logs;"
```

#### 8. View recent attendance records
```bash
sqlite3 attendance.db "SELECT pin, punch_time, device_serial FROM attendance_logs ORDER BY created_at DESC LIMIT 10;"
```

#### 9. Test the REST API endpoint
```bash
curl "http://localhost:8002/api/attendance?startDate=2026-06-25&endDate=2026-06-26"
```

Expected response:
```json
{
  "success": true,
  "data": [...],
  "count": 5,
  "query": {
    "startDate": "2026-06-25",
    "endDate": "2026-06-26"
  }
}
```

#### 10. Check for recent errors
```bash
grep -i "error\|exception\|failed" server.log | tail -n 20
```

## What the Diagnostic Script Checks

The `prod-attendance-diagnostic.sh` script performs these checks automatically:

1. ✅ **Server Process Status** - Is node server.js running?
2. ✅ **Network Port Status** - Is port 8002 listening?
3. ✅ **Device Connectivity** - Can server reach machines (10.10.10.8, 10.10.10.9)?
4. ✅ **Recent Log Activity** - Shows last 50 log lines
5. ✅ **ATTLOG Push Activity** - Are machines pushing attendance data?
6. ✅ **Device Heartbeat Activity** - Are devices connecting?
7. ✅ **Database Status** - Is database populated with records?
8. ✅ **API Endpoint Test** - Is GET /api/attendance working?
9. ✅ **Error Analysis** - Any recent errors or exceptions?
10. ✅ **Summary Report** - Overall system health

## Interpreting Results

### ✅ GOOD: Everything Working

```
✅ Server is running (PID: 12345)
✅ Server is listening on port 8002
✅ Device 10.10.10.8 - Reachable
✅ Device 10.10.10.9 - Reachable
✅ Server IS receiving attendance push data
   ATTLOG records received: 47
   Punch records processed: 47
✅ attendance_logs table exists
   Total attendance records: 47
✅ API endpoint is working (HTTP 200)
✅ All systems operational
```

**Action**: No action needed. System is working correctly.

---

### ❌ ISSUE: No ATTLOG Push Activity

```
✅ Server is running (PID: 12345)
✅ Server is listening on port 8002
✅ Device 10.10.10.8 - Reachable
✅ Device 10.10.10.9 - Reachable
❌ Server is NOT receiving attendance push data
   ATTLOG records received: 0
   Punch records processed: 0
```

**Root Cause**: Machines are not pushing attendance data to the server.

**Actions**:
1. Check machine ADMS configuration:
   - Menu → Comm → Cloud Server Settings
   - Server IP: (should be your server's IP)
   - Port: 8002
   - Enable: ON
   - Real-time Upload: ON

2. Check machine TransData settings:
   - Should include "ATTLOG"

3. Check firewall:
   - Allow inbound on port 8002 from machine IPs

4. Test manual punch:
   - Have someone punch in/out
   - Wait 1 minute
   - Re-run diagnostic

---

### ❌ ISSUE: API Endpoint Not Found

```
✅ Server IS receiving attendance push data
✅ Database has 47 attendance records
❌ API endpoint NOT found (HTTP 404)
   The /api/attendance endpoint is not implemented yet
```

**Root Cause**: The new REST API endpoint hasn't been deployed yet.

**Action**: Deploy the updated `managementAPI.js` file:

```bash
# Backup current file
cp managementAPI.js managementAPI.js.backup

# Upload new file (from your local machine)
scp managementAPI.js user@server:/path/to/app/

# Restart server
pm2 restart zkpush-server
# OR
pkill -f "node.*server.js" && nohup node server.js > server.log 2>&1 &
```

---

### ❌ ISSUE: Server Not Running

```
❌ Server is NOT running
   Start the server with: node server.js
```

**Action**: Start the server:

```bash
# Option 1: Direct start (for testing)
node server.js

# Option 2: Background with nohup
nohup node server.js > server.log 2>&1 &

# Option 3: With PM2 (recommended for production)
pm2 start server.js --name "zkpush-server"
pm2 save
```

---

### ⚠️ WARNING: Database Empty

```
✅ Server IS receiving attendance push data (but count is 0)
✅ attendance_logs table exists
⚠️  Database is empty - no attendance records stored yet
```

**Possible Causes**:
1. No actual punch activity yet (employees haven't punched in/out)
2. Machine configured but hasn't pushed data yet
3. Processing error (check server logs for exceptions)

**Action**: 
1. Check server logs for processing errors
2. Have someone punch in/out on the machine
3. Wait 1 minute and re-run diagnostic

---

## Common Scenarios

### Scenario 1: Fresh Deployment

**Expected Results**:
- ✅ Server running
- ✅ Port listening
- ✅ Devices reachable
- ⚠️ No ATTLOG activity yet (machines need to be configured)
- ✅ API endpoint working (returns empty array)

**Next Steps**:
1. Configure machines to push to server
2. Test with manual punch
3. Verify data appears in logs and database

### Scenario 2: After API Deployment

**Expected Results**:
- ✅ All green except possibly ATTLOG activity
- ✅ API endpoint returns HTTP 200

**Next Steps**:
1. Test API from external code
2. Verify external code gets attendance records
3. Monitor for any errors

### Scenario 3: Troubleshooting "undefined" Results

**Your Original Issue**:
```
Attendance results: undefined
```

**Root Cause**: External code is calling a REST API endpoint that doesn't exist (HTTP 404 = undefined).

**How Diagnostic Helps**:
```bash
./prod-attendance-diagnostic.sh
```

Will show:
- ✅ If server is running
- ✅ If database has records
- ❌ If API endpoint is missing (404)

**Fix**: Deploy updated `managementAPI.js` with the new `/api/attendance` endpoint.

---

## Real-Time Monitoring

### Watch Logs Live

```bash
# Watch all activity
tail -f server.log

# Watch only ATTLOG activity
tail -f server.log | grep "ATTLOG"

# Watch punch records
tail -f server.log | grep "PUNCH"

# Watch specific device
tail -f server.log | grep "10.10.10.8"
```

### Monitor Database Changes

```bash
# Watch database size grow
watch -n 5 'sqlite3 attendance.db "SELECT COUNT(*) FROM attendance_logs;"'

# Show recent records (updates every 2 seconds)
watch -n 2 'sqlite3 attendance.db "SELECT pin, punch_time FROM attendance_logs ORDER BY created_at DESC LIMIT 5;"'
```

---

## Troubleshooting Tips

### If Machines Won't Push

1. **Verify machine can reach server**:
   ```bash
   # From machine network
   ping YOUR_SERVER_IP
   curl http://YOUR_SERVER_IP:8002/iclock/ping?SN=TEST
   ```

2. **Check server firewall**:
   ```bash
   # On server
   iptables -L -n | grep 8002
   ufw status | grep 8002
   ```

3. **Test manual POST**:
   ```bash
   curl -X POST "http://localhost:8002/iclock/cdata?SN=TEST&table=ATTLOG&Stamp=1" \
        -d "123\t2026-06-26 10:35:00\t0\t1\t\t\t"
   ```
   
   Should see in logs:
   ```
   📋 ATTLOG PUNCH RECORD RECEIVED
   ```

### If API Returns 404

```bash
# Verify file was deployed
ls -lah managementAPI.js

# Check file modification date (should be recent)
stat managementAPI.js

# Verify new route exists in code
grep "getAttendance" managementAPI.js
grep "/attendance" managementAPI.js

# Restart server after deploying
pm2 restart zkpush-server
```

### If API Returns Error

```bash
# Check recent server logs
tail -n 100 server.log | grep -i error

# Test with verbose curl
curl -v "http://localhost:8002/api/attendance"

# Check database permissions
ls -la attendance.db
```

---

## Quick Reference

| Task | Command |
|------|---------|
| Run full diagnostic | `./prod-attendance-diagnostic.sh` |
| Check ATTLOG count | `grep -c "ATTLOG" server.log` |
| View recent punches | `grep "PUNCH" server.log \| tail -n 10` |
| Check DB count | `sqlite3 attendance.db "SELECT COUNT(*) FROM attendance_logs;"` |
| Test API | `curl "http://localhost:8002/api/attendance"` |
| Watch logs live | `tail -f server.log \| grep ATTLOG` |
| Restart server | `pm2 restart zkpush-server` |

---

## Support

For detailed troubleshooting scenarios, see:
- `ATTENDANCE-PUSH-DIAGNOSTIC-GUIDE.md` - Comprehensive guide
- `PRODUCTION-DEPLOYMENT-GUIDE.md` - Deployment instructions
- `IMPLEMENTATION-SUMMARY.md` - Technical details

For immediate help, run the diagnostic script and share the output.

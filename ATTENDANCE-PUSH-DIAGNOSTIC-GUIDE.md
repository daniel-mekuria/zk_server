# ZKTeco Attendance Push Protocol - Diagnostic Guide

## Current Implementation Status

✅ **IMPLEMENTED**: The server now has full attendance push protocol support with comprehensive logging.

### What's Already Working

1. **ATTLOGStamp Configuration** ✅
   - Server now returns `ATTLOGStamp=${config.attlogStamp || '0'}` instead of `'None'`
   - This tells devices to push attendance records

2. **ATTLOG Data Handler** ✅
   - Route: `POST /iclock/cdata?table=ATTLOG`
   - Method: `dataProcessor.processAttendanceLog()`
   - Database: `attendance_logs` table stores all punch records

3. **Comprehensive Logging** ✅
   - Server logs when ATTLOG data is received
   - Each punch record is logged with PIN, timestamp, verify type
   - Processing summary shows success/failure counts

## Diagnostic Logging - What to Look For

### 1. Check if Machines are Pushing Attendance Records

Look for these log markers in your server console:

```
══════════════════════════════════════════════════════════
📋 ATTLOG PUNCH RECORD RECEIVED
   Device: SERIAL123
   Timestamp: 2026-06-26T10:35:00.000Z
   Stamp: 12345
   Raw Data:
PIN123\t2026-06-26 10:35:00\t0\t1\t\t\t
══════════════════════════════════════════════════════════

[ATTLOG] Processing attendance log for device SERIAL123
   🕐 PUNCH | PIN: 123 | Time: 2026-06-26 10:35:00 | Status: 0 | Verify: 1 | WorkCode:  | Device: SERIAL123
   ✅ ATTLOG processed: 1/1 records saved for device SERIAL123
```

**If you DON'T see these logs**, it means machines are NOT pushing attendance data to the server.

### 2. Grep Server Logs for Quick Diagnosis

```bash
# Check if ANY attendance records have been received
grep "ATTLOG" server.log

# Check specific punch records
grep "PUNCH" server.log

# Check for specific device
grep "Device: 10.10.10.8" server.log
```

### 3. Check Database for Stored Attendance

```bash
# Connect to SQLite database
sqlite3 attendance.db

# Check if attendance_logs table exists
.tables

# View recent attendance records
SELECT * FROM attendance_logs ORDER BY created_at DESC LIMIT 10;

# Count records per device
SELECT device_serial, COUNT(*) as count FROM attendance_logs GROUP BY device_serial;
```

## Troubleshooting Based on Your 8 Points

### 1. 🖥️ ADMS Server IP Not Configured on Machine
**Symptom**: No logs at all - no "ATTLOG PUNCH RECORD RECEIVED"
**What to check on machine**:
- Menu → Comm → Cloud Server Settings
- Server IP should be your server's IP address
- Port should match your server port (default: 8002)
- Enable: ON

**How to verify**: Check server logs for device heartbeat:
```
🔄 PING - Device SERIAL123 heartbeat received
```
If you see heartbeat but no ATTLOG, the machine isn't configured to push attendance.

### 2. 🔥 Firewall Blocking Incoming Connections
**Symptom**: Device connects for user sync but no attendance push
**What to check**:
- Firewall must allow INBOUND on port 8002 from machine IPs
- Check with: `netstat -an | grep 8002` or `ss -tuln | grep 8002`

**Test**: Try curl from machine subnet to server:
```bash
curl http://YOUR_SERVER_IP:8002/iclock/ping?SN=TEST
```
Should return "OK"

### 3. 🌐 HRMS Endpoint Not Configured
**Status**: ✅ **FIXED** - Server now has `/iclock/cdata?table=ATTLOG` endpoint
**Verify**: Server startup shows:
```
ZK Push Server listening on port 8002
Protocol features enabled:
- User management
- Biometric data sync
- Device configuration
- Multi-device support
```

### 4. 🔄 Pull vs Push Mismatch
**Current Configuration**: Server configured for PUSH protocol
- Initialization response includes `ATTLOGStamp=0` (not 'None')
- This tells machines to push attendance in real-time

**How to verify**: Check initialization logs:
```
Device initialization: SERIAL123
🕐 Time synchronization configured: Server TimeZone=0, GMT Date header will be sent with all responses
```

### 5. 🕐 Real-Time vs. Scheduled Sync
**Current Configuration**: Real-time push enabled
- `Realtime=1` in initialization response
- `TransFlag=TransData ...` includes attendance data
- `TransInterval=1` (devices push every minute)

**Check device settings**:
- Menu → Comm → Push Settings
- Real-time mode: ON
- Transfer interval: 1 minute

### 6. 🔌 Machine on Different Subnet/VLAN
**Symptom**: User sync works but no attendance push
**What to check**:
- Bidirectional routing between machine subnet and server
- Machine can initiate connection to server (not just respond)
- Check ARP table and routing table

**Test**: From server, check if machine is reachable:
```bash
ping 10.10.10.8
curl http://10.10.10.8
```

### 7. 🔐 Authentication / Secret Key Mismatch
**Current Configuration**: No authentication required
- `Encrypt=None` in initialization response
- `pushCommKey` accepted but not validated

**If you add authentication later**, verify:
- Machine's pushcommkey matches server configuration
- Check `pushCommKey` parameter in device registration logs

### 8. ⏰ Machine Time Out of Sync
**Status**: ✅ **FIXED** - Time sync now working
**Check time sync logs**:
```
═══════════════════════════════════════════════════════
🕐 AUTO-SYNC: Forcing time synchronization for all devices
═══════════════════════════════════════════════════════
   ✅ SERIAL123
      Last seen: 6/26/2026, 10:35:00 AM
      Commands queued: CHECK, TimeZone, DateTime, ReloadOptions
```

**Verify on machine**:
- Menu → System → Date & Time
- Check if time matches server GMT time
- Enable NTP if available

## Adding Additional Diagnostic Logging

The server already has comprehensive attendance logging. Here's what's logged for EVERY attendance push:

1. **Reception Log** (in `server.js handleDataUpload`):
   - Device serial number
   - Timestamp of reception
   - Stamp value (last record ID)
   - Raw data payload

2. **Processing Log** (in `dataProcessor.js processAttendanceLog`):
   - Individual punch records with all fields
   - PIN, timestamp, status, verify type, work code
   - Success/failure per record
   - Summary count

3. **Database Storage**:
   - All records stored in `attendance_logs` table
   - Fields: pin, punch_time, status, verify_type, work_code, device_serial

## Next Steps if Attendance Records Still Not Arriving

### Step 1: Verify Machine Configuration
1. On the machine, go to Menu → Comm → Cloud Server Settings
2. Verify Server IP and Port
3. Check "Real-time Upload" is enabled
4. Check "TransData" includes "ATTLOG"

### Step 2: Monitor Server Logs in Real-Time
```bash
# Watch server logs for any ATTLOG activity
tail -f server.log | grep -E "ATTLOG|PUNCH|Device initialization"
```

### Step 3: Test Manual Punch
1. Have someone punch in/out on the machine
2. Wait 1 minute (TransInterval)
3. Check server logs for ATTLOG activity
4. If nothing appears, problem is machine → server communication

### Step 4: Check Network Connectivity
```bash
# From machine network, test server endpoint
curl -X POST "http://YOUR_SERVER:8002/iclock/cdata?SN=TEST&table=ATTLOG" \
     -d "123\t2026-06-26 10:35:00\t0\t1\t\t\t"
```
Should see server log:
```
📋 ATTLOG PUNCH RECORD RECEIVED
   Device: TEST
```

### Step 5: Verify Database Access
```bash
sqlite3 attendance.db "SELECT * FROM attendance_logs ORDER BY created_at DESC LIMIT 5;"
```

## Expected vs Actual Behavior

### ✅ What Should Happen (Normal Flow)

1. **Device Initialization** (every few minutes):
   ```
   GET /iclock/cdata?SN=SERIAL123&pushver=2.2.14...
   → Server returns: ATTLOGStamp=0, Realtime=1, TransFlag=TransData...
   ```

2. **User Punches In/Out**:
   ```
   [Machine] User 123 punches at 10:35:00
   [Machine] Queue: PIN=123, Time=10:35:00, Status=0, Verify=1
   ```

3. **Real-Time Push** (within 1 minute):
   ```
   POST /iclock/cdata?SN=SERIAL123&table=ATTLOG&Stamp=12345
   Body: 123\t2026-06-26 10:35:00\t0\t1\t\t\t
   
   → Server logs:
   📋 ATTLOG PUNCH RECORD RECEIVED
   🕐 PUNCH | PIN: 123 | Time: 2026-06-26 10:35:00 ...
   ✅ ATTLOG processed: 1/1 records saved
   ```

4. **Database Storage**:
   ```sql
   INSERT INTO attendance_logs VALUES (123, '2026-06-26 10:35:00', 0, 1, '', '', '', 'SERIAL123');
   ```

### ❌ What You're Currently Seeing

Based on your logs:
```
📡 Configured attendance machine IPs: 10.10.10.8, 10.10.10.9
Attempting to connect to ZK device at 10.10.10.8...
ok tcp
Successfully connected to ZK device at 10.10.10.8
Successfully got 0 attendances from 10.10.10.8
Attendance results: undefined
```

**Analysis**: This shows PULL attempt (SDK mode), not PUSH. Your external code is:
1. Connecting to machines directly (TCP/UDP)
2. Pulling attendance logs via SDK
3. Getting undefined because there's no API endpoint returning the data

**The Issue**: The external code expects a REST API endpoint to retrieve stored attendance data, but the server only has the PUSH receiver, not a GET endpoint for retrieval.

## Solution: Add REST API Endpoint

The spec already includes this fix:
- Add `GET /api/attendance` endpoint
- Query `attendance_logs` table
- Return JSON: `{ success: true, data: [...], count: N }`

This is covered in tasks 3.4 and 3.5 of the implementation plan.

## Summary

**Status**: Server-side PUSH protocol is fully implemented with comprehensive logging.

**Problem**: External code calling the system expects a REST API endpoint to retrieve stored attendance records, but that endpoint doesn't exist yet (returns 404/undefined).

**Next Step**: Implement the REST API endpoint as specified in the bugfix tasks (already in progress).

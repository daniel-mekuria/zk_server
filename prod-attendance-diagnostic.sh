#!/bin/bash
# ZKTeco Attendance Push Protocol - Production Diagnostic Script
# This script checks if attendance machines are pushing data to the server

echo "══════════════════════════════════════════════════════════"
echo "📊 ZKTeco Attendance Push Diagnostic"
echo "   Production Server Health Check"
echo "   Date: $(date)"
echo "══════════════════════════════════════════════════════════"
echo ""

# Configuration
LOG_FILE="${LOG_FILE:-server.log}"
DB_FILE="${DB_FILE:-attendance.db}"
DEVICES="10.10.10.8 10.10.10.9"

# Color codes for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print section headers
print_section() {
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check 1: Server Process Status
print_section "1️⃣  Server Process Status"
if pgrep -f "node.*server.js" > /dev/null; then
    PID=$(pgrep -f "node.*server.js")
    echo -e "${GREEN}✅ Server is running (PID: $PID)${NC}"
    echo "   Process details:"
    ps aux | grep "$PID" | grep -v grep
else
    echo -e "${RED}❌ Server is NOT running${NC}"
    echo "   Start the server with: node server.js"
    exit 1
fi

# Check 2: Server Port Listening
print_section "2️⃣  Network Port Status"
if command_exists netstat; then
    PORT_CHECK=$(netstat -tuln 2>/dev/null | grep ":8002" || echo "")
    if [ -n "$PORT_CHECK" ]; then
        echo -e "${GREEN}✅ Server is listening on port 8002${NC}"
        echo "$PORT_CHECK"
    else
        echo -e "${RED}❌ Server is NOT listening on port 8002${NC}"
    fi
elif command_exists ss; then
    PORT_CHECK=$(ss -tuln 2>/dev/null | grep ":8002" || echo "")
    if [ -n "$PORT_CHECK" ]; then
        echo -e "${GREEN}✅ Server is listening on port 8002${NC}"
        echo "$PORT_CHECK"
    else
        echo -e "${RED}❌ Server is NOT listening on port 8002${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  Cannot check port (netstat/ss not available)${NC}"
fi

# Check 3: Device Connectivity
print_section "3️⃣  Device Network Connectivity"
for DEVICE in $DEVICES; do
    echo -n "   Testing $DEVICE... "
    if ping -c 1 -W 2 "$DEVICE" > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Reachable${NC}"
    else
        echo -e "${RED}❌ NOT reachable${NC}"
    fi
done

# Check 4: Recent Log Activity
print_section "4️⃣  Recent Server Log Activity (Last 50 lines)"
if [ -f "$LOG_FILE" ]; then
    echo "   Log file: $LOG_FILE"
    echo "   Size: $(du -h "$LOG_FILE" 2>/dev/null | cut -f1)"
    echo "   Last modified: $(stat -c %y "$LOG_FILE" 2>/dev/null || stat -f %Sm "$LOG_FILE" 2>/dev/null)"
    echo ""
    tail -n 50 "$LOG_FILE"
else
    echo -e "${RED}❌ Log file not found: $LOG_FILE${NC}"
    echo "   Check if logging is enabled or specify correct path:"
    echo "   LOG_FILE=/path/to/server.log $0"
fi

# Check 5: ATTLOG Push Activity
print_section "5️⃣  ATTLOG Push Activity Analysis"
if [ -f "$LOG_FILE" ]; then
    ATTLOG_COUNT=$(grep -c "ATTLOG PUNCH RECORD RECEIVED" "$LOG_FILE" 2>/dev/null || echo "0")
    PUNCH_COUNT=$(grep -c "🕐 PUNCH" "$LOG_FILE" 2>/dev/null || echo "0")
    
    echo "   ATTLOG records received: $ATTLOG_COUNT"
    echo "   Punch records processed: $PUNCH_COUNT"
    echo ""
    
    if [ "$ATTLOG_COUNT" -gt 0 ]; then
        echo -e "${GREEN}✅ Server IS receiving attendance push data${NC}"
        echo ""
        echo "   Recent ATTLOG activity:"
        grep -A 5 "ATTLOG PUNCH RECORD RECEIVED" "$LOG_FILE" 2>/dev/null | tail -n 30
    else
        echo -e "${RED}❌ Server is NOT receiving attendance push data${NC}"
        echo ""
        echo "   Possible causes:"
        echo "   1. Machines not configured to push (check ADMS settings)"
        echo "   2. Firewall blocking machine → server traffic"
        echo "   3. No punch activity on machines yet"
        echo "   4. Real-time push disabled on machines"
    fi
else
    echo -e "${YELLOW}⚠️  Cannot analyze logs (file not found)${NC}"
fi

# Check 6: Device Heartbeat Activity
print_section "6️⃣  Device Heartbeat Activity"
if [ -f "$LOG_FILE" ]; then
    echo "   Checking for device connections in last 100 log lines..."
    echo ""
    
    for DEVICE in $DEVICES; do
        HEARTBEAT=$(grep "$DEVICE" "$LOG_FILE" 2>/dev/null | tail -n 5 || echo "")
        if [ -n "$HEARTBEAT" ]; then
            echo -e "${GREEN}✅ Device $DEVICE - Recent activity found:${NC}"
            echo "$HEARTBEAT" | sed 's/^/      /'
            echo ""
        else
            echo -e "${RED}❌ Device $DEVICE - No recent activity${NC}"
            echo ""
        fi
    done
else
    echo -e "${YELLOW}⚠️  Cannot check heartbeat (log file not found)${NC}"
fi

# Check 7: Database Status
print_section "7️⃣  Database Status"
if command_exists sqlite3; then
    if [ -f "$DB_FILE" ]; then
        echo "   Database file: $DB_FILE"
        echo "   Size: $(du -h "$DB_FILE" 2>/dev/null | cut -f1)"
        echo ""
        
        # Check if attendance_logs table exists
        TABLE_EXISTS=$(sqlite3 "$DB_FILE" "SELECT name FROM sqlite_master WHERE type='table' AND name='attendance_logs';" 2>/dev/null)
        
        if [ -n "$TABLE_EXISTS" ]; then
            echo -e "${GREEN}✅ attendance_logs table exists${NC}"
            echo ""
            
            # Count total records
            TOTAL_RECORDS=$(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM attendance_logs;" 2>/dev/null)
            echo "   Total attendance records: $TOTAL_RECORDS"
            
            # Count records per device
            echo ""
            echo "   Records per device:"
            sqlite3 "$DB_FILE" "SELECT device_serial, COUNT(*) as count FROM attendance_logs GROUP BY device_serial;" 2>/dev/null | while read line; do
                echo "      $line"
            done
            
            # Show recent records
            echo ""
            echo "   Recent attendance records (last 5):"
            sqlite3 "$DB_FILE" "SELECT pin, punch_time, status, verify_type, device_serial FROM attendance_logs ORDER BY created_at DESC LIMIT 5;" 2>/dev/null | while read line; do
                echo "      $line"
            done
            
            if [ "$TOTAL_RECORDS" -eq 0 ]; then
                echo ""
                echo -e "${YELLOW}⚠️  Database is empty - no attendance records stored yet${NC}"
            fi
        else
            echo -e "${RED}❌ attendance_logs table does NOT exist${NC}"
            echo "   This indicates database schema issue"
        fi
    else
        echo -e "${RED}❌ Database file not found: $DB_FILE${NC}"
        echo "   Specify correct path: DB_FILE=/path/to/attendance.db $0"
    fi
else
    echo -e "${YELLOW}⚠️  sqlite3 not installed - cannot check database${NC}"
    echo "   Install with: apt-get install sqlite3 (Ubuntu/Debian)"
    echo "             or: yum install sqlite (CentOS/RHEL)"
fi

# Check 8: API Endpoint Test
print_section "8️⃣  REST API Endpoint Test"
echo "   Testing GET /api/attendance endpoint..."
echo ""

API_RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" "http://localhost:8002/api/attendance?startDate=2026-06-25&endDate=2026-06-26" 2>/dev/null || echo "CURL_FAILED")

if [ "$API_RESPONSE" = "CURL_FAILED" ]; then
    echo -e "${RED}❌ Cannot connect to API (curl failed)${NC}"
    echo "   Is the server running?"
elif echo "$API_RESPONSE" | grep -q "HTTP_CODE:200"; then
    echo -e "${GREEN}✅ API endpoint is working (HTTP 200)${NC}"
    echo ""
    echo "   Response:"
    echo "$API_RESPONSE" | grep -v "HTTP_CODE:" | head -n 20
    
    # Check if response has data
    if echo "$API_RESPONSE" | grep -q '"count":0'; then
        echo ""
        echo -e "${YELLOW}⚠️  API returns no attendance records${NC}"
        echo "   This is normal if machines haven't pushed data yet"
    elif echo "$API_RESPONSE" | grep -q '"success":true'; then
        echo ""
        echo -e "${GREEN}✅ API has attendance data${NC}"
    fi
elif echo "$API_RESPONSE" | grep -q "HTTP_CODE:404"; then
    echo -e "${RED}❌ API endpoint NOT found (HTTP 404)${NC}"
    echo "   The /api/attendance endpoint is not implemented yet"
    echo "   Deploy the updated managementAPI.js file"
else
    HTTP_CODE=$(echo "$API_RESPONSE" | grep "HTTP_CODE:" | cut -d: -f2)
    echo -e "${RED}❌ API returned error (HTTP $HTTP_CODE)${NC}"
    echo ""
    echo "   Response:"
    echo "$API_RESPONSE" | grep -v "HTTP_CODE:"
fi

# Check 9: Recent Error Analysis
print_section "9️⃣  Recent Error Analysis"
if [ -f "$LOG_FILE" ]; then
    ERROR_COUNT=$(grep -i -E "error|exception|failed|undefined" "$LOG_FILE" 2>/dev/null | tail -n 20 | wc -l)
    
    if [ "$ERROR_COUNT" -gt 0 ]; then
        echo -e "${YELLOW}⚠️  Found $ERROR_COUNT recent errors/warnings${NC}"
        echo ""
        echo "   Recent errors:"
        grep -i -E "error|exception|failed|undefined" "$LOG_FILE" 2>/dev/null | tail -n 20 | sed 's/^/      /'
    else
        echo -e "${GREEN}✅ No recent errors found${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  Cannot analyze errors (log file not found)${NC}"
fi

# Summary
print_section "📋 DIAGNOSTIC SUMMARY"
echo ""

# Determine overall status
ISSUES=0

# Server running check
if ! pgrep -f "node.*server.js" > /dev/null; then
    echo -e "${RED}❌ Server is not running${NC}"
    ((ISSUES++))
fi

# ATTLOG activity check
if [ -f "$LOG_FILE" ]; then
    ATTLOG_COUNT=$(grep -c "ATTLOG PUNCH RECORD RECEIVED" "$LOG_FILE" 2>/dev/null || echo "0")
    if [ "$ATTLOG_COUNT" -eq 0 ]; then
        echo -e "${RED}❌ No ATTLOG push activity detected${NC}"
        echo "   Action: Check machine ADMS configuration"
        ((ISSUES++))
    else
        echo -e "${GREEN}✅ ATTLOG push is working ($ATTLOG_COUNT records received)${NC}"
    fi
fi

# Database check
if command_exists sqlite3 && [ -f "$DB_FILE" ]; then
    TOTAL_RECORDS=$(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM attendance_logs;" 2>/dev/null || echo "0")
    if [ "$TOTAL_RECORDS" -eq 0 ]; then
        echo -e "${YELLOW}⚠️  Database is empty${NC}"
        echo "   This is normal if no punches have been recorded yet"
    else
        echo -e "${GREEN}✅ Database has $TOTAL_RECORDS attendance records${NC}"
    fi
fi

# API endpoint check
if echo "$API_RESPONSE" | grep -q "HTTP_CODE:404"; then
    echo -e "${RED}❌ API endpoint not implemented${NC}"
    echo "   Action: Deploy updated managementAPI.js"
    ((ISSUES++))
elif echo "$API_RESPONSE" | grep -q "HTTP_CODE:200"; then
    echo -e "${GREEN}✅ API endpoint is working${NC}"
fi

echo ""
if [ "$ISSUES" -eq 0 ]; then
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}✅ All systems operational${NC}"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
else
    echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${RED}⚠️  Found $ISSUES issue(s) - review above sections${NC}"
    echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
fi

echo ""
echo "For detailed troubleshooting, see: ATTENDANCE-PUSH-DIAGNOSTIC-GUIDE.md"
echo ""

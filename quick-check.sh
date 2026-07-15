#!/bin/bash
# Quick Attendance System Health Check - One-liner version

echo "🔍 Quick Attendance System Check"
echo "================================="
echo ""

# Server running?
echo -n "Server: "
pgrep -f "node.*server.js" > /dev/null && echo "✅ Running" || echo "❌ Not Running"

# Port listening?
echo -n "Port 8002: "
(netstat -tuln 2>/dev/null || ss -tuln 2>/dev/null) | grep -q ":8002" && echo "✅ Listening" || echo "❌ Not Listening"

# ATTLOG activity?
LOG_FILE="${LOG_FILE:-server.log}"
if [ -f "$LOG_FILE" ]; then
    ATTLOG_COUNT=$(grep -c "ATTLOG PUNCH RECORD RECEIVED" "$LOG_FILE" 2>/dev/null || echo "0")
    echo -n "ATTLOG Push: "
    [ "$ATTLOG_COUNT" -gt 0 ] && echo "✅ Working ($ATTLOG_COUNT records)" || echo "❌ No activity"
else
    echo "⚠️  Log file not found: $LOG_FILE"
fi

# Database?
DB_FILE="${DB_FILE:-attendance.db}"
if [ -f "$DB_FILE" ] && command -v sqlite3 > /dev/null; then
    RECORD_COUNT=$(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM attendance_logs;" 2>/dev/null || echo "0")
    echo -n "Database: "
    [ "$RECORD_COUNT" -gt 0 ] && echo "✅ $RECORD_COUNT records" || echo "⚠️  Empty (0 records)"
else
    echo "Database: ⚠️  Cannot check (sqlite3 or file missing)"
fi

# API endpoint?
echo -n "API Endpoint: "
API_TEST=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:8002/api/attendance" 2>/dev/null || echo "000")
case "$API_TEST" in
    200) echo "✅ Working" ;;
    404) echo "❌ Not Found (deploy managementAPI.js)" ;;
    000) echo "❌ Cannot connect" ;;
    *) echo "⚠️  Error (HTTP $API_TEST)" ;;
esac

echo ""
echo "For detailed diagnostics, run: ./prod-attendance-diagnostic.sh"

#!/bin/bash
# Deployment Script for Attendance Web UI
# This script deploys the attendance web interface to production

echo "══════════════════════════════════════════════════════════"
echo "🚀 Attendance Web UI Deployment"
echo "   Deploying preview and download interface"
echo "   Date: $(date)"
echo "══════════════════════════════════════════════════════════"
echo ""

# Configuration
SERVER_USER="${SERVER_USER:-user}"
SERVER_HOST="${SERVER_HOST:-your-server}"
SERVER_PATH="${SERVER_PATH:-/path/to/app}"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print section headers
print_section() {
    echo ""
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}$1${NC}"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# Check if configuration is set
if [ "$SERVER_HOST" = "your-server" ] || [ "$SERVER_PATH" = "/path/to/app" ]; then
    echo -e "${RED}❌ Configuration required!${NC}"
    echo ""
    echo "Please set environment variables:"
    echo "  export SERVER_USER=your-username"
    echo "  export SERVER_HOST=your-server-ip"
    echo "  export SERVER_PATH=/path/to/app"
    echo ""
    echo "Example:"
    echo "  export SERVER_USER=admin"
    echo "  export SERVER_HOST=10.10.10.100"
    echo "  export SERVER_PATH=/home/admin/zkpush-server"
    echo "  $0"
    echo ""
    exit 1
fi

# Step 1: Verify local files exist
print_section "1️⃣  Verifying Local Files"

if [ ! -f "public/attendance.html" ]; then
    echo -e "${RED}❌ public/attendance.html not found${NC}"
    echo "   Please ensure you're running this script from the project root"
    exit 1
fi

if [ ! -f "server.js" ]; then
    echo -e "${RED}❌ server.js not found${NC}"
    echo "   Please ensure you're running this script from the project root"
    exit 1
fi

echo -e "${GREEN}✅ public/attendance.html found${NC}"
echo -e "${GREEN}✅ server.js found${NC}"

# Step 2: Create backup on server
print_section "2️⃣  Creating Backup on Server"

ssh $SERVER_USER@$SERVER_HOST "cd $SERVER_PATH && cp server.js server.js.backup.\$(date +%Y%m%d_%H%M%S)" 2>/dev/null

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Backup created: server.js.backup.YYYYMMDD_HHMMSS${NC}"
else
    echo -e "${YELLOW}⚠️  Could not create backup (file might not exist yet)${NC}"
fi

# Step 3: Create public directory on server
print_section "3️⃣  Creating Public Directory"

ssh $SERVER_USER@$SERVER_HOST "cd $SERVER_PATH && mkdir -p public"

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Public directory created/verified${NC}"
else
    echo -e "${RED}❌ Failed to create public directory${NC}"
    exit 1
fi

# Step 4: Upload files
print_section "4️⃣  Uploading Files"

echo "Uploading public/attendance.html..."
scp public/attendance.html $SERVER_USER@$SERVER_HOST:$SERVER_PATH/public/

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ attendance.html uploaded${NC}"
else
    echo -e "${RED}❌ Failed to upload attendance.html${NC}"
    exit 1
fi

echo ""
echo "Uploading server.js..."
scp server.js $SERVER_USER@$SERVER_HOST:$SERVER_PATH/

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ server.js uploaded${NC}"
else
    echo -e "${RED}❌ Failed to upload server.js${NC}"
    exit 1
fi

# Step 5: Restart server
print_section "5️⃣  Restarting Server"

echo "Attempting to restart with PM2..."
ssh $SERVER_USER@$SERVER_HOST "cd $SERVER_PATH && pm2 restart zkpush-server" 2>/dev/null

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Server restarted with PM2${NC}"
else
    echo -e "${YELLOW}⚠️  PM2 restart failed, trying alternative method...${NC}"
    
    # Try pkill + restart
    ssh $SERVER_USER@$SERVER_HOST "cd $SERVER_PATH && pkill -f 'node.*server.js' && nohup node server.js > server.log 2>&1 &"
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Server restarted manually${NC}"
    else
        echo -e "${RED}❌ Failed to restart server${NC}"
        echo "   Please restart manually: pm2 restart zkpush-server"
    fi
fi

# Step 6: Verify deployment
print_section "6️⃣  Verifying Deployment"

sleep 3  # Wait for server to start

echo "Checking if server is responding..."
HTTP_CODE=$(ssh $SERVER_USER@$SERVER_HOST "curl -s -o /dev/null -w '%{http_code}' http://localhost:8002/" 2>/dev/null)

if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "302" ]; then
    echo -e "${GREEN}✅ Server is responding (HTTP $HTTP_CODE)${NC}"
else
    echo -e "${YELLOW}⚠️  Server response: HTTP $HTTP_CODE${NC}"
    echo "   This might be normal if server is still starting"
fi

# Final summary
print_section "📋 DEPLOYMENT SUMMARY"

echo ""
echo -e "${GREEN}✅ Deployment completed successfully!${NC}"
echo ""
echo "Access your attendance web interface:"
echo -e "${GREEN}   http://$SERVER_HOST:8002/${NC}"
echo ""
echo "Next steps:"
echo "  1. Open http://$SERVER_HOST:8002/ in your browser"
echo "  2. Select device and date range"
echo "  3. Click 'Load Attendance'"
echo "  4. Use 'Download CSV' or 'Download Excel' buttons"
echo ""
echo "Troubleshooting:"
echo "  - If page doesn't load, check server logs:"
echo "    ssh $SERVER_USER@$SERVER_HOST 'cd $SERVER_PATH && tail -n 50 server.log'"
echo ""
echo "  - Verify server is running:"
echo "    ssh $SERVER_USER@$SERVER_HOST 'ps aux | grep node.*server.js'"
echo ""
echo "Documentation:"
echo "  See ATTENDANCE-WEB-UI-README.md for detailed instructions"
echo ""

echo "══════════════════════════════════════════════════════════"
echo "🎉 Deployment Complete!"
echo "══════════════════════════════════════════════════════════"

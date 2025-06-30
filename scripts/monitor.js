#!/usr/bin/env node

require('dotenv').config();
const { pool, testConnection } = require('../database/connection');
const moment = require('moment');

// ANSI color codes for console output
const colors = {
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    reset: '\x1b[0m',
    bright: '\x1b[1m'
};

// Display server status
async function showServerStatus() {
    console.log(`${colors.bright}${colors.blue}🖥️  ZKTeco Sync Server Status${colors.reset}\n`);
    
    try {
        await testConnection();
        console.log(`${colors.green}✓ Database connection: OK${colors.reset}`);
        
        const startTime = process.uptime();
        const uptime = moment.duration(startTime, 'seconds').humanize();
        console.log(`${colors.green}✓ Server uptime: ${uptime}${colors.reset}`);
        
        // Get database stats
        const [tables] = await pool.execute(`
            SELECT 
                TABLE_NAME as table_name,
                TABLE_ROWS as row_count
            FROM information_schema.TABLES 
            WHERE TABLE_SCHEMA = ?
            ORDER BY TABLE_NAME
        `, [process.env.DB_NAME || 'zkteco_sync']);
        
        console.log(`\n${colors.bright}📊 Database Statistics:${colors.reset}`);
        tables.forEach(table => {
            console.log(`  ${table.table_name}: ${table.row_count} records`);
        });
        
    } catch (error) {
        console.log(`${colors.red}✗ Database connection: FAILED${colors.reset}`);
        console.log(`  Error: ${error.message}`);
    }
}

// Display device status
async function showDeviceStatus() {
    console.log(`\n${colors.bright}${colors.blue}📱 Connected Devices${colors.reset}\n`);
    
    try {
        const [devices] = await pool.execute(`
            SELECT 
                serial_number,
                ip_address,
                status,
                firmware_version,
                user_count,
                fingerprint_count,
                face_count,
                last_seen,
                TIMESTAMPDIFF(MINUTE, last_seen, NOW()) as minutes_ago
            FROM devices 
            ORDER BY status DESC, last_seen DESC
        `);
        
        if (devices.length === 0) {
            console.log(`${colors.yellow}No devices registered${colors.reset}`);
            return;
        }
        
        console.log('Serial Number       IP Address       Status    Firmware    Users  FP    Face  Last Seen');
        console.log('─'.repeat(90));
        
        devices.forEach(device => {
            const statusColor = device.status === 'online' ? colors.green : colors.red;
            const lastSeen = device.minutes_ago < 60 ? 
                `${device.minutes_ago}m ago` : 
                moment(device.last_seen).format('MM-DD HH:mm');
            
            console.log(
                `${device.serial_number.padEnd(18)} ` +
                `${(device.ip_address || 'N/A').padEnd(15)} ` +
                `${statusColor}${device.status.padEnd(7)}${colors.reset} ` +
                `${(device.firmware_version || 'N/A').padEnd(10)} ` +
                `${String(device.user_count).padEnd(5)} ` +
                `${String(device.fingerprint_count).padEnd(5)} ` +
                `${String(device.face_count).padEnd(5)} ` +
                `${lastSeen}`
            );
        });
        
        // Summary
        const onlineCount = devices.filter(d => d.status === 'online').length;
        const offlineCount = devices.length - onlineCount;
        
        console.log(`\n${colors.bright}Summary:${colors.reset} ${colors.green}${onlineCount} online${colors.reset}, ${colors.red}${offlineCount} offline${colors.reset}`);
        
    } catch (error) {
        console.log(`${colors.red}✗ Error fetching device status: ${error.message}${colors.reset}`);
    }
}

// Display command queue status
async function showCommandQueue() {
    console.log(`\n${colors.bright}${colors.blue}📤 Command Queue Status${colors.reset}\n`);
    
    try {
        const [queueStats] = await pool.execute(`
            SELECT 
                device_serial,
                status,
                command_type,
                COUNT(*) as count,
                MIN(created_at) as oldest,
                MAX(created_at) as newest
            FROM device_commands 
            WHERE created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)
            GROUP BY device_serial, status, command_type
            ORDER BY device_serial, status
        `);
        
        if (queueStats.length === 0) {
            console.log(`${colors.green}✓ No commands in queue${colors.reset}`);
            return;
        }
        
        console.log('Device              Status     Type                    Count  Oldest');
        console.log('─'.repeat(75));
        
        queueStats.forEach(stat => {
            const statusColor = stat.status === 'pending' ? colors.yellow : 
                               stat.status === 'completed' ? colors.green : colors.red;
            const oldest = moment(stat.oldest).fromNow();
            
            console.log(
                `${stat.device_serial.padEnd(18)} ` +
                `${statusColor}${stat.status.padEnd(9)}${colors.reset} ` +
                `${stat.command_type.padEnd(22)} ` +
                `${String(stat.count).padEnd(5)} ` +
                `${oldest}`
            );
        });
        
        // Get pending count
        const [pendingCount] = await pool.execute(`
            SELECT COUNT(*) as count FROM device_commands WHERE status = 'pending'
        `);
        
        if (pendingCount[0].count > 0) {
            console.log(`\n${colors.yellow}⚠️  ${pendingCount[0].count} commands pending execution${colors.reset}`);
        }
        
    } catch (error) {
        console.log(`${colors.red}✗ Error fetching command queue: ${error.message}${colors.reset}`);
    }
}

// Display recent sync activity
async function showRecentActivity() {
    console.log(`\n${colors.bright}${colors.blue}🔄 Recent Sync Activity${colors.reset}\n`);
    
    try {
        const [activities] = await pool.execute(`
            (SELECT 'USER' as type, pin as identifier, updated_at as timestamp FROM users WHERE updated_at > DATE_SUB(NOW(), INTERVAL 1 HOUR))
            UNION ALL
            (SELECT 'FINGERPRINT' as type, CONCAT(pin, ':', finger_id) as identifier, updated_at as timestamp FROM fingerprint_templates WHERE updated_at > DATE_SUB(NOW(), INTERVAL 1 HOUR))
            UNION ALL
            (SELECT 'FACE' as type, CONCAT(pin, ':', face_id) as identifier, updated_at as timestamp FROM face_templates WHERE updated_at > DATE_SUB(NOW(), INTERVAL 1 HOUR))
            UNION ALL
            (SELECT 'BIODATA' as type, CONCAT(pin, ':', bio_type, ':', bio_number) as identifier, updated_at as timestamp FROM biometric_templates WHERE updated_at > DATE_SUB(NOW(), INTERVAL 1 HOUR))
            ORDER BY timestamp DESC
            LIMIT 20
        `);
        
        if (activities.length === 0) {
            console.log(`${colors.yellow}No recent activity in the last hour${colors.reset}`);
            return;
        }
        
        console.log('Type        Identifier           Time');
        console.log('─'.repeat(45));
        
        activities.forEach(activity => {
            const timeAgo = moment(activity.timestamp).fromNow();
            console.log(
                `${activity.type.padEnd(10)} ` +
                `${activity.identifier.padEnd(18)} ` +
                `${timeAgo}`
            );
        });
        
    } catch (error) {
        console.log(`${colors.red}✗ Error fetching recent activity: ${error.message}${colors.reset}`);
    }
}

// Main monitoring function
async function runMonitor() {
    console.clear();
    
    await showServerStatus();
    await showDeviceStatus();
    await showCommandQueue();
    await showRecentActivity();
    
    console.log(`\n${colors.bright}Last updated: ${moment().format('YYYY-MM-DD HH:mm:ss')}${colors.reset}`);
    console.log(`${colors.blue}Press Ctrl+C to exit${colors.reset}\n`);
}

// Command line arguments
const args = process.argv.slice(2);
const command = args[0];

if (command === 'watch') {
    // Continuous monitoring mode
    console.log(`${colors.bright}${colors.blue}Starting ZKTeco Sync Server Monitor...${colors.reset}\n`);
    
    runMonitor();
    setInterval(runMonitor, 30000); // Update every 30 seconds
    
} else if (command === 'devices') {
    // Show only device status
    showDeviceStatus().then(() => process.exit(0));
    
} else if (command === 'queue') {
    // Show only command queue
    showCommandQueue().then(() => process.exit(0));
    
} else if (command === 'activity') {
    // Show only recent activity
    showRecentActivity().then(() => process.exit(0));
    
} else {
    // Single run - show all
    runMonitor().then(() => process.exit(0));
}

// Graceful shutdown
process.on('SIGINT', () => {
    console.log(`\n${colors.bright}Monitor stopped${colors.reset}`);
    process.exit(0);
}); 
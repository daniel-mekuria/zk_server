#!/usr/bin/env node

/**
 * Sync Time for All Devices
 * 
 * This script sends time sync commands to all active devices
 * to force them to update their time immediately.
 * 
 * Usage: node sync-all-devices-time.js
 */

const Database = require('./database');
const CommandManager = require('./commandManager');

async function syncAllDevicesTime() {
    console.log('🕐 Starting time synchronization for all devices...');
    console.log('');

    const db = new Database();
    const commandManager = new CommandManager(db);

    try {
        // Initialize database
        await db.initialize();

        // Get all devices
        const devices = await db.all('SELECT serial_number, last_seen FROM devices ORDER BY last_seen DESC');

        if (!devices || devices.length === 0) {
            console.log('⚠️  No devices found in database.');
            console.log('   Devices will sync automatically when they connect.');
            return;
        }

        console.log(`📊 Found ${devices.length} device(s)`);
        console.log('');

        const results = [];

        // Sync time for each device
        for (const device of devices) {
            console.log(`🔄 Syncing time for device: ${device.serial_number}`);
            
            try {
                const result = await commandManager.syncDeviceTime(device.serial_number);
                results.push({
                    device: device.serial_number,
                    success: result.success,
                    timezone: result.timezone,
                    localTime: result.localTime
                });
                
                if (result.success) {
                    console.log(`   ✅ Time sync commands queued successfully`);
                } else {
                    console.log(`   ❌ Failed to queue time sync commands`);
                }
            } catch (error) {
                console.error(`   ❌ Error syncing device ${device.serial_number}:`, error.message);
                results.push({
                    device: device.serial_number,
                    success: false,
                    error: error.message
                });
            }
            
            console.log('');
        }

        // Summary
        const successCount = results.filter(r => r.success).length;
        console.log('═══════════════════════════════════════════════════════');
        console.log('📊 SUMMARY');
        console.log('═══════════════════════════════════════════════════════');
        console.log(`Total devices: ${devices.length}`);
        console.log(`Successfully queued: ${successCount}`);
        console.log(`Failed: ${devices.length - successCount}`);
        console.log('');
        console.log('⏰ NEXT STEPS:');
        console.log('   1. Devices will process CHECK commands within 1-2 minutes');
        console.log('   2. Devices will request new configuration from server');
        console.log('   3. Devices will receive updated TimeZone parameter');
        console.log('   4. Devices will update their clocks to local time');
        console.log('');
        console.log('✅ Time synchronization process initiated!');

    } catch (error) {
        console.error('❌ Error during time synchronization:', error);
        process.exit(1);
    } finally {
        // Close database connection
        if (db.db) {
            db.db.close();
        }
    }
}

// Run the sync
syncAllDevicesTime()
    .then(() => {
        console.log('');
        console.log('🎉 Time sync script completed!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('');
        console.error('❌ Time sync script failed:', error);
        process.exit(1);
    });

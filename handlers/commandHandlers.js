const { pool } = require('../database/connection');

// Generate unique command ID
function generateCommandId() {
    return Math.random().toString(36).substr(2, 8) + Date.now().toString(36);
}

// Get pending commands for a device
async function getDeviceCommands(deviceSerial) {
    try {
        const [commands] = await pool.execute(`
            SELECT * FROM device_commands 
            WHERE device_serial = ? AND status = 'pending'
            ORDER BY created_at ASC
            LIMIT 1
        `, [deviceSerial]);
        
        return commands;
    } catch (error) {
        console.error('Error getting device commands:', error);
        return [];
    }
}

// Mark command as sent
async function markCommandSent(commandId) {
    try {
        await pool.execute(`
            UPDATE device_commands 
            SET status = 'sent', sent_at = NOW()
            WHERE id = ?
        `, [commandId]);
    } catch (error) {
        console.error('Error marking command as sent:', error);
    }
}

// Mark command as completed
async function markCommandCompleted(commandId, returnCode) {
    try {
        const status = returnCode === '0' ? 'completed' : 'failed';
        
        await pool.execute(`
            UPDATE device_commands 
            SET status = ?, completed_at = NOW()
            WHERE command_id = ?
        `, [status, commandId]);
        
        // If failed, increment retry count
        if (status === 'failed') {
            await pool.execute(`
                UPDATE device_commands 
                SET retry_count = retry_count + 1
                WHERE command_id = ? AND retry_count < 3
            `, [commandId]);
            
            // Reset to pending for retry if under limit
            await pool.execute(`
                UPDATE device_commands 
                SET status = 'pending', sent_at = NULL
                WHERE command_id = ? AND retry_count < 3
            `, [commandId]);
        }
        
    } catch (error) {
        console.error('Error marking command as completed:', error);
    }
}

// Queue command for all devices except source
async function queueCommandForOtherDevices(sourceDevice, commandType, commandData) {
    try {
        // Get all online devices except the source
        const [devices] = await pool.execute(`
            SELECT serial_number FROM devices 
            WHERE serial_number != ? AND status = 'online'
        `, [sourceDevice]);
        
        // Queue command for each device
        for (const device of devices) {
            const commandId = generateCommandId();
            
            await pool.execute(`
                INSERT INTO device_commands (device_serial, command_id, command_type, command_data, status)
                VALUES (?, ?, ?, ?, 'pending')
            `, [device.serial_number, commandId, commandType, commandData]);
        }
        
        if (devices.length > 0) {
            console.log(`📤 Queued ${commandType} command for ${devices.length} devices`);
        }
        
    } catch (error) {
        console.error('Error queuing command for other devices:', error);
    }
}

// Queue command for specific device
async function queueCommandForDevice(deviceSerial, commandType, commandData) {
    try {
        const commandId = generateCommandId();
        
        await pool.execute(`
            INSERT INTO device_commands (device_serial, command_id, command_type, command_data, status)
            VALUES (?, ?, ?, ?, 'pending')
        `, [deviceSerial, commandId, commandType, commandData]);
        
    } catch (error) {
        console.error('Error queuing command for device:', error);
    }
}

// Clean up old completed commands
async function cleanupOldCommands() {
    try {
        await pool.execute(`
            DELETE FROM device_commands 
            WHERE status IN ('completed', 'failed') 
            AND completed_at < DATE_SUB(NOW(), INTERVAL 24 HOUR)
        `);
        
        // Also clean up very old pending commands that were never sent
        await pool.execute(`
            DELETE FROM device_commands 
            WHERE status = 'pending' 
            AND created_at < DATE_SUB(NOW(), INTERVAL 1 HOUR)
            AND retry_count >= 3
        `);
        
    } catch (error) {
        console.error('Error cleaning up old commands:', error);
    }
}

// Get command queue status for monitoring
async function getCommandQueueStatus() {
    try {
        const [stats] = await pool.execute(`
            SELECT 
                status,
                COUNT(*) as count,
                device_serial
            FROM device_commands 
            WHERE created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)
            GROUP BY status, device_serial
            ORDER BY device_serial, status
        `);
        
        return stats;
    } catch (error) {
        console.error('Error getting command queue status:', error);
        return [];
    }
}

// Handle device deletion commands
async function queueDeleteUserCommand(pin, sourceDevice) {
    try {
        const commandData = `DATA DELETE USERINFO PIN=${pin}`;
        await queueCommandForOtherDevices(sourceDevice, 'DATA_DELETE_USER', commandData);
    } catch (error) {
        console.error('Error queuing delete user command:', error);
    }
}

async function queueDeleteFingerprintCommand(pin, fingerId, sourceDevice) {
    try {
        let commandData;
        if (fingerId !== undefined) {
            commandData = `DATA DELETE FINGERTMP PIN=${pin}\tFID=${fingerId}`;
        } else {
            commandData = `DATA DELETE FINGERTMP PIN=${pin}`;
        }
        await queueCommandForOtherDevices(sourceDevice, 'DATA_DELETE_FINGERPRINT', commandData);
    } catch (error) {
        console.error('Error queuing delete fingerprint command:', error);
    }
}

async function queueDeleteFaceCommand(pin, sourceDevice) {
    try {
        const commandData = `DATA DELETE FACE PIN=${pin}`;
        await queueCommandForOtherDevices(sourceDevice, 'DATA_DELETE_FACE', commandData);
    } catch (error) {
        console.error('Error queuing delete face command:', error);
    }
}

async function queueDeleteBioDataCommand(pin, bioType, bioNumber, sourceDevice) {
    try {
        let commandData = `DATA DELETE BIODATA Pin=${pin}`;
        if (bioType !== undefined) {
            commandData += `\tType=${bioType}`;
            if (bioNumber !== undefined) {
                commandData += `\tNo=${bioNumber}`;
            }
        }
        await queueCommandForOtherDevices(sourceDevice, 'DATA_DELETE_BIODATA', commandData);
    } catch (error) {
        console.error('Error queuing delete biometric data command:', error);
    }
}

// Sync data to a newly connected device
async function syncNewDevice(deviceSerial) {
    try {
        console.log(`🔄 Starting sync for newly connected device: ${deviceSerial}`);
        
        // Import syncAllDataToDevice function
        const { syncAllDataToDevice } = require('./dataHandlers');
        await syncAllDataToDevice(deviceSerial);
        
    } catch (error) {
        console.error('Error syncing new device:', error);
    }
}

// Initialize command cleanup interval
setInterval(cleanupOldCommands, 60000 * 60); // Clean up every hour

module.exports = {
    generateCommandId,
    getDeviceCommands,
    markCommandSent,
    markCommandCompleted,
    queueCommandForOtherDevices,
    queueCommandForDevice,
    cleanupOldCommands,
    getCommandQueueStatus,
    queueDeleteUserCommand,
    queueDeleteFingerprintCommand,
    queueDeleteFaceCommand,
    queueDeleteBioDataCommand,
    syncNewDevice
}; 
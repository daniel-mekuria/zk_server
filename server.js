const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const moment = require('moment');
require('dotenv').config();
const { pool, testConnection } = require('./database/connection');
const { migrate } = require('./migrate');
const { 
    handleUserData, 
    handleFingerprintData, 
    handleFaceData, 
    handleBioData,
    syncDataToDevices 
} = require('./handlers/dataHandlers');
const { 
    generateCommandId, 
    getDeviceCommands, 
    markCommandSent,
    markCommandCompleted 
} = require('./handlers/commandHandlers');

const app = express();
const PORT = process.env.PORT || 8081;

// Middleware
app.use(cors());
app.use(bodyParser.text({ type: '*/*' })); // Handle raw text data
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Custom middleware to parse ZKTeco data format
app.use((req, res, next) => {
    if (req.headers['content-type'] && req.headers['content-type'].includes('application/x-www-form-urlencoded')) {
        // Already parsed by urlencoded middleware
        next();
    } else if (typeof req.body === 'string' && req.body.length > 0) {
        // Parse tab-separated data format used by ZKTeco devices
        req.zkData = req.body;
        next();
    } else {
        next();
    }
});

// 1. Initialization Information Exchange - Device Registration
app.get('/iclock/cdata', async (req, res) => {
    const { SN: serialNumber, options, pushver, language } = req.query;
    
    if (!serialNumber) {
        return res.status(400).send('Serial number required');
    }

    try {
        // Get client IP
        const clientIp = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
        
        // Register or update device
        await pool.execute(`
            INSERT INTO devices (serial_number, ip_address, push_version, language, status, last_seen)
            VALUES (?, ?, ?, ?, 'online', NOW())
            ON DUPLICATE KEY UPDATE
            ip_address = VALUES(ip_address),
            push_version = VALUES(push_version),
            language = VALUES(language),
            status = 'online',
            last_seen = NOW()
        `, [serialNumber, clientIp, pushver || '2.4.1', language || '69']);

        // Get sync timestamps (simplified - using current timestamp)
        const currentTime = moment().format('YYYY-MM-DD HH:mm:ss');
        
        // Configuration response according to protocol
        const config = [
            `GET OPTION FROM: ${serialNumber}`,
            'ATTLOGStamp=None',
            'OPERLOGStamp=None',
            'ATTPHOTOStamp=None',
            'BIODATAStamp=None',
            'ErrorDelay=30',
            'Delay=10',
            'TransTimes=00:00;12:00',
            'TransInterval=1',
            'TransFlag=TransData AttLog OpLog AttPhoto EnrollUser ChgUser EnrollFP ChgFP UserPic FACE WORKCODE BioPhoto',
            'TimeZone=0',
            'Realtime=1',
            'Encrypt=None',
            'ServerVer=2.4.1',
            'PushProtVer=2.4.1',
            'PushOptionsFlag=1',
            'PushOptions=FingerFunOn,FaceFunOn,BioDataFun,BioPhotoFun',
            'MultiBioDataSupport=0:1:1:0:0:0:0:0:0:1',
            'MultiBioPhotoSupport=0:1:1:0:0:0:0:0:0:1'
        ].join('\n');

        // Set required headers
        res.set({
            'Date': new Date().toUTCString(),
            'Content-Type': 'text/plain',
            'Pragma': 'no-cache',
            'Cache-Control': 'no-store'
        });

        res.send(config);
        console.log(`✓ Device ${serialNumber} registered/updated from ${clientIp}`);
        
    } catch (error) {
        console.error('Error in device registration:', error);
        res.status(500).send('Internal server error');
    }
});

// 2. Data Upload Handler - Handles user info, fingerprints, faces, etc.
app.post('/iclock/cdata', async (req, res) => {
    const { SN: serialNumber, table, Stamp } = req.query;
    
    if (!serialNumber) {
        return res.status(400).send('Serial number required');
    }

    try {
        // Update device last seen
        await pool.execute(
            'UPDATE devices SET last_seen = NOW(), status = "online" WHERE serial_number = ?',
            [serialNumber]
        );

        const data = req.zkData || req.body;
        
        if (!data || data.trim() === '') {
            return res.send('OK: 0');
        }

        let processedCount = 0;

        // Handle different table types
        switch (table) {
            case 'OPERLOG':
                processedCount = await handleOperationLog(data, serialNumber);
                break;
            case 'ATTLOG':
                // Skip attendance logs - only sync user/biometric data
                processedCount = 0;
                break;
            case 'BIODATA':
                processedCount = await handleBioData(data, serialNumber);
                break;
            default:
                // Parse the data to determine type
                processedCount = await parseAndHandleData(data, serialNumber);
                break;
        }

        res.send(`OK: ${processedCount}`);
        console.log(`✓ Processed ${processedCount} records from device ${serialNumber}`);
        
    } catch (error) {
        console.error('Error processing data upload:', error);
        res.status(500).send('Error processing data');
    }
});

// Parse uploaded data and handle different types
async function parseAndHandleData(data, serialNumber) {
    const lines = data.split('\n').filter(line => line.trim());
    let processedCount = 0;

    for (const line of lines) {
        try {
            if (line.startsWith('USER ')) {
                await handleUserData(line, serialNumber);
                processedCount++;
            } else if (line.startsWith('FP ')) {
                await handleFingerprintData(line, serialNumber);
                processedCount++;
            } else if (line.startsWith('FACE ')) {
                await handleFaceData(line, serialNumber);
                processedCount++;
            } else if (line.startsWith('BIODATA ')) {
                await handleBioData(line, serialNumber);
                processedCount++;
            }
        } catch (error) {
            console.error(`Error processing line: ${line}`, error);
        }
    }

    return processedCount;
}

// Handle operation logs (user/template changes)
async function handleOperationLog(data, serialNumber) {
    const lines = data.split('\n').filter(line => line.trim());
    let processedCount = 0;

    for (const line of lines) {
        try {
            if (line.startsWith('USER ')) {
                await handleUserData(line, serialNumber);
                processedCount++;
            } else if (line.startsWith('FP ')) {
                await handleFingerprintData(line, serialNumber);
                processedCount++;
            } else if (line.startsWith('FACE ')) {
                await handleFaceData(line, serialNumber);
                processedCount++;
            } else if (line.startsWith('BIODATA ')) {
                await handleBioData(line, serialNumber);
                processedCount++;
            }
        } catch (error) {
            console.error(`Error processing operation log line: ${line}`, error);
        }
    }

    return processedCount;
}

// 3. Get Commands - Devices poll for commands
app.get('/iclock/getrequest', async (req, res) => {
    const { SN: serialNumber, INFO } = req.query;
    
    if (!serialNumber) {
        return res.status(400).send('Serial number required');
    }

    try {
        // Update device info if provided
        if (INFO) {
            const infoParams = INFO.split(',');
            if (infoParams.length >= 5) {
                await pool.execute(`
                    UPDATE devices SET 
                    firmware_version = ?,
                    user_count = ?,
                    fingerprint_count = ?,
                    face_count = ?,
                    last_seen = NOW(),
                    status = 'online'
                    WHERE serial_number = ?
                `, [infoParams[0], infoParams[1], infoParams[2], infoParams[3], serialNumber]);
            }
        }

        // Get pending commands for this device
        const commands = await getDeviceCommands(serialNumber);
        
        res.set({
            'Date': new Date().toUTCString(),
            'Content-Type': 'text/plain',
            'Pragma': 'no-cache',
            'Cache-Control': 'no-store'
        });

        if (commands.length === 0) {
            res.send('OK');
        } else {
            // Send first pending command
            const command = commands[0];
            await markCommandSent(command.id);
            res.send(`C:${command.command_id}:${command.command_data}`);
            console.log(`✓ Sent command to device ${serialNumber}: ${command.command_type}`);
        }
        
    } catch (error) {
        console.error('Error getting commands:', error);
        res.status(500).send('Error getting commands');
    }
});

// 4. Command Reply Handler
app.post('/iclock/devicecmd', async (req, res) => {
    const { SN: serialNumber } = req.query;
    
    if (!serialNumber) {
        return res.status(400).send('Serial number required');
    }

    try {
        const replyData = req.zkData || req.body;
        
        // Parse command replies
        const replies = replyData.split('\n').filter(line => line.trim());
        
        for (const reply of replies) {
            const match = reply.match(/ID=([^&]+)&Return=([^&]+)&CMD=(.+)/);
            if (match) {
                const [, commandId, returnCode, cmdType] = match;
                await markCommandCompleted(commandId, returnCode);
                console.log(`✓ Command ${commandId} completed by ${serialNumber} with result: ${returnCode}`);
            }
        }

        res.set({
            'Date': new Date().toUTCString(),
            'Content-Type': 'text/plain'
        });
        res.send('OK');
        
    } catch (error) {
        console.error('Error processing command reply:', error);
        res.status(500).send('Error processing reply');
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Start server
async function startServer() {
    try {
        console.log('🏗️  Initializing ZKTeco Sync Server...\n');
        
        // Step 1: Run database migration
        console.log('📋 Running database migration...');
        await migrate({ quiet: true });
        console.log('✅ Database migration completed\n');
        
        // Database connection already verified by migration
        
        // Step 2: Start the server
        app.listen(PORT, () => {
            console.log(`🚀 ZKTeco Sync Server running on port ${PORT}`);
            console.log(`📡 Ready to sync user and biometric data across devices`);
            console.log(`🌐 Server endpoints available at: http://localhost:${PORT}`);
            console.log(`📊 Health check: http://localhost:${PORT}/health`);
        });
        
        // Step 3: Setup periodic cleanup
        setInterval(async () => {
            try {
                await pool.execute(`
                    UPDATE devices 
                    SET status = 'offline' 
                    WHERE last_seen < DATE_SUB(NOW(), INTERVAL 5 MINUTE)
                    AND status = 'online'
                `);
            } catch (error) {
                console.error('Error updating device status:', error);
            }
        }, 60000); // Check every minute
        
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        console.error('💡 Make sure MySQL is running and .env is configured correctly');
        process.exit(1);
    }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down server...');
    process.exit(0);
});

startServer(); 
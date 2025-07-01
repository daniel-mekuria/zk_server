const express = require('express');
const bodyParser = require('body-parser');
const morgan = require('morgan');
const moment = require('moment');
const { v4: uuidv4 } = require('uuid');
const Database = require('./database');
const DeviceManager = require('./deviceManager');
const CommandManager = require('./commandManager');
const DataProcessor = require('./dataProcessor');
const ManagementAPI = require('./managementAPI');

class ZKPushServer {
    constructor(port = 8002) {
        this.port = port;
        this.app = express();
        this.db = new Database();
        this.deviceManager = new DeviceManager(this.db);
        this.commandManager = new CommandManager(this.db);
        this.dataProcessor = new DataProcessor(this.db, this.deviceManager);
        this.managementAPI = new ManagementAPI(this.db, this.deviceManager, this.commandManager);
        
        this.setupMiddleware();
        this.setupRoutes();
    }

    setupMiddleware() {
        // Custom body parser for different content types
        this.app.use('/iclock/cdata', bodyParser.raw({ type: '*/*', limit: '50mb' }));
        this.app.use('/iclock/devicecmd', bodyParser.raw({ type: '*/*', limit: '10mb' }));
        this.app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));
        this.app.use(bodyParser.json({ limit: '10mb' }));
        this.app.use(morgan('combined'));

        // Set proper headers for ZK protocol
        this.app.use((req, res, next) => {
            res.header('Server', 'ZK-Push-Server/1.0');
            res.header('Pragma', 'no-cache');
            res.header('Cache-Control', 'no-store');
            next();
        });
    }

    setupRoutes() {
        // Initialization Information Exchange
        this.app.get('/iclock/cdata', this.handleInitialization.bind(this));
        
        // Data Upload and Configuration
        this.app.post('/iclock/cdata', this.handleDataUpload.bind(this));
        
        // Command Requests
        this.app.get('/iclock/getrequest', this.handleCommandRequest.bind(this));
        
        // Command Replies
        this.app.post('/iclock/devicecmd', this.handleCommandReply.bind(this));
        
        // Heartbeat
        this.app.get('/iclock/ping', this.handleHeartbeat.bind(this));
        
        // File operations (optional)
        this.app.get('/iclock/file', this.handleFileRequest.bind(this));
        
        // Management API
        this.app.use('/api', this.managementAPI.getRouter());
    }

    async handleInitialization(req, res) {
        try {
            const { SN: serialNumber, options, pushver, language, pushcommkey, table, PIN } = req.query;
            
            if (!serialNumber) {
                return res.status(400).send('Missing serial number');
            }

            // Handle remote attendance request
            if (table === 'RemoteAtt' && PIN) {
                console.log(`Remote attendance request for PIN ${PIN} from device ${serialNumber}`);
                const result = await this.dataProcessor.processRemoteAttendance(serialNumber, { PIN });
                
                res.set('Date', new Date().toUTCString());
                res.set('Content-Type', 'text/plain');
                
                if (result.success && result.userData) {
                    return res.send(result.userData);
                } else {
                    return res.send('OK'); // No user data found
                }
            }

            console.log(`Device initialization: ${serialNumber}`);
            
            // Register or update device
            await this.deviceManager.registerDevice({
                serialNumber,
                pushVersion: pushver || '2.2.14',
                language: language || '69', // English default
                pushCommKey: pushcommkey,
                lastSeen: new Date()
            });

            // Get device configuration
            const config = await this.deviceManager.getDeviceConfig(serialNumber);
            
            // Build response according to protocol
            const response = this.buildInitializationResponse(serialNumber, config);
            
            res.set('Date', new Date().toUTCString());
            res.set('Content-Type', 'text/plain');
            res.send(response);
            
        } catch (error) {
            console.error('Initialization error:', error);
            res.status(500).send('Internal server error');
        }
    }

    buildInitializationResponse(serialNumber, config) {
        const lines = [
            `GET OPTION FROM: ${serialNumber}`,
            `ATTLOGStamp=None`, // We don't handle attendance
            `OPERLOGStamp=${config.operlogStamp || 'None'}`,
            `ATTPHOTOStamp=None`, // We don't handle attendance photos
            `BIODATAStamp=${config.biodataStamp || 'None'}`,
            `IDCARDStamp=${config.idcardStamp || 'None'}`,
            `ERRORLOGStamp=${config.errorlogStamp || 'None'}`,
            `ErrorDelay=${config.errorDelay || 30}`,
            `Delay=${config.delay || 10}`,
            `TransTimes=${config.transTimes || '00:00;12:00'}`,
            `TransInterval=${config.transInterval || 1}`,
            `TransFlag=TransData EnrollUser ChgUser EnrollFP ChgFP FACE UserPic BioPhoto WORKCODE FVEIN`,
            `TimeZone=${config.timeZone || 8}`,
            `Realtime=${config.realtime || 1}`,
            `Encrypt=None`, // No encryption as requested
            `ServerVer=2.4.1`,
            `PushProtVer=2.4.1`,
            `PushOptionsFlag=1`,
            `PushOptions=FingerFunOn,FaceFunOn,MultiBioDataSupport,MultiBioPhotoSupport,BioPhotoFun,BioDataFun,VisilightFun`,
            `MultiBioDataSupport=${config.multiBioDataSupport || '0:1:1:0:0:0:0:1:1:1'}`,
            `MultiBioPhotoSupport=${config.multiBioPhotoSupport || '0:1:1:0:0:0:0:1:1:1'}`,
            `ATTPHOTOBase64=1` // Enable base64 encoding for photos
        ];
        
        return lines.join('\n');
    }

    async handleDataUpload(req, res) {
        try {
            const { SN: serialNumber, table, Stamp: stamp, ContentType: contentType, type } = req.query;
            const data = req.body.toString();
            
            if (!serialNumber) {
                return res.status(400).send('Missing serial number');
            }

            // Handle background verification requests
            if (type === 'PostVerifyData') {
                console.log(`Background verification request from ${serialNumber}: ${data}`);
                
                // Process the verification data
                // In a real implementation, you would:
                // 1. Parse the verification data
                // 2. Perform business logic validation  
                // 3. Return appropriate response
                
                res.set('Date', new Date().toUTCString());
                return res.send('OK');
            }

            console.log(`Data upload from ${serialNumber}, table: ${table}`);
            
            let result;
            
            switch (table) {
                case 'options':
                    result = await this.dataProcessor.processOptions(serialNumber, data);
                    break;
                case 'OPERLOG':
                    result = await this.dataProcessor.processOperationLog(serialNumber, data, stamp);
                    break;
                case 'BIODATA':
                    result = await this.dataProcessor.processBioData(serialNumber, data, stamp);
                    break;
                case 'IDCARD':
                    result = await this.dataProcessor.processIdCard(serialNumber, data, stamp);
                    break;
                case 'FVEIN':
                    result = await this.dataProcessor.processFingerVeinData(serialNumber, data, stamp);
                    break;
                case 'WORKCODE':
                    result = await this.dataProcessor.processWorkCode(serialNumber, data, stamp);
                    break;
                case 'SMS':
                    result = await this.dataProcessor.processShortMessage(serialNumber, data, stamp);
                    break;
                case 'USER_SMS':
                    result = await this.dataProcessor.processUserSMS(serialNumber, data, stamp);
                    break;
                case 'ERRORLOG':
                    result = await this.dataProcessor.processErrorLog(serialNumber, data, stamp);
                    break;
                case 'RemoteAtt':
                    // Handle remote attendance request
                    result = await this.dataProcessor.processRemoteAttendance(serialNumber, req.query);
                    if (result.success && result.userData) {
                        // Send user data back for remote attendance
                        res.set('Date', new Date().toUTCString());
                        res.set('Content-Type', 'text/plain');
                        return res.send(result.userData);
                    }
                    break;
                default:
                    result = { success: false, message: `Unsupported table: ${table}` };
            }

            if (result.success) {
                res.send(`OK: ${result.count || 1}`);
            } else {
                res.status(400).send(result.message);
            }
            
        } catch (error) {
            console.error('Data upload error:', error);
            res.status(500).send('Internal server error');
        }
    }

    async handleCommandRequest(req, res) {
        try {
            const { SN: serialNumber, INFO: info } = req.query;
            
            if (!serialNumber) {
                return res.status(400).send('Missing serial number');
            }

            // Update device info if provided
            if (info) {
                await this.deviceManager.updateDeviceInfo(serialNumber, info);
            }
            
            // Check for pending commands
            const command = await this.commandManager.getNextCommand(serialNumber);
            
            res.set('Date', new Date().toUTCString());
            res.set('Content-Type', 'text/plain');
            
            if (command) {
                res.send(command);
            } else {
                res.send('OK');
            }
            
        } catch (error) {
            console.error('Command request error:', error);
            res.status(500).send('Internal server error');
        }
    }

    async handleCommandReply(req, res) {
        try {
            const { SN: serialNumber } = req.query;
            const data = req.body.toString();
            
            if (!serialNumber) {
                return res.status(400).send('Missing serial number');
            }

            console.log(`Command reply from ${serialNumber}: ${data}`);
            
            await this.commandManager.processCommandReply(serialNumber, data);
            
            res.set('Date', new Date().toUTCString());
            res.send('OK');
            
        } catch (error) {
            console.error('Command reply error:', error);
            res.status(500).send('Internal server error');
        }
    }

    async handleHeartbeat(req, res) {
        try {
            const { SN: serialNumber } = req.query;
            
            if (!serialNumber) {
                return res.status(400).send('Missing serial number');
            }

            console.log(`🔄 PING - Device ${serialNumber} heartbeat received`);
            
            res.set('Date', new Date().toUTCString());
            res.send('OK');
            
        } catch (error) {
            console.error('Heartbeat error:', error);
            res.status(500).send('Internal server error');
        }
    }

    async handleFileRequest(req, res) {
        try {
            const { SN: serialNumber, url } = req.query;
            
            if (!serialNumber) {
                return res.status(400).send('Missing serial number');
            }

            console.log(`File request from ${serialNumber}: ${url}`);
            
            if (url) {
                // Handle specific file download request
                // This would typically serve files for firmware updates, etc.
                // For now, return a basic response
                res.set('Content-Type', 'application/octet-stream');
                res.set('Content-Disposition', 'attachment; filename="file.bin"');
                
                // In a real implementation, you would:
                // 1. Validate the file path
                // 2. Check permissions
                // 3. Serve the actual file
                res.send(Buffer.alloc(0)); // Empty file for now
            } else {
                // No specific file requested
                res.status(404).send('File not found');
            }
            
        } catch (error) {
            console.error('File request error:', error);
            res.status(500).send('Internal server error');
        }
    }

    async start() {
        try {
            await this.db.initialize();
            
            this.app.listen(this.port, () => {
                console.log(`ZK Push Server listening on port ${this.port}`);
                console.log('Protocol features enabled:');
                console.log('- User management');
                console.log('- Biometric data sync');
                console.log('- Device configuration');
                console.log('- Multi-device support');
                console.log('Features disabled (as requested):');
                console.log('- Attendance management');
                console.log('- Data encryption');
            });
            
        } catch (error) {
            console.error('Failed to start server:', error);
            process.exit(1);
        }
    }
}

// Create and start server
const server = new ZKPushServer(process.env.PORT || 8002);
server.start(); 
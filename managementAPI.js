const express = require('express');
const moment = require('moment');

class ManagementAPI {
    constructor(database, deviceManager, commandManager) {
        this.db = database;
        this.deviceManager = deviceManager;
        this.commandManager = commandManager;
        this.router = express.Router();
        this.setupRoutes();
    }

    setupRoutes() {
        // Device management
        this.router.get('/devices', this.getDevices.bind(this));
        this.router.get('/devices/:serialNumber', this.getDevice.bind(this));
        this.router.delete('/devices/:serialNumber', this.removeDevice.bind(this));

        // User management
        this.router.get('/users', this.getUsers.bind(this));
        this.router.get('/users/:pin', this.getUser.bind(this));
        this.router.post('/users', this.addUser.bind(this));
        this.router.delete('/users/:pin', this.deleteUser.bind(this));

        // Command management
        this.router.get('/commands', this.getCommands.bind(this));
        this.router.post('/commands/user/add', this.addUserCommand.bind(this));
        this.router.post('/commands/user/delete', this.deleteUserCommand.bind(this));
        this.router.post('/commands/device/reboot', this.rebootDeviceCommand.bind(this));

        // System status
        this.router.get('/status', this.getSystemStatus.bind(this));
        this.router.get('/stats', this.getSystemStats.bind(this));
        
        // Manual sync
        this.router.post('/sync/manual', this.triggerManualSync.bind(this));

        // Add endpoint for creating users with multiple biometric modalities
        this.router.post('/users/biometric-add', this.addUserWithBiometrics.bind(this));

        // Add endpoint for testing biometric sync between devices
        this.router.post('/users/biometric-sync', this.testBiometricSync.bind(this));

        // Enhanced biometric management endpoints
        this.router.post('/users/bulk-biometric-add', this.bulkAddUsersWithBiometrics.bind(this));
        this.router.delete('/users/:pin/biometrics', this.clearUserBiometrics.bind(this));
        this.router.delete('/users/:pin/biometrics/:type', this.deleteSpecificBiometric.bind(this));
        this.router.get('/users/:pin/biometrics/:type', this.querySpecificBiometric.bind(this));
        this.router.post('/biometrics/validate', this.validateBiometricTemplate.bind(this));
    }

    async getDevices(req, res) {
        try {
            const devices = await this.deviceManager.getAllDevices();
            
            const devicesWithStatus = await Promise.all(devices.map(async (device) => {
                const stats = await this.deviceManager.getDeviceStats(device.serial_number);
                const pendingCommands = await this.commandManager.getPendingCommandsCount(device.serial_number);
                
                return {
                    ...device,
                    stats,
                    pendingCommands,
                    isActive: moment().diff(moment(device.last_seen), 'minutes') < 10
                };
            }));

            res.json({
                success: true,
                data: devicesWithStatus,
                count: devicesWithStatus.length
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    async getDevice(req, res) {
        try {
            const { serialNumber } = req.params;
            
            const device = await this.deviceManager.getDevice(serialNumber);
            if (!device) {
                return res.status(404).json({
                    success: false,
                    error: 'Device not found'
                });
            }

            const stats = await this.deviceManager.getDeviceStats(serialNumber);
            const capabilities = await this.deviceManager.getDeviceCapabilities(serialNumber);

            res.json({
                success: true,
                data: {
                    ...device,
                    stats,
                    capabilities,
                    isActive: moment().diff(moment(device.last_seen), 'minutes') < 10
                }
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    async removeDevice(req, res) {
        try {
            const { serialNumber } = req.params;
            
            await this.deviceManager.removeDevice(serialNumber);
            
            res.json({
                success: true,
                message: 'Device removed successfully'
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    async getUsers(req, res) {
        try {
            const { device } = req.query;
            
            let query = 'SELECT * FROM users ORDER BY pin';
            let params = [];
            
            if (device) {
                query = 'SELECT * FROM users WHERE device_serial = ? ORDER BY pin';
                params = [device];
            }

            const users = await this.db.all(query, params);
            
            res.json({
                success: true,
                data: users,
                count: users.length
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    async getUser(req, res) {
        try {
            const { pin } = req.params;
            
            const user = await this.db.get('SELECT * FROM users WHERE pin = ?', [pin]);
            
            if (!user) {
                return res.status(404).json({
                    success: false,
                    error: 'User not found'
                });
            }

            const fingerprints = await this.db.all(
                'SELECT * FROM fingerprint_templates WHERE pin = ?', [pin]
            );
            const faces = await this.db.all(
                'SELECT * FROM face_templates WHERE pin = ?', [pin]
            );
            const bioTemplates = await this.db.all(
                'SELECT * FROM bio_templates WHERE pin = ?', [pin]
            );

            res.json({
                success: true,
                data: {
                    ...user,
                    biometrics: {
                        fingerprints: fingerprints.map(t => ({ ...t, template_data: '[Hidden]' })),
                        faces: faces.map(t => ({ ...t, template_data: '[Hidden]' })),
                        bioTemplates: bioTemplates.map(t => ({ ...t, template_data: '[Hidden]' }))
                    }
                }
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    async addUser(req, res) {
        try {
            const { name } = req.body;
            
            if (!name || name.trim() === '') {
                return res.status(400).json({
                    success: false,
                    error: 'User name is required'
                });
            }

            // Find the next available PIN (user ID)
            // Get the highest numeric PIN and increment by 1
            const result = await this.db.get(`
                SELECT MAX(CAST(pin AS INTEGER)) as maxPin 
                FROM users 
                WHERE pin GLOB '[0-9]*'
            `);
            
            const nextPin = result && result.maxPin ? (result.maxPin + 1).toString() : '1';
            
            console.log(`🔍 Creating new user with PIN: ${nextPin}, Name: ${name}`);
            
            // Insert the new user
            await this.db.run(`
                INSERT INTO users 
                (pin, name, privilege, password, card, group_id, time_zone, verify_mode, vice_card)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                nextPin,
                name.trim(),
                0,           // privilege: normal user
                '',          // password: empty
                '',          // card: empty
                1,           // group_id: default group
                '0000000000000000', // time_zone: default
                -1,          // verify_mode: default
                ''           // vice_card: empty
            ]);

            // Get the created user
            const createdUser = await this.db.get('SELECT * FROM users WHERE pin = ?', [nextPin]);
            
            console.log(`✅ User created successfully: PIN=${nextPin}, Name=${name}`);

            // First sync time on all devices, then sync the new user
            const activeDevices = await this.deviceManager.getActiveDevices();
            const timeSyncResults = [];
            const syncCommandResults = [];
            
            if (activeDevices.length > 0) {
                console.log(`🕐 First synchronizing time on ${activeDevices.length} active devices before user sync`);
                
                // Step 1: Sync time on all devices first
                for (const device of activeDevices) {
                    try {
                        const timeSync = await this.commandManager.syncDeviceTime(device.serial_number);
                        timeSyncResults.push({
                            device: device.serial_number,
                            success: timeSync.success,
                            syncCommands: timeSync.syncCommands,
                            timezone: timeSync.timezone,
                            datetime: timeSync.datetime
                        });
                        
                        if (timeSync.success) {
                            console.log(`🕐 Time sync commands queued for device ${device.serial_number}`);
                        }
                    } catch (error) {
                        console.error(`❌ Error syncing time for device ${device.serial_number}:`, error);
                        timeSyncResults.push({
                            device: device.serial_number,
                            success: false,
                            error: error.message
                        });
                    }
                }
                
                console.log(`🔄 Now syncing new user ${nextPin} to ${activeDevices.length} active devices`);
                
                // Step 2: Sync the new user data
                for (const device of activeDevices) {
                    try {
                        // Create add user command for this device
                        const syncResult = await this.commandManager.addUser(device.serial_number, {
                            pin: nextPin,
                            name: name.trim(),
                            privilege: 0,
                            password: '',
                            card: '',
                            groupId: 1,
                            timeZone: '0000000000000000',
                            verifyMode: -1,
                            viceCard: ''
                        });
                        syncCommandResults.push({
                            device: device.serial_number,
                            success: true,
                            commandId: syncResult.commandId
                        });
                        console.log(`📤 Add user command queued for device ${device.serial_number}`);
                    } catch (error) {
                        console.error(`❌ Failed to queue add user command for device ${device.serial_number}:`, error);
                        syncCommandResults.push({
                            device: device.serial_number,
                            success: false,
                            error: error.message
                        });
                    }
                }
                
                const successfulSyncs = syncCommandResults.filter(r => r.success).length;
                const successfulTimeSyncs = timeSyncResults.filter(r => r.success).length;

                res.json({
                    success: true,
                    message: `User created successfully with ID ${nextPin}, time synced on ${successfulTimeSyncs}/${activeDevices.length} devices, and user sync commands sent to ${successfulSyncs}/${activeDevices.length} devices`,
                    data: {
                        userId: nextPin,
                        user: createdUser,
                        timeSync: {
                            totalDevices: activeDevices.length,
                            successfulTimeSyncs: successfulTimeSyncs,
                            results: timeSyncResults
                        },
                        deviceSync: {
                            totalDevices: activeDevices.length,
                            successfulCommands: successfulSyncs,
                            results: syncCommandResults
                        }
                    }
                });
            } else {
                res.json({
                    success: true,
                    message: `User created successfully with ID ${nextPin} (no active devices to sync)`,
                    data: {
                        userId: nextPin,
                        user: createdUser,
                        deviceSync: {
                            totalDevices: 0,
                            successfulCommands: 0,
                            message: 'No active devices to sync to'
                        }
                    }
                });
            }

        } catch (error) {
            console.error('Error creating user:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    async deleteUser(req, res) {
        try {
            const { pin } = req.params;
            
            console.log(`🔍 DELETE request for PIN: "${pin}" (type: ${typeof pin})`);
            
            // Check if user exists
            const user = await this.db.get('SELECT * FROM users WHERE pin = ?', [pin]);
            console.log(`🔍 Database lookup result:`, user);
            
            if (!user) {
                // Let's also check what users exist with similar PINs
                const similarUsers = await this.db.all('SELECT pin, id FROM users WHERE pin LIKE ?', [`%${pin}%`]);
                console.log(`🔍 Similar PINs found:`, similarUsers);
                
                return res.status(404).json({
                    success: false,
                    error: 'User not found'
                });
            }

            // Delete user and all related biometric data
            await this.db.run('BEGIN TRANSACTION');
            
            try {
                // Delete from all biometric tables
                await this.db.run('DELETE FROM fingerprint_templates WHERE pin = ?', [pin]);
                await this.db.run('DELETE FROM face_templates WHERE pin = ?', [pin]);
                await this.db.run('DELETE FROM bio_templates WHERE pin = ?', [pin]);
                await this.db.run('DELETE FROM user_photos WHERE pin = ?', [pin]);
                await this.db.run('DELETE FROM comparison_photos WHERE pin = ?', [pin]);
                
                // Delete the user record
                await this.db.run('DELETE FROM users WHERE pin = ?', [pin]);
                
                await this.db.run('COMMIT');
                
                console.log(`✅ User ${pin} and all related biometric data deleted from database`);
                
                // Now sync the deletion across all active devices
                const activeDevices = await this.deviceManager.getActiveDevices();
                const deleteCommandResults = [];
                
                for (const device of activeDevices) {
                    try {
                        // Create delete user command for this device
                        const deleteResult = await this.commandManager.deleteUser(device.serial_number, pin);
                        deleteCommandResults.push({
                            device: device.serial_number,
                            success: true,
                            commandId: deleteResult.commandId
                        });
                        console.log(`📤 Delete user command queued for device ${device.serial_number}`);
                    } catch (error) {
                        console.error(`❌ Failed to queue delete command for device ${device.serial_number}:`, error);
                        deleteCommandResults.push({
                            device: device.serial_number,
                            success: false,
                            error: error.message
                        });
                    }
                }
                
                const successfulDeletes = deleteCommandResults.filter(r => r.success).length;
                
                res.json({
                    success: true,
                    message: `User ${pin} deleted successfully from database and deletion commands sent to ${successfulDeletes}/${activeDevices.length} devices`,
                    data: {
                        deletedUser: user,
                        deviceSync: {
                            totalDevices: activeDevices.length,
                            successfulCommands: successfulDeletes,
                            results: deleteCommandResults
                        }
                    }
                });
                
            } catch (error) {
                await this.db.run('ROLLBACK');
                throw error;
            }
            
        } catch (error) {
            console.error('Error deleting user:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    async triggerManualSync(req, res) {
        try {
            const { sourceDevice, targetDevices, syncType = 'all' } = req.body;
            
            let source = null;
            let syncFromDatabase = false;
            
            if (sourceDevice) {
                // Sync from specific device
                source = await this.deviceManager.getDevice(sourceDevice);
                if (!source) {
                    return res.status(404).json({
                        success: false,
                        error: 'Source device not found'
                    });
                }
            } else {
                // Sync from database to all devices
                syncFromDatabase = true;
                console.log('📤 Manual sync: Database -> All Devices');
            }

            // Determine target devices
            let targets = [];
            if (targetDevices && Array.isArray(targetDevices)) {
                // Validate each target device
                for (const deviceSerial of targetDevices) {
                    const device = await this.deviceManager.getDevice(deviceSerial);
                    if (device) {
                        targets.push(device);
                    }
                }
            } else {
                // Sync to all active devices (or all except source if specified)
                const allDevices = await this.deviceManager.getActiveDevices();
                if (syncFromDatabase) {
                    targets = allDevices; // Sync to ALL devices when syncing from database
                } else {
                    targets = allDevices.filter(device => device.serial_number !== sourceDevice);
                }
            }

            if (targets.length === 0) {
                return res.status(400).json({
                    success: false,
                    error: 'No valid target devices found'
                });
            }

            const syncSource = syncFromDatabase ? 'Database' : sourceDevice;
            const syncTarget = targets.map(t => t.serial_number).join(', ');
            console.log(`🔄 Manual sync triggered: ${syncSource} -> ${syncTarget}`);
            
            const syncResults = [];
            
            // Get data to sync based on syncType
            let syncData = {};
            
            if (syncType === 'all' || syncType === 'users') {
                if (syncFromDatabase) {
                    const users = await this.db.all('SELECT * FROM users');
                    syncData.users = users;
                } else {
                    const users = await this.db.all('SELECT * FROM users WHERE device_serial = ?', [sourceDevice]);
                    syncData.users = users;
                }
            }
            
            if (syncType === 'all' || syncType === 'fingerprints') {
                if (syncFromDatabase) {
                    const fingerprints = await this.db.all('SELECT * FROM fingerprint_templates');
                    syncData.fingerprints = fingerprints;
                } else {
                    const fingerprints = await this.db.all('SELECT * FROM fingerprint_templates WHERE device_serial = ?', [sourceDevice]);
                    syncData.fingerprints = fingerprints;
                }
            }
            
            if (syncType === 'all' || syncType === 'faces') {
                if (syncFromDatabase) {
                    const faces = await this.db.all('SELECT * FROM face_templates');
                    syncData.faces = faces;
                } else {
                    const faces = await this.db.all('SELECT * FROM face_templates WHERE device_serial = ?', [sourceDevice]);
                    syncData.faces = faces;
                }
            }
            
            if (syncType === 'all' || syncType === 'bio') {
                if (syncFromDatabase) {
                    const bioTemplates = await this.db.all('SELECT * FROM bio_templates');
                    syncData.bioTemplates = bioTemplates;
                } else {
                    const bioTemplates = await this.db.all('SELECT * FROM bio_templates WHERE device_serial = ?', [sourceDevice]);
                    syncData.bioTemplates = bioTemplates;
                }
            }

            // First sync time on all target devices, then sync data
            const timeSyncResults = [];
            
            console.log(`🕐 First synchronizing time on ${targets.length} target devices before data sync`);
            for (const target of targets) {
                try {
                    const timeSync = await this.commandManager.syncDeviceTime(target.serial_number);
                    timeSyncResults.push({
                        device: target.serial_number,
                        success: timeSync.success,
                        syncCommands: timeSync.syncCommands,
                        timezone: timeSync.timezone,
                        datetime: timeSync.datetime
                    });
                    
                    if (timeSync.success) {
                        console.log(`🕐 Time sync commands queued for device ${target.serial_number}`);
                    }
                } catch (error) {
                    console.error(`❌ Error syncing time for device ${target.serial_number}:`, error);
                    timeSyncResults.push({
                        device: target.serial_number,
                        success: false,
                        error: error.message
                    });
                }
            }
            
            console.log(`🔄 Now syncing data to ${targets.length} target devices`);
            
            // Create sync commands for each target device
            for (const target of targets) {
                const targetSerial = target.serial_number;
                let commandsCreated = 0;
                
                try {
                    // Sync users
                    if (syncData.users) {
                        for (const user of syncData.users) {
                            await this.commandManager.addUser(targetSerial, {
                                pin: user.pin,
                                name: user.name,
                                privilege: user.privilege,
                                password: user.password,
                                card: user.card,
                                groupId: user.group_id,
                                timeZone: user.time_zone,
                                verifyMode: user.verify_mode
                            });
                            commandsCreated++;
                        }
                    }
                    
                    // Sync fingerprint templates
                    if (syncData.fingerprints) {
                        for (const fp of syncData.fingerprints) {
                            await this.commandManager.addFingerprintTemplate(targetSerial, {
                                PIN: fp.pin,
                                FID: fp.fid,
                                Size: fp.size,
                                Valid: fp.valid,
                                TMP: fp.template_data
                            });
                            commandsCreated++;
                        }
                    }
                    
                    // Sync face templates
                    if (syncData.faces) {
                        for (const face of syncData.faces) {
                            await this.commandManager.addFaceTemplate(targetSerial, {
                                pin: face.pin,
                                fid: face.fid,
                                size: face.size,
                                valid: face.valid,
                                template: face.template_data
                            });
                            commandsCreated++;
                        }
                    }
                    
                    // Sync bio templates
                    if (syncData.bioTemplates) {
                        for (const bio of syncData.bioTemplates) {
                            await this.commandManager.addBiodataTemplate(targetSerial, {
                                pin: bio.pin,
                                no: bio.bio_no,
                                index: bio.index_num,
                                valid: bio.valid,
                                duress: bio.duress,
                                type: bio.type,
                                majorVer: bio.major_ver,
                                minorVer: bio.minor_ver,
                                format: bio.format,
                                template: bio.template_data
                            });
                            commandsCreated++;
                        }
                    }
                    
                    syncResults.push({
                        device: targetSerial,
                        success: true,
                        commandsCreated
                    });
                    
                } catch (error) {
                    console.error(`Error syncing to device ${targetSerial}:`, error);
                    syncResults.push({
                        device: targetSerial,
                        success: false,
                        error: error.message
                    });
                }
            }
            
            const successfulSyncs = syncResults.filter(r => r.success).length;
            const successfulTimeSyncs = timeSyncResults.filter(r => r.success).length;
            const totalCommands = syncResults.reduce((sum, r) => sum + (r.commandsCreated || 0), 0);
            
            res.json({
                success: successfulSyncs > 0,
                message: `Manual sync completed: time synced on ${successfulTimeSyncs}/${targets.length} devices, data synced to ${successfulSyncs}/${targets.length} devices, ${totalCommands} commands queued`,
                data: {
                    syncSource: syncFromDatabase ? 'Database' : sourceDevice,
                    sourceDevice: syncFromDatabase ? null : sourceDevice,
                    syncFromDatabase,
                    syncType,
                    targetDevices: targets.length,
                    timeSync: {
                        successfulTimeSyncs: successfulTimeSyncs,
                        results: timeSyncResults
                    },
                    dataSync: {
                        successfulSyncs: successfulSyncs,
                        totalCommands: totalCommands,
                        results: syncResults
                    },
                    syncData: {
                        users: syncData.users?.length || 0,
                        fingerprints: syncData.fingerprints?.length || 0,
                        faces: syncData.faces?.length || 0,
                        bioTemplates: syncData.bioTemplates?.length || 0
                    }
                }
            });
            
        } catch (error) {
            console.error('Error in manual sync:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    async getCommands(req, res) {
        try {
            const { device, status, limit = 50 } = req.query;
            
            let query = 'SELECT * FROM commands ORDER BY created_at DESC LIMIT ?';
            let params = [parseInt(limit)];
            
            if (device && status) {
                query = 'SELECT * FROM commands WHERE device_serial = ? AND status = ? ORDER BY created_at DESC LIMIT ?';
                params = [device, status, parseInt(limit)];
            } else if (device) {
                query = 'SELECT * FROM commands WHERE device_serial = ? ORDER BY created_at DESC LIMIT ?';
                params = [device, parseInt(limit)];
            } else if (status) {
                query = 'SELECT * FROM commands WHERE status = ? ORDER BY created_at DESC LIMIT ?';
                params = [status, parseInt(limit)];
            }

            const commands = await this.db.all(query, params);
            
            res.json({
                success: true,
                data: commands,
                count: commands.length
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    async addUserCommand(req, res) {
        try {
            const { deviceSerial, userInfo } = req.body;
            
            if (!deviceSerial || !userInfo || !userInfo.pin) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing required fields: deviceSerial and userInfo.pin'
                });
            }

            const result = await this.commandManager.addUser(deviceSerial, userInfo);
            
            res.json({
                success: true,
                data: result,
                message: 'User add command queued'
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    async deleteUserCommand(req, res) {
        try {
            const { deviceSerial, pin } = req.body;
            
            if (!deviceSerial || !pin) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing required fields: deviceSerial and pin'
                });
            }

            const result = await this.commandManager.deleteUser(deviceSerial, pin);
            
            res.json({
                success: true,
                data: result,
                message: 'User delete command queued'
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    async rebootDeviceCommand(req, res) {
        try {
            const { deviceSerial } = req.body;
            
            if (!deviceSerial) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing required field: deviceSerial'
                });
            }

            const result = await this.commandManager.rebootDevice(deviceSerial);
            
            res.json({
                success: true,
                data: result,
                message: 'Device reboot command queued'
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    async getSystemStatus(req, res) {
        try {
            const devices = await this.deviceManager.getAllDevices();
            const activeDevices = await this.deviceManager.getActiveDevices();
            
            const totalUsers = await this.db.get('SELECT COUNT(*) as count FROM users');
            const pendingCommands = await this.db.get(
                'SELECT COUNT(*) as count FROM commands WHERE status = ?', ['pending']
            );

            res.json({
                success: true,
                data: {
                    devices: {
                        total: devices.length,
                        active: activeDevices.length,
                        inactive: devices.length - activeDevices.length
                    },
                    data: {
                        users: totalUsers.count,
                        pendingCommands: pendingCommands.count
                    },
                    server: {
                        uptime: process.uptime(),
                        memory: process.memoryUsage(),
                        version: process.version
                    }
                }
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    async getSystemStats(req, res) {
        try {
            const stats = await Promise.all([
                this.db.get('SELECT COUNT(*) as count FROM devices'),
                this.db.get('SELECT COUNT(*) as count FROM users'),
                this.db.get('SELECT COUNT(*) as count FROM fingerprint_templates'),
                this.db.get('SELECT COUNT(*) as count FROM face_templates'),
                this.db.get('SELECT COUNT(*) as count FROM bio_templates'),
                this.db.get('SELECT COUNT(*) as count FROM commands WHERE status = ?', ['pending']),
                this.db.get('SELECT COUNT(*) as count FROM commands WHERE status = ?', ['completed'])
            ]);

            res.json({
                success: true,
                data: {
                    devices: stats[0].count,
                    users: stats[1].count,
                    fingerprintTemplates: stats[2].count,
                    faceTemplates: stats[3].count,
                    bioTemplates: stats[4].count,
                    pendingCommands: stats[5].count,
                    completedCommands: stats[6].count
                }
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    // Add endpoint for creating users with multiple biometric modalities
    async addUserWithBiometrics(req, res) {
        try {
            const { deviceSerial, userInfo, biometrics } = req.body;
            
            if (!deviceSerial || !userInfo || !userInfo.pin) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing required fields: deviceSerial, userInfo.pin'
                });
            }

            const CommandManager = require('./commandManager');
            const commandManager = new CommandManager(this.db);

            // Validate biometric data if provided
            if (biometrics && Array.isArray(biometrics)) {
                for (const bio of biometrics) {
                    if (!bio.type || !bio.template) {
                        return res.status(400).json({
                            success: false,
                            error: 'Each biometric must have type and template'
                        });
                    }
                }
            }

            console.log(`📝 API: Adding user ${userInfo.pin} to device ${deviceSerial} with ${biometrics?.length || 0} biometric templates`);
            
            const result = await commandManager.addUserWithBiometrics(
                deviceSerial, 
                userInfo, 
                biometrics || []
            );

            res.json({
                success: result.success,
                data: {
                    pin: userInfo.pin,
                    deviceSerial,
                    summary: result.summary,
                    userCreated: result.userCreated,
                    biometricsAdded: result.biometricsAdded,
                    results: result.results
                },
                message: result.success 
                    ? `User ${userInfo.pin} setup queued successfully` 
                    : `User ${userInfo.pin} setup failed: ${result.error}`
            });

        } catch (error) {
            console.error('Error in addUserWithBiometrics:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    // Add endpoint for testing biometric sync between devices
    async testBiometricSync(req, res) {
        try {
            const { sourceDevice, targetDevice, pin } = req.body;
            
            if (!sourceDevice || !targetDevice || !pin) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing required fields: sourceDevice, targetDevice, pin'
                });
            }

            // Get user data from source device
            const user = await this.db.get('SELECT * FROM users WHERE pin = ? AND device_serial = ?', [pin, sourceDevice]);
            
            if (!user) {
                return res.status(404).json({
                    success: false,
                    error: `User ${pin} not found on source device ${sourceDevice}`
                });
            }

            // Get all biometric templates for this user
            const fingerprints = await this.db.all('SELECT * FROM fingerprint_templates WHERE pin = ? AND device_serial = ?', [pin, sourceDevice]);
            const faces = await this.db.all('SELECT * FROM face_templates WHERE pin = ? AND device_serial = ?', [pin, sourceDevice]);
            const bioTemplates = await this.db.all('SELECT * FROM bio_templates WHERE pin = ? AND device_serial = ?', [pin, sourceDevice]);

            // Prepare biometric data for unified sync
            const biometrics = [];
            
            // Add fingerprint data
            fingerprints.forEach(fp => {
                biometrics.push({
                    type: 'fingerprint',
                    fid: fp.fid,
                    template: fp.template_data,
                    valid: fp.valid
                });
            });

            // Add face data  
            faces.forEach(face => {
                biometrics.push({
                    type: 'face',
                    fid: face.fid,
                    template: face.template_data,
                    valid: face.valid
                });
            });

            // Add bio templates (already in unified format)
            bioTemplates.forEach(bio => {
                biometrics.push({
                    type: this.getBiometricTypeFromId(bio.type),
                    fid: bio.no,
                    template: bio.template_data,
                    valid: bio.valid,
                    index: bio.index_num
                });
            });

            const CommandManager = require('./commandManager');
            const commandManager = new CommandManager(this.db);

            console.log(`🔄 API: Syncing user ${pin} from ${sourceDevice} to ${targetDevice} with ${biometrics.length} biometric templates`);
            
            const result = await commandManager.addUserWithBiometrics(
                targetDevice,
                {
                    pin: user.pin,
                    name: user.name,
                    privilege: user.privilege,
                    password: user.password,
                    card: user.card,
                    groupId: user.group_id,
                    timeZone: user.time_zone,
                    verifyMode: user.verify_mode,
                    viceCard: user.vice_card
                },
                biometrics
            );

            res.json({
                success: result.success,
                data: {
                    pin: pin,
                    sourceDevice,
                    targetDevice,
                    summary: result.summary,
                    biometricsFound: biometrics.length,
                    userCreated: result.userCreated,
                    biometricsAdded: result.biometricsAdded,
                    results: result.results
                },
                message: result.success 
                    ? `User ${pin} sync queued successfully` 
                    : `User ${pin} sync failed: ${result.error}`
            });

        } catch (error) {
            console.error('Error in testBiometricSync:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    getBiometricTypeFromId(typeId) {
        const typeMap = {
            1: 'fingerprint',
            2: 'face',
            3: 'voiceprint',
            4: 'iris',
            5: 'retina',
            6: 'palmprint',
            7: 'fingervein',
            8: 'palm',
            9: 'visible_light_face'
        };
        return typeMap[typeId] || 'unknown';
    }

    // Bulk add users with biometric data
    async bulkAddUsersWithBiometrics(req, res) {
        try {
            const { deviceSerial, usersData } = req.body;
            
            if (!deviceSerial || !usersData || !Array.isArray(usersData)) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing required fields: deviceSerial, usersData (array)'
                });
            }

            // Validate each user data structure
            for (let i = 0; i < usersData.length; i++) {
                const userData = usersData[i];
                if (!userData.userInfo || !userData.userInfo.pin) {
                    return res.status(400).json({
                        success: false,
                        error: `User ${i + 1}: Missing userInfo.pin`
                    });
                }
            }

            const CommandManager = require('./commandManager');
            const commandManager = new CommandManager(this.db);

            console.log(`📝 API: Bulk adding ${usersData.length} users with biometric data to device ${deviceSerial}`);
            
            const result = await commandManager.addMultipleUsersWithBiometrics(deviceSerial, usersData);

            res.json({
                success: result.success,
                data: {
                    deviceSerial,
                    totalUsers: result.totalUsers,
                    successfulUsers: result.successfulUsers,
                    summary: result.summary,
                    results: result.results
                },
                message: result.success 
                    ? `Bulk operation completed: ${result.summary}` 
                    : `Bulk operation failed: ${result.error}`
            });

        } catch (error) {
            console.error('Error in bulkAddUsersWithBiometrics:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    // Clear all biometric data for a specific user
    async clearUserBiometrics(req, res) {
        try {
            const { pin } = req.params;
            const { deviceSerial } = req.body;
            
            if (!deviceSerial || !pin) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing required fields: deviceSerial, pin'
                });
            }

            const CommandManager = require('./commandManager');
            const commandManager = new CommandManager(this.db);

            console.log(`🧹 API: Clearing all biometric data for user ${pin} on device ${deviceSerial}`);
            
            const result = await commandManager.clearUserBiometrics(deviceSerial, pin);

            res.json({
                success: result.success,
                data: {
                    pin,
                    deviceSerial,
                    cleared: result.cleared,
                    total: result.total,
                    results: result.results
                },
                message: result.success 
                    ? `Cleared ${result.cleared}/${result.total} biometric types for user ${pin}` 
                    : `Failed to clear biometrics for user ${pin}: ${result.error}`
            });

        } catch (error) {
            console.error('Error in clearUserBiometrics:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    // Delete specific biometric type for a user
    async deleteSpecificBiometric(req, res) {
        try {
            const { pin, type } = req.params;
            const { deviceSerial, fid } = req.body;
            
            if (!deviceSerial || !pin || !type) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing required fields: deviceSerial, pin, type'
                });
            }

            const CommandManager = require('./commandManager');
            const commandManager = new CommandManager(this.db);

            console.log(`🗑️ API: Deleting ${type} biometric for user ${pin} on device ${deviceSerial}`);
            
            const result = await commandManager.deleteUnifiedBiometricTemplate(deviceSerial, {
                pin,
                biometricType: type,
                fid: fid || null
            });

            res.json({
                success: result.success,
                data: {
                    pin,
                    deviceSerial,
                    biometricType: type,
                    fid: fid || null
                },
                message: result.success 
                    ? `${type} biometric deleted for user ${pin}` 
                    : `Failed to delete ${type} biometric for user ${pin}: ${result.error}`
            });

        } catch (error) {
            console.error('Error in deleteSpecificBiometric:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    // Query specific biometric type for a user
    async querySpecificBiometric(req, res) {
        try {
            const { pin, type } = req.params;
            const { deviceSerial, fid } = req.query;
            
            if (!deviceSerial || !pin || !type) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing required fields: deviceSerial, pin, type'
                });
            }

            const CommandManager = require('./commandManager');
            const commandManager = new CommandManager(this.db);

            console.log(`🔍 API: Querying ${type} biometric for user ${pin} on device ${deviceSerial}`);
            
            const result = await commandManager.queryUnifiedBiometricTemplate(deviceSerial, {
                pin,
                biometricType: type,
                fid: fid || null
            });

            res.json({
                success: result.success,
                data: {
                    pin,
                    deviceSerial,
                    biometricType: type,
                    fid: fid || null,
                    queryResult: result
                },
                message: result.success 
                    ? `${type} biometric query sent for user ${pin}` 
                    : `Failed to query ${type} biometric for user ${pin}: ${result.error}`
            });

        } catch (error) {
            console.error('Error in querySpecificBiometric:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    // Validate biometric template data
    async validateBiometricTemplate(req, res) {
        try {
            const { templateData, biometricType } = req.body;
            
            if (!templateData || !biometricType) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing required fields: templateData, biometricType'
                });
            }

            const CommandManager = require('./commandManager');
            const commandManager = new CommandManager(this.db);

            const validation = commandManager.validateBiometricTemplate(templateData, biometricType);

            res.json({
                success: true,
                data: {
                    valid: validation.valid,
                    error: validation.error || null,
                    biometricType,
                    templateInfo: {
                        pin: templateData.pin,
                        templateLength: templateData.template ? templateData.template.length : 0,
                        fid: templateData.fid
                    }
                },
                message: validation.valid 
                    ? `${biometricType} template is valid` 
                    : `${biometricType} template validation failed: ${validation.error}`
            });

        } catch (error) {
            console.error('Error in validateBiometricTemplate:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    getRouter() {
        return this.router;
    }
}

module.exports = ManagementAPI; 
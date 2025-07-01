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

        // Command management
        this.router.get('/commands', this.getCommands.bind(this));
        this.router.post('/commands/user/add', this.addUserCommand.bind(this));
        this.router.post('/commands/user/delete', this.deleteUserCommand.bind(this));
        this.router.post('/commands/device/reboot', this.rebootDeviceCommand.bind(this));

        // System status
        this.router.get('/status', this.getSystemStatus.bind(this));
        this.router.get('/stats', this.getSystemStats.bind(this));

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
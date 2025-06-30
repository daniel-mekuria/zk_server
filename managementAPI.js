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

    getRouter() {
        return this.router;
    }
}

module.exports = ManagementAPI; 
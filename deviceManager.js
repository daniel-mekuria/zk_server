const moment = require('moment');

class DeviceManager {
    constructor(database) {
        this.db = database;
    }

    async registerDevice(deviceInfo) {
        const {
            serialNumber,
            pushVersion,
            language,
            pushCommKey,
            lastSeen
        } = deviceInfo;

        try {
            // Check if device exists
            const existingDevice = await this.db.get(
                'SELECT * FROM devices WHERE serial_number = ?',
                [serialNumber]
            );

            if (existingDevice) {
                // Update existing device
                await this.db.run(`
                    UPDATE devices 
                    SET push_version = ?, language = ?, push_comm_key = ?, 
                        last_seen = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE serial_number = ?
                `, [pushVersion, language, pushCommKey, lastSeen, serialNumber]);
                
                console.log(`Device updated: ${serialNumber}`);
            } else {
                // Insert new device
                await this.db.run(`
                    INSERT INTO devices 
                    (serial_number, push_version, language, push_comm_key, last_seen)
                    VALUES (?, ?, ?, ?, ?)
                `, [serialNumber, pushVersion, language, pushCommKey, lastSeen]);
                
                console.log(`New device registered: ${serialNumber}`);
                
                // Initialize default configuration
                await this.initializeDeviceConfig(serialNumber);
            }

            return { success: true };
        } catch (error) {
            console.error('Error registering device:', error);
            throw error;
        }
    }

    async initializeDeviceConfig(serialNumber) {
        const defaultConfigs = [
            { key: 'errorDelay', value: '30' },
            { key: 'delay', value: '10' },
            { key: 'transTimes', value: '00:00;12:00' },
            { key: 'transInterval', value: '1' },
            { key: 'timeZone', value: '8' },
            { key: 'realtime', value: '1' },
            { key: 'operlogStamp', value: 'None' },
            { key: 'biodataStamp', value: 'None' },
            { key: 'idcardStamp', value: 'None' },
            { key: 'errorlogStamp', value: 'None' },
            { key: 'multiBioDataSupport', value: '0:1:1:0:0:0:0:1:1:1' },
            { key: 'multiBioPhotoSupport', value: '0:1:1:0:0:0:0:1:1:1' },
            { key: 'FingerFunOn', value: '1' },
            { key: 'FaceFunOn', value: '1' },
            { key: 'BioPhotoFun', value: '1' },
            { key: 'BioDataFun', value: '1' },
            { key: 'VisilightFun', value: '1' }
        ];

        for (const config of defaultConfigs) {
            await this.db.run(`
                INSERT OR REPLACE INTO device_configs 
                (device_serial, config_key, config_value)
                VALUES (?, ?, ?)
            `, [serialNumber, config.key, config.value]);
        }
    }

    async getDeviceConfig(serialNumber) {
        try {
            const configs = await this.db.all(
                'SELECT config_key, config_value FROM device_configs WHERE device_serial = ?',
                [serialNumber]
            );

            const configObject = {};
            configs.forEach(config => {
                configObject[config.config_key] = config.config_value;
            });

            return configObject;
        } catch (error) {
            console.error('Error getting device config:', error);
            return {};
        }
    }

    async updateDeviceInfo(serialNumber, infoString) {
        try {
            // Parse device info string
            // Format: "firmwareVersion,userCount,fingerprintCount,recordCount,ipAddress,fpAlgorithm,faceAlgorithm,faceEnrollCount,faceCount,functions"
            const infoParts = infoString.split(',');
            
            if (infoParts.length >= 5) {
                const [
                    firmwareVersion,
                    userCount,
                    fingerprintCount,
                    recordCount,
                    ipAddress,
                    fpAlgorithm,
                    faceAlgorithm,
                    faceEnrollCount,
                    faceCount,
                    functions
                ] = infoParts;

                await this.db.run(`
                    UPDATE devices 
                    SET firmware_version = ?, ip_address = ?, 
                        fingerprint_algorithm = ?, face_algorithm = ?,
                        device_info = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE serial_number = ?
                `, [
                    firmwareVersion,
                    ipAddress,
                    fpAlgorithm,
                    faceAlgorithm,
                    infoString,
                    serialNumber
                ]);

                console.log(`Device info updated for ${serialNumber}`);
            }

            return { success: true };
        } catch (error) {
            console.error('Error updating device info:', error);
            throw error;
        }
    }

    async updateLastSeen(serialNumber) {
        try {
            await this.db.run(
                'UPDATE devices SET last_seen = CURRENT_TIMESTAMP WHERE serial_number = ?',
                [serialNumber]
            );
            return { success: true };
        } catch (error) {
            console.error('Error updating last seen:', error);
            throw error;
        }
    }

    async getDevice(serialNumber) {
        try {
            return await this.db.get(
                'SELECT * FROM devices WHERE serial_number = ?',
                [serialNumber]
            );
        } catch (error) {
            console.error('Error getting device:', error);
            return null;
        }
    }

    async getAllDevices() {
        try {
            return await this.db.all('SELECT * FROM devices ORDER BY created_at DESC');
        } catch (error) {
            console.error('Error getting all devices:', error);
            return [];
        }
    }

    async getActiveDevices(minutesThreshold = 10) {
        try {
            const threshold = moment().subtract(minutesThreshold, 'minutes').format('YYYY-MM-DD HH:mm:ss');
            
            return await this.db.all(
                'SELECT * FROM devices '
                
            );
        } catch (error) {
            console.error('Error getting active devices:', error);
            return [];
        }
    }

    async updateDeviceConfig(serialNumber, configKey, configValue) {
        try {
            await this.db.run(`
                INSERT OR REPLACE INTO device_configs 
                (device_serial, config_key, config_value, updated_at)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            `, [serialNumber, configKey, configValue]);

            return { success: true };
        } catch (error) {
            console.error('Error updating device config:', error);
            throw error;
        }
    }

    async processDeviceOptions(serialNumber, optionsData) {
        try {
            // Parse options data: "key1=value1,key2=value2,..."
            const options = this.parseOptionsString(optionsData);
            
            for (const [key, value] of Object.entries(options)) {
                await this.updateDeviceConfig(serialNumber, key, value);
            }

            console.log(`Device options updated for ${serialNumber}:`, options);
            return { success: true };
        } catch (error) {
            console.error('Error processing device options:', error);
            throw error;
        }
    }

    parseOptionsString(optionsData) {
        const options = {};
        
        if (!optionsData) return options;
        
        // Split by comma and parse key=value pairs
        const pairs = optionsData.split(',');
        
        for (const pair of pairs) {
            const [key, value] = pair.split('=').map(s => s.trim());
            if (key && value !== undefined) {
                options[key] = value;
            }
        }
        
        return options;
    }

    async getDeviceCapabilities(serialNumber) {
        try {
            const device = await this.getDevice(serialNumber);
            if (!device) return null;

            const config = await this.getDeviceConfig(serialNumber);
            
            return {
                serialNumber: device.serial_number,
                pushVersion: device.push_version,
                firmwareVersion: device.firmware_version,
                multiBioDataSupport: config.multiBioDataSupport || '0:1:1:0:0:0:0:1:1:1',
                multiBioPhotoSupport: config.multiBioPhotoSupport || '0:1:1:0:0:0:0:1:1:1',
                fingerFunOn: config.FingerFunOn || '1',
                faceFunOn: config.FaceFunOn || '1',
                lastSeen: device.last_seen
            };
        } catch (error) {
            console.error('Error getting device capabilities:', error);
            return null;
        }
    }

    async removeDevice(serialNumber) {
        try {
            // Start transaction to remove all device data
            const operations = [
                { sql: 'DELETE FROM users WHERE device_serial = ?', params: [serialNumber] },
                { sql: 'DELETE FROM fingerprint_templates WHERE device_serial = ?', params: [serialNumber] },
                { sql: 'DELETE FROM face_templates WHERE device_serial = ?', params: [serialNumber] },
                { sql: 'DELETE FROM finger_vein_templates WHERE device_serial = ?', params: [serialNumber] },
                { sql: 'DELETE FROM bio_templates WHERE device_serial = ?', params: [serialNumber] },
                { sql: 'DELETE FROM user_photos WHERE device_serial = ?', params: [serialNumber] },
                { sql: 'DELETE FROM comparison_photos WHERE device_serial = ?', params: [serialNumber] },
                { sql: 'DELETE FROM work_codes WHERE device_serial = ?', params: [serialNumber] },
                { sql: 'DELETE FROM short_messages WHERE device_serial = ?', params: [serialNumber] },
                { sql: 'DELETE FROM user_sms WHERE device_serial = ?', params: [serialNumber] },
                { sql: 'DELETE FROM id_cards WHERE device_serial = ?', params: [serialNumber] },
                { sql: 'DELETE FROM commands WHERE device_serial = ?', params: [serialNumber] },
                { sql: 'DELETE FROM device_configs WHERE device_serial = ?', params: [serialNumber] },
                { sql: 'DELETE FROM devices WHERE serial_number = ?', params: [serialNumber] }
            ];

            await this.db.transaction(operations);
            console.log(`Device ${serialNumber} and all associated data removed`);
            
            return { success: true };
        } catch (error) {
            console.error('Error removing device:', error);
            throw error;
        }
    }

    async getDeviceStats(serialNumber) {
        try {
            const stats = {};
            
            // Count users
            const userResult = await this.db.get(
                'SELECT COUNT(*) as count FROM users WHERE device_serial = ?',
                [serialNumber]
            );
            stats.userCount = userResult ? userResult.count : 0;

            // Count fingerprint templates
            const fpResult = await this.db.get(
                'SELECT COUNT(*) as count FROM fingerprint_templates WHERE device_serial = ?',
                [serialNumber]
            );
            stats.fingerprintCount = fpResult ? fpResult.count : 0;

            // Count face templates
            const faceResult = await this.db.get(
                'SELECT COUNT(*) as count FROM face_templates WHERE device_serial = ?',
                [serialNumber]
            );
            stats.faceCount = faceResult ? faceResult.count : 0;

            // Count bio templates
            const bioResult = await this.db.get(
                'SELECT COUNT(*) as count FROM bio_templates WHERE device_serial = ?',
                [serialNumber]
            );
            stats.bioTemplateCount = bioResult ? bioResult.count : 0;

            return stats;
        } catch (error) {
            console.error('Error getting device stats:', error);
            return {};
        }
    }
}

module.exports = DeviceManager; 
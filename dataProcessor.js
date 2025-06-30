class DataProcessor {
    constructor(database, deviceManager) {
        this.db = database;
        this.deviceManager = deviceManager;
    }

    async processOptions(serialNumber, data) {
        try {
            console.log(`Processing options for device ${serialNumber}: ${data}`);
            
            // Process device options/configuration
            await this.deviceManager.processDeviceOptions(serialNumber, data);
            
            return { success: true, count: 1 };
        } catch (error) {
            console.error('Error processing options:', error);
            return { success: false, message: error.message };
        }
    }

    async processOperationLog(serialNumber, data, stamp) {
        try {
            console.log(`Processing operation log for device ${serialNumber}`);
            
            const records = this.parseDataRecords(data);
            let processedCount = 0;

            for (const record of records) {
                const result = await this.processOperationRecord(serialNumber, record);
                if (result.success) {
                    processedCount++;
                }
            }

            // Trigger sync to other devices
            await this.syncDataToOtherDevices(serialNumber, 'OPERLOG', records);

            return { success: true, count: processedCount };
        } catch (error) {
            console.error('Error processing operation log:', error);
            return { success: false, message: error.message };
        }
    }

    async processOperationRecord(serialNumber, record) {
        try {
            const parsed = this.parseOperationRecord(record);
            
            if (parsed.type === 'USER') {
                return await this.processUserInfo(serialNumber, parsed.data);
            } else if (parsed.type === 'FP') {
                return await this.processFingerprintTemplate(serialNumber, parsed.data);
            } else if (parsed.type === 'FACE') {
                return await this.processFaceTemplate(serialNumber, parsed.data);
            } else if (parsed.type === 'FVEIN') {
                return await this.processFingerVeinTemplate(serialNumber, parsed.data);
            } else if (parsed.type === 'USERPIC') {
                return await this.processUserPhoto(serialNumber, parsed.data);
            } else if (parsed.type === 'BIOPHOTO') {
                return await this.processComparisonPhoto(serialNumber, parsed.data);
            }

            return { success: true };
        } catch (error) {
            console.error('Error processing operation record:', error);
            return { success: false, message: error.message };
        }
    }

    async processBioData(serialNumber, data, stamp) {
        try {
            console.log(`Processing bio data for device ${serialNumber}`);
            
            const records = this.parseDataRecords(data);
            let processedCount = 0;

            for (const record of records) {
                const result = await this.processBioTemplate(serialNumber, record);
                if (result.success) {
                    processedCount++;
                }
            }

            // Trigger sync to other devices
            await this.syncDataToOtherDevices(serialNumber, 'BIODATA', records);

            return { success: true, count: processedCount };
        } catch (error) {
            console.error('Error processing bio data:', error);
            return { success: false, message: error.message };
        }
    }

    async processIdCard(serialNumber, data, stamp) {
        try {
            console.log(`Processing ID card data for device ${serialNumber}`);
            
            const records = this.parseDataRecords(data);
            let processedCount = 0;

            for (const record of records) {
                const result = await this.processIdCardInfo(serialNumber, record);
                if (result.success) {
                    processedCount++;
                }
            }

            // Trigger sync to other devices
            await this.syncDataToOtherDevices(serialNumber, 'IDCARD', records);

            return { success: true, count: processedCount };
        } catch (error) {
            console.error('Error processing ID card data:', error);
            return { success: false, message: error.message };
        }
    }

    parseDataRecords(data) {
        if (!data || data.trim() === '') {
            return [];
        }

        // Split by line breaks and filter empty lines
        return data.split('\n').filter(line => line.trim() !== '');
    }

    parseOperationRecord(record) {
        // Parse different record types based on prefix
        if (record.startsWith('USER ')) {
            return { type: 'USER', data: this.parseKeyValueString(record.substring(5)) };
        } else if (record.startsWith('FP ')) {
            return { type: 'FP', data: this.parseKeyValueString(record.substring(3)) };
        } else if (record.startsWith('FACE ')) {
            return { type: 'FACE', data: this.parseKeyValueString(record.substring(5)) };
        } else if (record.startsWith('FVEIN ')) {
            return { type: 'FVEIN', data: this.parseKeyValueString(record.substring(6)) };
        } else if (record.startsWith('USERPIC ')) {
            return { type: 'USERPIC', data: this.parseKeyValueString(record.substring(8)) };
        } else if (record.startsWith('BIOPHOTO ')) {
            return { type: 'BIOPHOTO', data: this.parseKeyValueString(record.substring(9)) };
        } else if (record.startsWith('BIODATA ')) {
            return { type: 'BIODATA', data: this.parseKeyValueString(record.substring(8)) };
        } else if (record.startsWith('IDCARD ')) {
            return { type: 'IDCARD', data: this.parseKeyValueString(record.substring(7)) };
        }
        
        return { type: 'UNKNOWN', data: {} };
    }

    parseKeyValueString(str) {
        const result = {};
        const parts = str.split('\t'); // Tab separated
        
        for (const part of parts) {
            const [key, value] = part.split('=');
            if (key && value !== undefined) {
                result[key] = value;
            }
        }
        
        return result;
    }

    async processUserInfo(serialNumber, userData) {
        try {
            const {
                PIN: pin,
                Name: name,
                Pri: privilege,
                Passwd: password,
                Card: card,
                Grp: groupId,
                TZ: timeZone,
                Verify: verifyMode,
                ViceCard: viceCard
            } = userData;

            if (!pin) {
                return { success: false, message: 'Missing PIN' };
            }

            // Insert or update user
            await this.db.run(`
                INSERT OR REPLACE INTO users 
                (pin, name, privilege, password, card, group_id, time_zone, verify_mode, vice_card, device_serial)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                pin,
                name || '',
                parseInt(privilege) || 0,
                password || '',
                card || '',
                parseInt(groupId) || 1,
                timeZone || '0000000000000000',
                parseInt(verifyMode) || -1,
                viceCard || '',
                serialNumber
            ]);

            console.log(`User ${pin} processed for device ${serialNumber}`);
            return { success: true };
        } catch (error) {
            console.error('Error processing user info:', error);
            return { success: false, message: error.message };
        }
    }

    async processFingerprintTemplate(serialNumber, templateData) {
        try {
            const {
                PIN: pin,
                FID: fid,
                Size: size,
                Valid: valid,
                TMP: template
            } = templateData;

            if (!pin || fid === undefined) {
                return { success: false, message: 'Missing PIN or FID' };
            }

            await this.db.run(`
                INSERT OR REPLACE INTO fingerprint_templates 
                (pin, fid, size, valid, template_data, device_serial)
                VALUES (?, ?, ?, ?, ?, ?)
            `, [
                pin,
                parseInt(fid),
                parseInt(size) || 0,
                parseInt(valid) || 1,
                template || '',
                serialNumber
            ]);

            console.log(`Fingerprint template processed: ${pin}:${fid} for device ${serialNumber}`);
            return { success: true };
        } catch (error) {
            console.error('Error processing fingerprint template:', error);
            return { success: false, message: error.message };
        }
    }

    async processFaceTemplate(serialNumber, templateData) {
        try {
            const {
                PIN: pin,
                FID: fid,
                SIZE: size,
                VALID: valid,
                TMP: template
            } = templateData;

            if (!pin || fid === undefined) {
                return { success: false, message: 'Missing PIN or FID' };
            }

            await this.db.run(`
                INSERT OR REPLACE INTO face_templates 
                (pin, fid, size, valid, template_data, device_serial)
                VALUES (?, ?, ?, ?, ?, ?)
            `, [
                pin,
                parseInt(fid),
                parseInt(size) || 0,
                parseInt(valid) || 1,
                template || '',
                serialNumber
            ]);

            console.log(`Face template processed: ${pin}:${fid} for device ${serialNumber}`);
            return { success: true };
        } catch (error) {
            console.error('Error processing face template:', error);
            return { success: false, message: error.message };
        }
    }

    async processBioTemplate(serialNumber, record) {
        try {
            const templateData = this.parseKeyValueString(record.substring(8)); // Remove 'BIODATA '
            
            const {
                Pin: pin,
                No: no,
                Index: index,
                Valid: valid,
                Duress: duress,
                Type: type,
                MajorVer: majorVer,
                MinorVer: minorVer,
                Format: format,
                Tmp: template
            } = templateData;

            if (!pin || type === undefined) {
                return { success: false, message: 'Missing PIN or Type' };
            }

            await this.db.run(`
                INSERT OR REPLACE INTO bio_templates 
                (pin, bio_no, index_num, valid, duress, type, major_ver, minor_ver, format, template_data, device_serial)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                pin,
                parseInt(no) || 0,
                parseInt(index) || 0,
                parseInt(valid) || 1,
                parseInt(duress) || 0,
                parseInt(type),
                parseInt(majorVer) || 0,
                parseInt(minorVer) || 0,
                parseInt(format) || 0,
                template || '',
                serialNumber
            ]);

            console.log(`Bio template processed: ${pin}:${type}:${no}:${index} for device ${serialNumber}`);
            return { success: true };
        } catch (error) {
            console.error('Error processing bio template:', error);
            return { success: false, message: error.message };
        }
    }

    async processUserPhoto(serialNumber, photoData) {
        try {
            const {
                PIN: pin,
                FileName: filename,
                Size: size,
                Content: content
            } = photoData;

            if (!pin) {
                return { success: false, message: 'Missing PIN' };
            }

            await this.db.run(`
                INSERT OR REPLACE INTO user_photos 
                (pin, filename, size, content, device_serial)
                VALUES (?, ?, ?, ?, ?)
            `, [
                pin,
                filename || '',
                parseInt(size) || 0,
                content || '',
                serialNumber
            ]);

            console.log(`User photo processed: ${pin} for device ${serialNumber}`);
            return { success: true };
        } catch (error) {
            console.error('Error processing user photo:', error);
            return { success: false, message: error.message };
        }
    }

    async processComparisonPhoto(serialNumber, photoData) {
        try {
            const {
                PIN: pin,
                FileName: filename,
                Type: type,
                Size: size,
                Content: content
            } = photoData;

            if (!pin || type === undefined) {
                return { success: false, message: 'Missing PIN or Type' };
            }

            await this.db.run(`
                INSERT OR REPLACE INTO comparison_photos 
                (pin, filename, type, size, content, device_serial)
                VALUES (?, ?, ?, ?, ?, ?)
            `, [
                pin,
                filename || '',
                parseInt(type),
                parseInt(size) || 0,
                content || '',
                serialNumber
            ]);

            console.log(`Comparison photo processed: ${pin}:${type} for device ${serialNumber}`);
            return { success: true };
        } catch (error) {
            console.error('Error processing comparison photo:', error);
            return { success: false, message: error.message };
        }
    }

    async processIdCardInfo(serialNumber, record) {
        try {
            const cardData = this.parseKeyValueString(record.substring(7)); // Remove 'IDCARD '
            
            const {
                PIN: pin,
                SNNum: snNum,
                IDNum: idNum,
                DNNum: dnNum,
                Name: name,
                Gender: gender,
                Nation: nation,
                Birthday: birthday,
                ValidInfo: validInfo,
                Address: address,
                AdditionalInfo: additionalInfo,
                Issuer: issuer,
                Photo: photo,
                FPTemplate1: fpTemplate1,
                FPTemplate2: fpTemplate2,
                Reserve: reserve,
                Notice: notice
            } = cardData;

            if (!idNum) {
                return { success: false, message: 'Missing ID number' };
            }

            await this.db.run(`
                INSERT OR REPLACE INTO id_cards 
                (pin, sn_num, id_num, dn_num, name, gender, nation, birthday, valid_info, 
                 address, additional_info, issuer, photo, fp_template1, fp_template2, 
                 reserve, notice, device_serial)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                pin || '',
                snNum || '',
                idNum,
                dnNum || '',
                name || '',
                parseInt(gender) || 0,
                parseInt(nation) || 0,
                birthday || '',
                validInfo || '',
                address || '',
                additionalInfo || '',
                issuer || '',
                photo || '',
                fpTemplate1 || '',
                fpTemplate2 || '',
                reserve || '',
                notice || '',
                serialNumber
            ]);

            console.log(`ID card processed: ${idNum} for device ${serialNumber}`);
            return { success: true };
        } catch (error) {
            console.error('Error processing ID card:', error);
            return { success: false, message: error.message };
        }
    }

    async syncDataToOtherDevices(sourceDevice, dataType, records) {
        try {
            // Get all registered devices
            const allDevices = await this.deviceManager.getAllDevices();
            const otherDevices = allDevices.filter(device => device.serial_number !== sourceDevice);

            console.log(`🔍 SYNC DEBUG - Source: ${sourceDevice}`);
            console.log(`🔍 Total devices in DB: ${allDevices.length}`);
            console.log(`🔍 Other devices to sync to: ${otherDevices.length}`);
            console.log(`🔍 Target device serials:`, otherDevices.map(d => d.serial_number));

            if (otherDevices.length === 0) {
                console.log('❌ No other devices to sync to');
                return;
            }

            console.log(`✅ Syncing ${dataType} from ${sourceDevice} to ${otherDevices.length} devices`);

            // For each device, create sync commands
            for (const device of otherDevices) {
                await this.createSyncCommands(device.serial_number, sourceDevice, dataType, records);
            }

        } catch (error) {
            console.error('Error syncing data to other devices:', error);
        }
    }

    async createSyncCommands(targetDevice, sourceDevice, dataType, records) {
        try {
            const CommandManager = require('./commandManager');
            const commandManager = new CommandManager(this.db);

            for (const record of records) {
                const parsed = this.parseOperationRecord(record);
                
                if (parsed.type === 'USER') {
                    await commandManager.addUser(targetDevice, {
                        pin: parsed.data.PIN,
                        name: parsed.data.Name,
                        privilege: parsed.data.Pri,
                        password: parsed.data.Passwd,
                        card: parsed.data.Card,
                        groupId: parsed.data.Grp,
                        timeZone: parsed.data.TZ,
                        verifyMode: parsed.data.Verify,
                        viceCard: parsed.data.ViceCard
                    });
                } else if (parsed.type === 'FP') {
                    await commandManager.addFingerprintTemplate(targetDevice, {
                        pin: parsed.data.PIN,
                        fid: parsed.data.FID,
                        size: parsed.data.Size,
                        valid: parsed.data.Valid,
                        template: parsed.data.TMP
                    });
                } else if (parsed.type === 'FACE') {
                    await commandManager.addFaceTemplate(targetDevice, {
                        pin: parsed.data.PIN,
                        fid: parsed.data.FID,
                        size: parsed.data.SIZE,
                        valid: parsed.data.VALID,
                        template: parsed.data.TMP
                    });
                } else if (parsed.type === 'BIODATA') {
                    await commandManager.addBioTemplate(targetDevice, {
                        pin: parsed.data.Pin,
                        no: parsed.data.No,
                        index: parsed.data.Index,
                        valid: parsed.data.Valid,
                        duress: parsed.data.Duress,
                        type: parsed.data.Type,
                        majorVer: parsed.data.MajorVer,
                        minorVer: parsed.data.MinorVer,
                        format: parsed.data.Format,
                        template: parsed.data.Tmp
                    });
                }

                // Log the sync operation
                await this.db.run(`
                    INSERT INTO sync_log 
                    (source_device, target_device, data_type, data_id, action)
                    VALUES (?, ?, ?, ?, ?)
                `, [
                    sourceDevice,
                    targetDevice,
                    parsed.type,
                    parsed.data.PIN || parsed.data.Pin || parsed.data.IDNum || 'unknown',
                    'sync'
                ]);
            }

            console.log(`Sync commands created for device ${targetDevice}`);
        } catch (error) {
            console.error('Error creating sync commands:', error);
        }
    }
}

module.exports = DataProcessor; 
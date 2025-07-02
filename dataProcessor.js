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
                return await this.processFingerVeinTemplate(serialNumber, record);
            } else if (parsed.type === 'USERPIC') {
                return await this.processUserPhoto(serialNumber, parsed.data);
            } else if (parsed.type === 'BIODATA') {
                return await this.processBioTemplate(serialNumber, record);
            } else if (parsed.type === 'IDCARD') {
                return await this.processIdCardInfo(serialNumber, record);
            } else if (parsed.type === 'WORKCODE') {
                return await this.processWorkCodeInfo(serialNumber, record);
            } else if (parsed.type === 'SMS') {
                return await this.processShortMessageInfo(serialNumber, record);
            } else if (parsed.type === 'USER_SMS') {
                return await this.processUserSMSInfo(serialNumber, record);
            } else if (parsed.type === 'ERRORLOG') {
                return await this.processErrorLogInfo(serialNumber, record);
            }

            return { success: true };
        } catch (error) {
            console.error('Error processing operation record:', error);
            return { success: false, message: error.message };
        }
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
        } else if (record.startsWith('WORKCODE ')) {
            return { type: 'WORKCODE', data: this.parseKeyValueString(record.substring(9)) };
        } else if (record.startsWith('SMS ')) {
            return { type: 'SMS', data: this.parseKeyValueString(record.substring(4)) };
        } else if (record.startsWith('USER_SMS ')) {
            return { type: 'USER_SMS', data: this.parseKeyValueString(record.substring(9)) };
        } else if (record.startsWith('ERRORLOG ')) {
            return { type: 'ERRORLOG', data: this.parseKeyValueString(record.substring(9)) };
        } else if (record.startsWith('BIODATA ')) {
            return { type: 'BIODATA', data: this.parseBiodataRecord(record.substring(8)) };
        } else if (record.startsWith('IDCARD ')) {
            return { type: 'IDCARD', data: this.parseKeyValueString(record.substring(7)) };
        }
        
        return { type: 'UNKNOWN', data: record };
    }

    parseBiodataRecord(record) {
        // BIODATA uses spaces in upload format: Pin=X No=Y Index=Z Valid=W...
        // Parse this carefully according to protocol specification, handling multiple spaces
        const fields = {};
        // Split by one or more whitespace characters and filter out empty strings
        const parts = record.trim().split(/\s+/).filter(part => part.length > 0);
        
        for (const part of parts) {
            const [key, value] = part.split('=');
            if (key && value !== undefined) {
                fields[key] = value;
            }
        }
        
        return fields;
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

    async processFingerVeinData(serialNumber, data, stamp) {
        try {
            console.log(`Processing finger vein data for device ${serialNumber}`);
            
            const records = this.parseDataRecords(data);
            let processedCount = 0;

            for (const record of records) {
                const result = await this.processFingerVeinTemplate(serialNumber, record);
                if (result.success) {
                    processedCount++;
                }
            }

            // Trigger sync to other devices
            await this.syncDataToOtherDevices(serialNumber, 'FVEIN', records);

            return { success: true, count: processedCount };
        } catch (error) {
            console.error('Error processing finger vein data:', error);
            return { success: false, message: error.message };
        }
    }

    async processWorkCode(serialNumber, data, stamp) {
        try {
            console.log(`Processing work code data for device ${serialNumber}`);
            
            const records = this.parseDataRecords(data);
            let processedCount = 0;

            for (const record of records) {
                const result = await this.processWorkCodeInfo(serialNumber, record);
                if (result.success) {
                    processedCount++;
                }
            }

            // Trigger sync to other devices
            await this.syncDataToOtherDevices(serialNumber, 'WORKCODE', records);

            return { success: true, count: processedCount };
        } catch (error) {
            console.error('Error processing work code data:', error);
            return { success: false, message: error.message };
        }
    }

    async processShortMessage(serialNumber, data, stamp) {
        try {
            console.log(`Processing short message data for device ${serialNumber}`);
            
            const records = this.parseDataRecords(data);
            let processedCount = 0;

            for (const record of records) {
                const result = await this.processShortMessageInfo(serialNumber, record);
                if (result.success) {
                    processedCount++;
                }
            }

            return { success: true, count: processedCount };
        } catch (error) {
            console.error('Error processing short message data:', error);
            return { success: false, message: error.message };
        }
    }

    async processUserSMS(serialNumber, data, stamp) {
        try {
            console.log(`Processing user SMS data for device ${serialNumber}`);
            
            const records = this.parseDataRecords(data);
            let processedCount = 0;

            for (const record of records) {
                const result = await this.processUserSMSInfo(serialNumber, record);
                if (result.success) {
                    processedCount++;
                }
            }

            return { success: true, count: processedCount };
        } catch (error) {
            console.error('Error processing user SMS data:', error);
            return { success: false, message: error.message };
        }
    }

    async processErrorLog(serialNumber, data, stamp) {
        try {
            console.log(`Processing error log data for device ${serialNumber}`);
            
            const records = this.parseDataRecords(data);
            let processedCount = 0;

            for (const record of records) {
                const result = await this.processErrorLogInfo(serialNumber, record);
                if (result.success) {
                    processedCount++;
                }
            }

            return { success: true, count: processedCount };
        } catch (error) {
            console.error('Error processing error log data:', error);
            return { success: false, message: error.message };
        }
    }

    async processRemoteAttendance(serialNumber, queryParams) {
        try {
            const { PIN } = queryParams;
            
            if (!PIN) {
                return { success: false, userFound: false };
            }

            // Query user information
            const user = await this.db.get(
                'SELECT * FROM users WHERE pin = ?',
                [PIN]
            );

            if (!user) {
                console.log(`Remote attendance: User ${PIN} not found`);
                return { success: false, userFound: false };
            }

            // Query fingerprint templates
            const fingerprints = await this.db.all(
                'SELECT * FROM fingerprint_templates WHERE pin = ?',
                [PIN]
            );

            // Query face templates  
            const faces = await this.db.all(
                'SELECT * FROM face_templates WHERE pin = ?',
                [PIN]
            );

            // Query BIODATA templates
            const biodata = await this.db.all(
                'SELECT * FROM bio_templates WHERE pin = ?',
                [PIN]
            );

            const userData = {
                pin: user.pin,
                name: user.name,
                privilege: user.privilege,
                password: user.password,
                card: user.card,
                groupId: user.group_id,
                timeZone: user.time_zone,
                verifyMode: user.verify_mode,
                viceCard: user.vice_card
            };

            return {
                success: true,
                userFound: true,
                userData,
                fingerprints,
                faces,
                biodata
            };

        } catch (error) {
            console.error('Error processing remote attendance:', error);
            return { success: false, userFound: false, message: error.message };
        }
    }

    parseDataRecords(data) {
        if (!data || data.trim() === '') {
            return [];
        }

        // Split by line breaks and filter empty lines
        return data.split('\n').filter(line => line.trim() !== '');
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
            console.log(`🔍 RAW BIODATA UPLOAD from ${serialNumber}:`);
            console.log(`   📝 Raw record: ${record.substring(0, 200)}...`);
            
            // Extract BIODATA portion and parse using spaces (protocol specification)
            const biodataContent = record.substring(8); // Remove 'BIODATA '
            const templateData = this.parseBiodataRecord(biodataContent);
            
            console.log(`   📋 Parsed BIODATA fields:`, JSON.stringify(templateData, null, 2));
            
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

            if (!pin || !type) {
                throw new Error('Missing required PIN or Type in BIODATA');
            }

            // Store in database
            await this.db.run(
                `INSERT OR REPLACE INTO bio_templates 
                (device_serial, pin, bio_no, index_num, valid, duress, type, major_ver, minor_ver, format, template_data) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [serialNumber, pin, no || 0, index || 0, valid || 1, duress || 0, type, majorVer || 0, minorVer || 0, format || 'ZK', template]
            );

            // Sync to other devices using correct BIODATA format
            await this.syncBiodataToOtherDevices(serialNumber, templateData);

            return { success: true };
        } catch (error) {
            console.error('Error processing BIODATA template:', error);
            return { success: false, message: error.message };
        }
    }

    async syncBiodataToOtherDevices(sourceDevice, biodataFields) {
        try {
            // Get all registered devices and filter out the source device
            const allDevices = await this.deviceManager.getAllDevices();
            const otherDevices = allDevices.filter(device => device.serial_number !== sourceDevice);

            console.log(`🔍 SYNC DEBUG - Source: ${sourceDevice}`);
            console.log(`🔍 Total devices in DB: ${allDevices.length}`);
            console.log(`🔍 Other devices to sync to: ${otherDevices.length}`);
            console.log(`🔍 Target device serials:`, otherDevices.map(d => d.serial_number));

            if (otherDevices.length === 0) {
                console.log('❌ No other devices to sync BIODATA to');
                return;
            }

            console.log(`✅ Syncing BIODATA from ${sourceDevice} to ${otherDevices.length} devices`);

            const CommandManager = require('./commandManager');
            const commandManager = new CommandManager(this.db);

            for (const device of otherDevices) {
                try {
                    console.log(`🔄 Creating sync commands for ${device.serial_number}: 1 BIODATA records`);
                    
                    // Generate BIODATA sync command following exact protocol specification
                    // Format: DATA UPDATE BIODATA Pin=${XXX}${HT}No=${XXX}${HT}Index=${XXX}${HT}Valid=${XXX}${HT}Duress=${XXX}${HT}Type=${XXX}${HT}MajorVer=${XXX}${HT}MinorVer=${XXX}${HT}Format=${XXX}${HT}Tmp=${XXX}
                    
                    console.log(`🔍 BIODATA SYNC DEBUG for PIN ${biodataFields.Pin}:`);
                    console.log(`   📄 Raw parsed data:`, JSON.stringify(biodataFields, null, 2));
                    console.log(`   🔗 Fields: Pin=${biodataFields.Pin}, No=${biodataFields.No}, Index=${biodataFields.Index}, Valid=${biodataFields.Valid}`);
                    console.log(`   📋 Bio fields: Type=${biodataFields.Type}, MajorVer=${biodataFields.MajorVer}, MinorVer=${biodataFields.MinorVer}, Format=${biodataFields.Format}`);
                    console.log(`   📝 Template length: ${biodataFields.Tmp ? biodataFields.Tmp.length : 'undefined'}`);
                    
                    const result = await commandManager.addBiodataTemplate(device.serial_number, {
                        pin: biodataFields.Pin,
                        no: biodataFields.No || 0,
                        index: biodataFields.Index || 0,
                        valid: biodataFields.Valid || 1,
                        duress: biodataFields.Duress || 0,
                        type: biodataFields.Type,
                        majorVer: biodataFields.MajorVer || 0,
                        minorVer: biodataFields.MinorVer || 0,
                        format: biodataFields.Format || 'ZK', // Preserve original format value
                        template: biodataFields.Tmp
                    });
                    console.log(`   ✅ BIODATA sync result:`, result);

                    if (result.success) {
                        console.log(`✅ BIODATA sync queued for device ${device.serial_number} - PIN ${biodataFields.Pin}, Type ${biodataFields.Type}`);
                    } else {
                        console.log(`❌ Failed to queue BIODATA sync for device ${device.serial_number}: ${result.error}`);
                    }
                } catch (error) {
                    console.error(`Error syncing BIODATA to device ${device.serial_number}:`, error);
                }
            }

            console.log(`✅ Sync commands created for device ${otherDevices.map(d => d.serial_number).join(', ')}: 1 queued, 0 skipped`);
        } catch (error) {
            console.error('Error syncing BIODATA to other devices:', error);
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

    async processFingerVeinTemplate(serialNumber, record) {
        try {
            const templateData = this.parseKeyValueString(record.substring(6)); // Remove 'FVEIN '
            
            const {
                Pin: pin,
                FID: fid,
                Index: index,
                Size: size,
                Valid: valid,
                Tmp: template
            } = templateData;

            if (!pin || fid === undefined || index === undefined) {
                return { success: false, message: 'Missing PIN, FID, or Index' };
            }

            await this.db.run(`
                INSERT OR REPLACE INTO finger_vein_templates 
                (pin, fid, index_num, size, valid, template_data, device_serial)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `, [
                pin,
                parseInt(fid),
                parseInt(index),
                parseInt(size) || 0,
                parseInt(valid) || 1,
                template || '',
                serialNumber
            ]);

            console.log(`Finger vein template processed: ${pin}:${fid}:${index} for device ${serialNumber}`);
            return { success: true };
        } catch (error) {
            console.error('Error processing finger vein template:', error);
            return { success: false, message: error.message };
        }
    }

    async processWorkCodeInfo(serialNumber, record) {
        try {
            const workData = this.parseKeyValueString(record.substring(9)); // Remove 'WORKCODE '
            
            const {
                PIN: pin,
                CODE: code,
                NAME: name
            } = workData;

            if (!pin || !code) {
                return { success: false, message: 'Missing PIN or CODE' };
            }

            await this.db.run(`
                INSERT OR REPLACE INTO work_codes 
                (pin, code, name, device_serial)
                VALUES (?, ?, ?, ?)
            `, [
                pin,
                code,
                name || '',
                serialNumber
            ]);

            console.log(`Work code processed: ${pin}:${code} for device ${serialNumber}`);
            return { success: true };
        } catch (error) {
            console.error('Error processing work code:', error);
            return { success: false, message: error.message };
        }
    }

    async processShortMessageInfo(serialNumber, record) {
        try {
            const msgData = this.parseKeyValueString(record.substring(4)); // Remove 'SMS '
            
            const {
                MSG: msg,
                TAG: tag,
                UID: uid,
                MIN: minDuration,
                StartTime: startTime
            } = msgData;

            if (!uid || !msg || !tag) {
                return { success: false, message: 'Missing UID, MSG, or TAG' };
            }

            await this.db.run(`
                INSERT OR REPLACE INTO short_messages 
                (uid, msg, tag, min_duration, start_time, device_serial)
                VALUES (?, ?, ?, ?, ?, ?)
            `, [
                parseInt(uid),
                msg,
                parseInt(tag),
                parseInt(minDuration) || 0,
                startTime || null,
                serialNumber
            ]);

            console.log(`Short message processed: ${uid} for device ${serialNumber}`);
            return { success: true };
        } catch (error) {
            console.error('Error processing short message:', error);
            return { success: false, message: error.message };
        }
    }

    async processUserSMSInfo(serialNumber, record) {
        try {
            const userData = this.parseKeyValueString(record.substring(9)); // Remove 'USER_SMS '
            
            const {
                PIN: pin,
                UID: uid
            } = userData;

            if (!pin || !uid) {
                return { success: false, message: 'Missing PIN or UID' };
            }

            await this.db.run(`
                INSERT OR REPLACE INTO user_sms 
                (pin, uid, device_serial)
                VALUES (?, ?, ?)
            `, [
                pin,
                parseInt(uid),
                serialNumber
            ]);

            console.log(`User SMS association processed: ${pin}:${uid} for device ${serialNumber}`);
            return { success: true };
        } catch (error) {
            console.error('Error processing user SMS:', error);
            return { success: false, message: error.message };
        }
    }

    async processErrorLogInfo(serialNumber, record) {
        try {
            const errorData = this.parseKeyValueString(record.substring(9)); // Remove 'ERRORLOG '
            
            const {
                ErrCode: errCode,
                ErrMsg: errMsg,
                DataOrigin: dataOrigin,
                CmdId: cmdId,
                Additional: additional
            } = errorData;

            if (!errCode) {
                return { success: false, message: 'Missing ErrCode' };
            }

            // Store error log in a separate table if needed
            await this.db.run(`
                INSERT INTO sync_log 
                (source_device, target_device, data_type, data_id, action, status)
                VALUES (?, ?, ?, ?, ?, ?)
            `, [
                serialNumber,
                null,
                'ERRORLOG',
                errCode,
                `${dataOrigin || 'unknown'}:${errMsg || 'no message'}`,
                'logged'
            ]);

            console.log(`Error log processed: ${errCode} for device ${serialNumber}`);
            return { success: true };
        } catch (error) {
            console.error('Error processing error log:', error);
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
            console.log(`📋 Sync scope: USER info, BIODATA templates, WORKCODE, SMS (USERPIC/BIOPHOTO disabled)`);

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

            console.log(`🔄 Creating sync commands for ${targetDevice}: ${records.length} ${dataType} records`);
            let successCount = 0;
            let skippedCount = 0;

            for (const record of records) {
                const parsed = this.parseOperationRecord(record);
                let result = { success: true };
                
                if (parsed.type === 'USER') {
                    result = await commandManager.addUser(targetDevice, {
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
                    // Convert legacy fingerprint data to unified BIODATA format
                    console.log(`🔄 Converting legacy FP sync to BIODATA format for PIN ${parsed.data.PIN}`);
                    result = await commandManager.addBiodataTemplate(targetDevice, {
                        pin: parsed.data.PIN,
                        no: parseInt(parsed.data.FID) || 0,
                        index: 0,
                        valid: parseInt(parsed.data.Valid) || 1,
                        duress: 0,
                        type: 1, // Fingerprint type
                        majorVer: 0,
                        minorVer: 0,
                        format: 'ZK',
                        template: parsed.data.TMP
                    });
                } else if (parsed.type === 'FACE') {
                    // Convert legacy face data to unified BIODATA format
                    console.log(`🔄 Converting legacy FACE sync to BIODATA format for PIN ${parsed.data.PIN}`);
                    result = await commandManager.addBiodataTemplate(targetDevice, {
                        pin: parsed.data.PIN,
                        no: parseInt(parsed.data.FID) || 0,
                        index: 0,
                        valid: parseInt(parsed.data.VALID || parsed.data.Valid) || 1,
                        duress: 0,
                        type: 2, // Face type
                        majorVer: 0,
                        minorVer: 0,
                        format: 'ZK',
                        template: parsed.data.TMP
                    });
                } else if (parsed.type === 'BIODATA') {
                    // Always use BIODATA format since that's how devices upload the data
                    console.log(`🔍 BIODATA SYNC DEBUG for PIN ${parsed.data.Pin}:`);
                    console.log(`   📄 Raw parsed data:`, JSON.stringify(parsed.data, null, 2));
                    console.log(`   🔗 Fields: Pin=${parsed.data.Pin}, No=${parsed.data.No}, Index=${parsed.data.Index}, Valid=${parsed.data.Valid}`);
                    console.log(`   📋 Bio fields: Type=${parsed.data.Type}, MajorVer=${parsed.data.MajorVer}, MinorVer=${parsed.data.MinorVer}, Format=${parsed.data.Format}`);
                    console.log(`   📝 Template length: ${parsed.data.Tmp ? parsed.data.Tmp.length : 'undefined'}`);
                    
                    // Validate template data before syncing
                    if (parsed.data.Tmp && parsed.data.Tmp.length > 0) {
                        result = await commandManager.addBiodataTemplate(targetDevice, {
                            pin: parsed.data.Pin,
                            no: parsed.data.No || 0,
                            index: parsed.data.Index || 0,
                            valid: parsed.data.Valid || 1,
                            duress: parsed.data.Duress || 0,
                            type: parsed.data.Type,
                            majorVer: parsed.data.MajorVer || 0,
                            minorVer: parsed.data.MinorVer || 0,
                            format: parsed.data.Format || 0,
                            template: parsed.data.Tmp
                        });
                        console.log(`   ✅ BIODATA sync result:`, result);
                    } else {
                        console.log(`⚠️ Skipping BIODATA sync for PIN ${parsed.data.Pin}, Type ${parsed.data.Type} - empty template`);
                        result = { success: false, error: 'Empty template data' };
                    }
                } else if (parsed.type === 'FVEIN') {
                    // Convert finger vein data to unified BIODATA format
                    console.log(`🔄 Converting FVEIN sync to BIODATA format for PIN ${parsed.data.Pin}`);
                    result = await commandManager.addBiodataTemplate(targetDevice, {
                        pin: parsed.data.Pin,
                        no: parseInt(parsed.data.FID) || 0,
                        index: parseInt(parsed.data.Index) || 0,
                        valid: parseInt(parsed.data.Valid) || 1,
                        duress: 0,
                        type: 7, // Finger vein type
                        majorVer: 0,
                        minorVer: 0,
                        format: 'ZK',
                        template: parsed.data.Tmp
                    });
                } else if (parsed.type === 'USERPIC') {
                    // Skip USERPIC sync - biometric data is sufficient
                    console.log(`🚫 Skipping USERPIC sync for PIN ${parsed.data.PIN} - photos not needed for biometric system`);
                    result = { success: false, error: 'USERPIC sync disabled - biometric data only' };
                } else if (parsed.type === 'BIOPHOTO') {
                    // Skip BIOPHOTO sync - biometric data is sufficient  
                    console.log(`🚫 Skipping BIOPHOTO sync for PIN ${parsed.data.PIN} - photos not needed for biometric system`);
                    result = { success: false, error: 'BIOPHOTO sync disabled - biometric data only' };
                } else if (parsed.type === 'WORKCODE') {
                    result = await commandManager.addWorkCode(targetDevice, {
                        pin: parsed.data.PIN,
                        code: parsed.data.CODE,
                        name: parsed.data.NAME
                    });
                } else if (parsed.type === 'SMS') {
                    result = await commandManager.addShortMessage(targetDevice, {
                        uid: parsed.data.UID,
                        msg: parsed.data.MSG,
                        tag: parsed.data.TAG,
                        minDuration: parsed.data.MIN,
                        startTime: parsed.data.StartTime
                    });
                } else if (parsed.type === 'USER_SMS') {
                    result = await commandManager.addUserSMSAssociation(targetDevice, {
                        pin: parsed.data.PIN,
                        uid: parsed.data.UID
                    });
                }
                // Note: ERRORLOG entries are not synced to other devices

                // Track sync results
                if (result && result.success !== false) {
                    successCount++;
                } else {
                    skippedCount++;
                    console.log(`⚠️ Skipped syncing ${parsed.type} record: ${result?.error || 'Unknown error'}`);
                }

                // Log the sync operation
                await this.db.run(`
                    INSERT INTO sync_log 
                    (source_device, target_device, data_type, data_id, action, status)
                    VALUES (?, ?, ?, ?, ?, ?)
                `, [
                    sourceDevice,
                    targetDevice,
                    parsed.type,
                    parsed.data.PIN || parsed.data.Pin || parsed.data.IDNum || 'unknown',
                    'sync',
                    result && result.success !== false ? 'queued' : 'skipped'
                ]);
            }

            console.log(`✅ Sync commands created for device ${targetDevice}: ${successCount} queued, ${skippedCount} skipped`);
        } catch (error) {
            console.error('Error creating sync commands:', error);
        }
    }
}

module.exports = DataProcessor; 
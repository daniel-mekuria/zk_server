const { v4: uuidv4 } = require('uuid');

class CommandManager {
    constructor(database) {
        this.db = database;
        this.pendingCommands = new Map(); // In-memory cache for quick access
    }

    async addCommand(deviceSerial, commandType, commandData) {
        try {
            const commandId = uuidv4().replace(/-/g, '').substring(0, 16);
            
            await this.db.run(`
                INSERT INTO commands 
                (command_id, device_serial, command_type, command_data, status)
                VALUES (?, ?, ?, ?, 'pending')
            `, [commandId, deviceSerial, commandType, commandData]);

            console.log(`Command added for device ${deviceSerial}: ${commandType}`);
            return { success: true, commandId };
        } catch (error) {
            console.error('Error adding command:', error);
            throw error;
        }
    }

    async getNextCommand(deviceSerial) {
        try {
            const command = await this.db.get(`
                SELECT * FROM commands 
                WHERE device_serial = ? AND status = 'pending'
                ORDER BY created_at ASC 
                LIMIT 1
            `, [deviceSerial]);

            if (!command) {
                return null;
            }

            // Mark as sent
            await this.db.run(
                'UPDATE commands SET status = ? WHERE command_id = ?',
                ['sent', command.command_id]
            );

            // Format command according to ZK protocol
            const formattedCommand = this.formatCommand(command);
            
            console.log(`Sending command to ${deviceSerial}: ${formattedCommand}`);
            return formattedCommand;
        } catch (error) {
            console.error('Error getting next command:', error);
            return null;
        }
    }

    formatCommand(command) {
        // Format: C:${CmdID}:${CmdDesc} ${CmdData}
        return `C:${command.command_id}:${command.command_data}`;
    }

    async processCommandReply(deviceSerial, replyData) {
        try {
            // Parse reply format: ID=${CmdID}&Return=${ReturnCode}&CMD=${CmdType}[&other_params]
            const reply = this.parseCommandReply(replyData);
            
            if (reply.ID) {
                await this.db.run(`
                    UPDATE commands 
                    SET status = ?, result = ?, executed_at = CURRENT_TIMESTAMP
                    WHERE command_id = ? AND device_serial = ?
                `, ['completed', replyData, reply.ID, deviceSerial]);

                console.log(`Command reply processed: ${reply.ID} -> Return: ${reply.Return}`);
                
                // Handle specific command results
                await this.handleCommandResult(deviceSerial, reply);
            }

            return { success: true };
        } catch (error) {
            console.error('Error processing command reply:', error);
            throw error;
        }
    }

    parseCommandReply(replyData) {
        const reply = {};
        const parts = replyData.split('&');
        
        for (const part of parts) {
            const [key, value] = part.split('=');
            if (key && value !== undefined) {
                reply[key] = value;
            }
        }
        
        return reply;
    }

    async handleCommandResult(deviceSerial, reply) {
        // Handle specific command results based on command type
        switch (reply.CMD) {
            case 'DATA':
                await this.handleDataCommandResult(deviceSerial, reply);
                break;
            case 'CLEAR_LOG':
            case 'CLEAR_PHOTO':
            case 'CLEAR_DATA':
            case 'CLEAR_BIODATA':
                await this.handleClearCommandResult(deviceSerial, reply);
                break;
            case 'ENROLL_FP':
            case 'ENROLL_BIO':
            case 'ENROLL_MF':
                await this.handleEnrollCommandResult(deviceSerial, reply);
                break;
            case 'REBOOT':
            case 'AC_UNLOCK':
            case 'AC_UNALARM':
                console.log(`🔧 Control command ${reply.CMD} result for device ${deviceSerial}: ${reply.Return === '0' ? 'Success' : 'Failed'}`);
                break;
            case 'CHECK':
            case 'LOG':
            case 'VERIFY':
                console.log(`📊 Check command ${reply.CMD} result for device ${deviceSerial}: ${reply.Return === '0' ? 'Success' : 'Failed'}`);
                break;
            case 'INFO':
                console.log(`ℹ️ Info command result for device ${deviceSerial}: ${reply.Return === '0' ? 'Success' : 'Failed'}`);
                break;
            default:
                console.log(`❓ Unhandled command result: ${reply.CMD} for device ${deviceSerial}`);
        }
    }

    async handleDataCommandResult(deviceSerial, reply) {
        // Handle DATA command results
        if (reply.Return === '0') {
            console.log(`✅ Data command successful for device ${deviceSerial}`);
        } else {
            const errorCode = reply.Return;
            let errorDescription = 'Unknown error';
            
            // Map common error codes from the protocol specification
            switch (errorCode) {
                case '-1':
                    errorDescription = 'Parameter is incorrect';
                    break;
                case '-2':
                    errorDescription = 'Transmitted user photo data does not match the given size';
                    break;
                case '-3':
                    errorDescription = 'Reading or writing is incorrect';
                    break;
                case '-9':
                    errorDescription = 'Transmitted template data does not match the given size';
                    break;
                case '-10':
                    errorDescription = 'User specified by PIN does not exist in the equipment';
                    break;
                case '-11':
                    errorDescription = 'Fingerprint template format is illegal';
                    break;
                case '-12':
                    errorDescription = 'Fingerprint template is illegal';
                    break;
                case '-1001':
                    errorDescription = 'Limited capacity';
                    break;
                case '-1002':
                    errorDescription = 'Not supported by the equipment';
                    break;
                case '-1003':
                    errorDescription = 'Command execution timeout';
                    break;
                case '-1004':
                    errorDescription = 'Data and equipment configuration are inconsistent';
                    break;
                case '-1005':
                    errorDescription = 'Equipment is busy';
                    break;
                case '-1006':
                    errorDescription = 'Data is too long';
                    break;
                case '-1007':
                    errorDescription = 'Memory error';
                    break;
                case '-1008':
                    errorDescription = 'Failed to get server data';
                    break;
            }
            
            console.log(`❌ Data command failed for device ${deviceSerial}, error code: ${errorCode} (${errorDescription})`);
            
            // Special handling for template-related errors
            if (errorCode === '-11' || errorCode === '-12') {
                console.log(`🔧 Template format issue detected. This may be due to algorithm version mismatch or corrupted template data.`);
            }
        }
    }

    async handleClearCommandResult(deviceSerial, reply) {
        // Handle CLEAR command results
        if (reply.Return === '0') {
            console.log(`Clear command successful for device ${deviceSerial}`);
        } else {
            console.log(`Clear command failed for device ${deviceSerial}, return code: ${reply.Return}`);
        }
    }

    async handleEnrollCommandResult(deviceSerial, reply) {
        // Handle enrollment command results
        if (reply.Return === '0') {
            console.log(`Enrollment successful for device ${deviceSerial}`);
        } else {
            console.log(`Enrollment failed for device ${deviceSerial}, return code: ${reply.Return}`);
        }
    }

    // User management commands
    async addUser(deviceSerial, userInfo) {
        const { pin, name, privilege = 0, password = '', card = '', groupId = 1, timeZone = '0000000000000000', verifyMode = -1, viceCard = '' } = userInfo;
        
        const TAB = '\t';
        const commandData = `DATA UPDATE USERINFO PIN=${pin}${TAB}Name=${name}${TAB}Pri=${privilege}${TAB}Passwd=${password}${TAB}Card=${card}${TAB}Grp=${groupId}${TAB}TZ=${timeZone}${TAB}Verify=${verifyMode}${TAB}ViceCard=${viceCard}`;
        
        return await this.addCommand(deviceSerial, 'DATA', commandData);
    }

    async deleteUser(deviceSerial, pin) {
        const commandData = `DATA DELETE USERINFO PIN=${pin}`;
        return await this.addCommand(deviceSerial, 'DATA', commandData);
    }

    async queryUser(deviceSerial, pin) {
        const commandData = `DATA QUERY USERINFO PIN=${pin}`;
        return await this.addCommand(deviceSerial, 'DATA', commandData);
    }

    // Fingerprint template commands
    async addFingerprintTemplate(deviceSerial, fpData) {
        const { PIN: pin, FID: fid, Size: size, Valid: valid, TMP: template } = fpData;
        
        // Validate template data to prevent -12 errors
        if (!template || template.length === 0) {
            console.log(`⚠️ Skipping fingerprint template for PIN ${pin}, FID ${fid} - empty template data`);
            return { success: false, error: 'Empty template data' };
        }

        // Basic base64 validation
        try {
            // Check if template looks like valid base64
            const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
            if (!base64Regex.test(template)) {
                console.log(`⚠️ Skipping fingerprint template for PIN ${pin}, FID ${fid} - invalid base64 format`);
                return { success: false, error: 'Invalid base64 format' };
            }
        } catch (error) {
            console.log(`⚠️ Skipping fingerprint template for PIN ${pin}, FID ${fid} - validation error:`, error.message);
            return { success: false, error: 'Validation failed' };
        }

        const TAB = '\t';
        const commandData = `DATA UPDATE FINGERTMP PIN=${fpData.PIN}${TAB}FID=${fpData.FID}${TAB}Size=${fpData.Size || 0}${TAB}Valid=${fpData.Valid || 1}${TAB}TMP=${fpData.TMP || ''}`;
        
        return await this.addCommand(deviceSerial, 'DATA', commandData);
    }

    async deleteFingerprintTemplate(deviceSerial, pin, fid = null) {
        let commandData;
        if (fid !== null) {
            commandData = `DATA DELETE FINGERTMP PIN=${pin}\tFID=${fid}`;
        } else {
            commandData = `DATA DELETE FINGERTMP PIN=${pin}`;
        }
        
        return await this.addCommand(deviceSerial, 'DATA', commandData);
    }

    async queryFingerprintTemplate(deviceSerial, pin, fingerId = null) {
        let commandData;
        if (fingerId !== null) {
            commandData = `DATA QUERY FINGERTMP PIN=${pin}\tFingerID=${fingerId}`;
        } else {
            commandData = `DATA QUERY FINGERTMP PIN=${pin}`;
        }
        
        return await this.addCommand(deviceSerial, 'DATA', commandData);
    }

    // Face template commands
    async addFaceTemplate(deviceSerial, templateInfo) {
        const { pin, fid, size, valid = 1, template } = templateInfo;
        const TAB = '\t';
        const commandData = `DATA UPDATE FACE PIN=${pin}${TAB}FID=${fid}${TAB}Valid=${valid}${TAB}Size=${size}${TAB}TMP=${template}`;
        
        return await this.addCommand(deviceSerial, 'DATA', commandData);
    }

    async deleteFaceTemplate(deviceSerial, pin) {
        const commandData = `DATA DELETE FACE PIN=${pin}`;
        return await this.addCommand(deviceSerial, 'DATA', commandData);
    }

    // Unified bio template commands (BIODATA format)
    async addBiodataTemplate(deviceSerial, templateInfo) {
        const { 
            pin, 
            no = 0, 
            index = 0, 
            valid = 1, 
            duress = 0, 
            type, 
            majorVer = 0, 
            minorVer = 0, 
            format = 'ZK', 
            template 
        } = templateInfo;
        
        console.log(`🔧 BIODATA COMMAND DEBUG for device ${deviceSerial}:`);
        console.log(`   📋 Input params: pin=${pin}, no=${no}, index=${index}, valid=${valid}, duress=${duress}`);
        console.log(`   📊 Bio params: type=${type}, majorVer=${majorVer}, minorVer=${minorVer}, format=${format}`);
        console.log(`   📝 Template: ${template ? `${template.length} chars, starts with: ${template.substring(0, 20)}...` : 'undefined'}`);
        
        // Validate required fields
        if (!pin || !type || !template) {
            console.log(`⚠️ Validation failed: pin=${pin}, type=${type}, template=${template ? 'present' : 'missing'}`);
            return { success: false, error: 'Missing required fields: pin, type, or template' };
        }

        // Validate template data
        if (!template || template.length === 0) {
            console.log(`⚠️ Skipping BIODATA template for PIN ${pin}, Type ${type} - empty template data`);
            return { success: false, error: 'Empty template data' };
        }

        // Basic base64 validation for BIODATA templates
        try {
            const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
            if (!base64Regex.test(template)) {
                console.log(`⚠️ Skipping BIODATA template for PIN ${pin}, Type ${type} - invalid base64 format`);
                return { success: false, error: 'Invalid base64 template format' };
            }
        } catch (error) {
            console.log(`⚠️ Template validation error for PIN ${pin}, Type ${type}:`, error.message);
            return { success: false, error: 'Template validation failed' };
        }

        // Build command according to exact protocol specification:
        // C:${CmdID}:DATA UPDATE BIODATA Pin=${XXX}${HT}No=${XXX}${HT}Index=${XXX}${HT}Valid=${XXX}${HT}Duress=${XXX}${HT}Type=${XXX}${HT}MajorVer=${XXX}${HT}MinorVer=${XXX}${HT}Format=${XXX}${HT}Tmp=${XXX}
        const TAB = '\t';
        const commandData = `DATA UPDATE BIODATA Pin=${pin}${TAB}No=${no}${TAB}Index=${index}${TAB}Valid=${valid}${TAB}Duress=${duress}${TAB}Type=${type}${TAB}MajorVer=${majorVer}${TAB}MinorVer=${minorVer}${TAB}Format=${format}${TAB}Tmp=${template}`;
        
        console.log(`🚀 Generated BIODATA command (first 200 chars): ${commandData.substring(0, 200)}...`);
        console.log(`🔍 Tab character verification: ${commandData.includes('\t') ? 'TABS PRESENT' : 'NO TABS FOUND'}`);
        
        return await this.addCommand(deviceSerial, 'DATA', commandData);
    }

    async deleteBioTemplate(deviceSerial, pin, type = null, no = null) {
        let commandData = `DATA DELETE BIODATA Pin=${pin}`;
        if (type !== null) {
            commandData += `\tType=${type}`;
            if (no !== null) {
                commandData += `\tNo=${no}`;
            }
        }
        
        return await this.addCommand(deviceSerial, 'DATA', commandData);
    }

    async queryBioTemplate(deviceSerial, type, pin = null, no = null) {
        let commandData = `DATA QUERY BIODATA Type=${type}`;
        if (pin !== null) {
            commandData += `\tPIN=${pin}`;
            if (no !== null) {
                commandData += `\tNo=${no}`;
            }
        }
        
        return await this.addCommand(deviceSerial, 'DATA', commandData);
    }

    // User photo commands
    async addUserPhoto(deviceSerial, photoInfo) {
        const { pin, size, content } = photoInfo;
        const commandData = `DATA UPDATE USERPIC PIN=${pin}\tSize=${size}\tContent=${content}`;
        
        return await this.addCommand(deviceSerial, 'DATA', commandData);
    }

    async deleteUserPhoto(deviceSerial, pin) {
        const commandData = `DATA DELETE USERPIC PIN=${pin}`;
        return await this.addCommand(deviceSerial, 'DATA', commandData);
    }

    // Comparison photo commands
    async addComparisonPhoto(deviceSerial, photoInfo) {
        const { pin, type, size, content, format = 0, url = '', postBackTmpFlag = 0 } = photoInfo;
        
        let commandData = `DATA UPDATE BIOPHOTO PIN=${pin}\tType=${type}\tSize=${size}\tContent=${content}\tFormat=${format}`;
        if (url) commandData += `\tUrl=${url}`;
        if (postBackTmpFlag) commandData += `\tPostBackTmpFlag=${postBackTmpFlag}`;
        
        return await this.addCommand(deviceSerial, 'DATA', commandData);
    }

    async deleteComparisonPhoto(deviceSerial, pin) {
        const commandData = `DATA DELETE BIOPHOTO PIN=${pin}`;
        return await this.addCommand(deviceSerial, 'DATA', commandData);
    }

    // Work code commands
    async addWorkCode(deviceSerial, workCodeInfo) {
        const { pin, code, name } = workCodeInfo;
        const commandData = `DATA UPDATE WORKCODE PIN=${pin}\tCODE=${code}\tNAME=${name}`;
        
        return await this.addCommand(deviceSerial, 'DATA', commandData);
    }

    async deleteWorkCode(deviceSerial, code) {
        const commandData = `DATA DELETE WORKCODE CODE=${code}`;
        return await this.addCommand(deviceSerial, 'DATA', commandData);
    }

    // Control commands
    async rebootDevice(deviceSerial) {
        return await this.addCommand(deviceSerial, 'CONTROL', 'REBOOT');
    }

    async unlockDoor(deviceSerial) {
        return await this.addCommand(deviceSerial, 'CONTROL', 'AC_UNLOCK');
    }

    async cancelAlarm(deviceSerial) {
        return await this.addCommand(deviceSerial, 'CONTROL', 'AC_UNALARM');
    }

    // Clear commands
    async clearAllData(deviceSerial) {
        return await this.addCommand(deviceSerial, 'CLEAR', 'CLEAR DATA');
    }

    async clearBioData(deviceSerial) {
        return await this.addCommand(deviceSerial, 'CLEAR', 'CLEAR BIODATA');
    }

    // Configuration commands
    async setOption(deviceSerial, key, value) {
        const commandData = `SET OPTION ${key}=${value}`;
        return await this.addCommand(deviceSerial, 'CONFIG', commandData);
    }

    async reloadOptions(deviceSerial) {
        return await this.addCommand(deviceSerial, 'CONFIG', 'RELOAD OPTIONS');
    }

    async getDeviceInfo(deviceSerial) {
        return await this.addCommand(deviceSerial, 'INFO', 'INFO');
    }

    // Remote enrollment commands
    async enrollFingerprint(deviceSerial, enrollInfo) {
        const { pin, fid, retry = 3, overwrite = 1 } = enrollInfo;
        const commandData = `ENROLL_FP PIN=${pin}\tFID=${fid}\tRETRY=${retry}\tOVERWRITE=${overwrite}`;
        
        return await this.addCommand(deviceSerial, 'ENROLL', commandData);
    }

    async enrollBio(deviceSerial, enrollInfo) {
        const { type, pin, cardNo = '', retry = 3, overwrite = 1 } = enrollInfo;
        const commandData = `ENROLL_BIO TYPE=${type}\tPIN=${pin}\tCardNo=${cardNo}\tRETRY=${retry}\tOVERWRITE=${overwrite}`;
        
        return await this.addCommand(deviceSerial, 'ENROLL', commandData);
    }

    // Get command history
    async getCommandHistory(deviceSerial, limit = 50) {
        try {
            return await this.db.all(`
                SELECT * FROM commands 
                WHERE device_serial = ? 
                ORDER BY created_at DESC 
                LIMIT ?
            `, [deviceSerial, limit]);
        } catch (error) {
            console.error('Error getting command history:', error);
            return [];
        }
    }

    // Get pending commands count
    async getPendingCommandsCount(deviceSerial) {
        try {
            const result = await this.db.get(
                'SELECT COUNT(*) as count FROM commands WHERE device_serial = ? AND status = ?',
                [deviceSerial, 'pending']
            );
            return result ? result.count : 0;
        } catch (error) {
            console.error('Error getting pending commands count:', error);
            return 0;
        }
    }

    // Finger vein template commands
    async addFingerVeinTemplate(deviceSerial, templateInfo) {
        const { pin, fid, index, size, valid = 1, template } = templateInfo;
        const commandData = `DATA UPDATE FVEIN Pin=${pin}\tFID=${fid}\tIndex=${index}\tSize=${size}\tValid=${valid}\tTmp=${template}`;
        
        return await this.addCommand(deviceSerial, 'DATA', commandData);
    }

    async deleteFingerVeinTemplate(deviceSerial, pin, fid = null) {
        let commandData;
        if (fid !== null) {
            commandData = `DATA DELETE FVEIN Pin=${pin}\tFID=${fid}`;
        } else {
            commandData = `DATA DELETE FVEIN Pin=${pin}`;
        }
        
        return await this.addCommand(deviceSerial, 'DATA', commandData);
    }

    // Short message commands
    async addShortMessage(deviceSerial, messageInfo) {
        const { uid, msg, tag, minDuration = 0, startTime = '' } = messageInfo;
        const commandData = `DATA UPDATE SMS MSG=${msg}\tTAG=${tag}\tUID=${uid}\tMIN=${minDuration}\tStartTime=${startTime}`;
        
        return await this.addCommand(deviceSerial, 'DATA', commandData);
    }

    async deleteShortMessage(deviceSerial, uid) {
        const commandData = `DATA DELETE SMS UID=${uid}`;
        return await this.addCommand(deviceSerial, 'DATA', commandData);
    }

    // User SMS association commands
    async addUserSMSAssociation(deviceSerial, associationInfo) {
        const { pin, uid } = associationInfo;
        const commandData = `DATA UPDATE USER_SMS PIN=${pin}\tUID=${uid}`;
        
        return await this.addCommand(deviceSerial, 'DATA', commandData);
    }

    // ID Card commands
    async addIdCard(deviceSerial, cardInfo) {
        const { 
            pin = '', snNum = '', idNum, dnNum = '', name = '', gender = 0, 
            nation = 0, birthday = '', validInfo = '', address = '', 
            additionalInfo = '', issuer = '', photo = '', fpTemplate1 = '', 
            fpTemplate2 = '', reserve = '', notice = '' 
        } = cardInfo;
        
        const commandData = `DATA UPDATE IDCARD PIN=${pin}\tSNNum=${snNum}\tIDNum=${idNum}\tDNNum=${dnNum}\tName=${name}\tGender=${gender}\tNation=${nation}\tBirthday=${birthday}\tValidInfo=${validInfo}\tAddress=${address}\tAdditionalInfo=${additionalInfo}\tIssuer=${issuer}\tPhoto=${photo}\tFPTemplate1=${fpTemplate1}\tFPTemplate2=${fpTemplate2}\tReserve=${reserve}\tNotice=${notice}`;
        
        return await this.addCommand(deviceSerial, 'DATA', commandData);
    }

    // Check commands
    async checkDataUpdate(deviceSerial) {
        return await this.addCommand(deviceSerial, 'CHECK', 'CHECK');
    }

    async checkAndTransmitNewData(deviceSerial) {
        return await this.addCommand(deviceSerial, 'LOG', 'LOG');
    }

    async verifyAttendanceData(deviceSerial, startTime, endTime) {
        const commandData = `VERIFY SUM ATTLOG StartTime=${startTime}\tEndTime=${endTime}`;
        return await this.addCommand(deviceSerial, 'VERIFY', commandData);
    }

    // File operations
    async getFileFromDevice(deviceSerial, filePath) {
        const commandData = `GetFile ${filePath}`;
        return await this.addCommand(deviceSerial, 'FILE', commandData);
    }

    async sendFileToDevice(deviceSerial, url, filePath, action = null, tableName = null, recordCount = null) {
        let commandData = `PutFile ${url}\t${filePath}`;
        
        if (action) {
            commandData += `\tAction=${action}`;
            if (tableName) commandData += `\tTableName=${tableName}`;
            if (recordCount) commandData += `\tRecordCount=${recordCount}`;
        }
        
        return await this.addCommand(deviceSerial, 'FILE', commandData);
    }

    // System commands
    async executeShellCommand(deviceSerial, command) {
        const commandData = `SHELL ${command}`;
        return await this.addCommand(deviceSerial, 'SYSTEM', commandData);
    }

    async upgradeDevice(deviceSerial, upgradeInfo) {
        const { type = null, checksum, size, url } = upgradeInfo;
        
        let commandData;
        if (type) {
            commandData = `UPGRADE type=${type},checksum=${checksum},size=${size},url=${url}`;
        } else {
            commandData = `UPGRADE checksum=${checksum},url=${url},size=${size}`;
        }
        
        return await this.addCommand(deviceSerial, 'UPGRADE', commandData);
    }

    // Utility method for enrollment commands
    async enrollCard(deviceSerial, enrollInfo) {
        const { pin, retry = 3 } = enrollInfo;
        const commandData = `ENROLL_MF PIN=${pin}\tRETRY=${retry}`;
        
        return await this.addCommand(deviceSerial, 'ENROLL', commandData);
    }

    // Background verification  
    async backgroundVerification(deviceSerial, verifyData) {
        const commandData = `PostVerifyData ${verifyData}`;
        return await this.addCommand(deviceSerial, 'VERIFY', commandData);
    }

    // Query commands for attendance and photos
    async queryAttendanceLog(deviceSerial, startTime, endTime) {
        const commandData = `DATA QUERY ATTLOG StartTime=${startTime}\tEndTime=${endTime}`;
        return await this.addCommand(deviceSerial, 'DATA', commandData);
    }

    async queryAttendancePhoto(deviceSerial, startTime, endTime) {
        const commandData = `DATA QUERY ATTPHOTO StartTime=${startTime}\tEndTime=${endTime}`;
        return await this.addCommand(deviceSerial, 'DATA', commandData);
    }
}

module.exports = CommandManager; 
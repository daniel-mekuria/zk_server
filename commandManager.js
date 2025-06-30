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
                await this.handleEnrollCommandResult(deviceSerial, reply);
                break;
            default:
                console.log(`Unhandled command result: ${reply.CMD}`);
        }
    }

    async handleDataCommandResult(deviceSerial, reply) {
        // Handle DATA command results
        if (reply.Return === '0') {
            console.log(`Data command successful for device ${deviceSerial}`);
        } else {
            console.log(`Data command failed for device ${deviceSerial}, return code: ${reply.Return}`);
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
        
        const commandData = `DATA UPDATE USERINFO PIN=${pin}\tName=${name}\tPri=${privilege}\tPasswd=${password}\tCard=${card}\tGrp=${groupId}\tTZ=${timeZone}\tVerify=${verifyMode}\tViceCard=${viceCard}`;
        
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
    async addFingerprintTemplate(deviceSerial, templateInfo) {
        const { pin, fid, size, valid = 1, template } = templateInfo;
        const commandData = `DATA UPDATE FINGERTMP PIN=${pin}\tFID=${fid}\tSize=${size}\tValid=${valid}\tTMP=${template}`;
        
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
        const commandData = `DATA UPDATE FACE PIN=${pin}\tFID=${fid}\tValid=${valid}\tSize=${size}\tTMP=${template}`;
        
        return await this.addCommand(deviceSerial, 'DATA', commandData);
    }

    async deleteFaceTemplate(deviceSerial, pin) {
        const commandData = `DATA DELETE FACE PIN=${pin}`;
        return await this.addCommand(deviceSerial, 'DATA', commandData);
    }

    // Unified bio template commands
    async addBioTemplate(deviceSerial, templateInfo) {
        const { 
            pin, 
            no = 0, 
            index = 0, 
            valid = 1, 
            duress = 0, 
            type, 
            majorVer, 
            minorVer, 
            format = 0, 
            template 
        } = templateInfo;
        
        const commandData = `DATA UPDATE BIODATA Pin=${pin}\tNo=${no}\tIndex=${index}\tValid=${valid}\tDuress=${duress}\tType=${type}\tMajorVer=${majorVer}\tMinorVer=${minorVer}\tFormat=${format}\tTmp=${template}`;
        
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
}

module.exports = CommandManager; 
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

            console.log('Command added for device ' + deviceSerial + ': ' + commandType);
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
            
            console.log('Sending command to ' + deviceSerial + ': ' + formattedCommand);
            return formattedCommand;
        } catch (error) {
            console.error('Error getting next command:', error);
            return null;
        }
    }

    formatCommand(command) {
        // Validate and fix tab formatting before sending
        const correctedCommandData = this.validateAndFixTabs(command.command_data);
        
        // Format: C:${CmdID}:${CmdDesc} ${CmdData}
        return 'C:' + command.command_id + ':' + correctedCommandData;
    }

    validateAndFixTabs(commandData) {
        // Check if this is a command that requires tab separation
        if (!commandData || typeof commandData !== 'string') {
            return commandData;
        }

        // Commands that should have tab-separated parameters
        const tabCommands = [
            'DATA UPDATE BIODATA',
            'DATA UPDATE USERPIC', 
            'DATA UPDATE BIOPHOTO',
            'DATA UPDATE WORKCODE',
            'DATA UPDATE FVEIN',
            'DATA UPDATE SMS',
            'DATA UPDATE USER_SMS',
            'DATA UPDATE IDCARD',
            'DATA DELETE FINGERTMP',
            'DATA QUERY FINGERTMP',
            'ENROLL_FP',
            'ENROLL_BIO',
            'ENROLL_MF',
            'VERIFY SUM ATTLOG',
            'DATA QUERY ATTLOG',
            'DATA QUERY ATTPHOTO',
            'PutFile'
        ];

        // Check if this command needs tab validation
        const needsTabValidation = tabCommands.some(cmd => commandData.startsWith(cmd));
        
        if (!needsTabValidation) {
            return commandData;
        }

        console.log('🔍 Validating tabs for command: ' + commandData.substring(0, 50) + '...');

        // Split by spaces and look for key=value patterns that should be tab-separated
        const parts = commandData.split(' ');
        if (parts.length < 2) {
            return commandData;
        }

        const commandPrefix = parts[0] + ' ' + parts[1] + (parts[2] ? ' ' + parts[2] : '');
        const remainingParts = parts.slice(parts[2] ? 3 : 2);

        // Special handling for BIODATA commands
        if (commandData.startsWith('DATA UPDATE BIODATA')) {
            return this.validateBiodataCommand(commandData);
        }

        // If we have parameters, ensure they're tab-separated
        if (remainingParts.length > 0) {
            const parametersString = remainingParts.join(' ');
            
            // Check if parameters contain = signs (key=value pairs)
            if (parametersString.includes('=')) {
                // Split by various possible separators and rejoin with tabs
                let correctedParams = parametersString
                    .replace(/\s+([A-Za-z_]+)=/g, '\t$1=')  // Replace space before key= with tab
                    .replace(/^([A-Za-z_]+)=/, '$1=');      // Ensure first param doesn't start with tab
                
                const correctedCommand = commandPrefix + ' ' + correctedParams;
                
                if (correctedCommand !== commandData) {
                    console.log('✅ Tab formatting corrected:');
                    console.log('   Original: ' + commandData);
                    console.log('   Corrected: ' + correctedCommand);
                }
                
                return correctedCommand;
            }
        }

        console.log('✅ Tab formatting verified - no changes needed');
        return commandData;
    }

    validateBiodataCommand(commandData) {
        console.log('🔧 Special BIODATA validation for: ' + commandData.substring(0, 100) + '...');
        
        // Split the command into prefix and parameters
        const commandPrefix = 'DATA UPDATE BIODATA ';
        if (!commandData.startsWith(commandPrefix)) {
            return commandData;
        }
        
        const paramsString = commandData.substring(commandPrefix.length);
        console.log('🔍 Raw parameters: ' + paramsString.substring(0, 200) + '...');
        
        // Use a more direct approach - split by all whitespace first, then extract values
        const params = {};
        
        // Extract each parameter individually using specific patterns
        const extractParam = (name, str) => {
            const pattern = new RegExp(name + '=([^\\s\\t]+)', 'i');
            const match = str.match(pattern);
            return match ? match[1] : null;
        };
        
        // Special handling for Tmp parameter (it's the last one and can contain anything)
        const extractTmp = (str) => {
            const tmpMatch = str.match(/Tmp=(.*)$/i);
            return tmpMatch ? tmpMatch[1] : null;
        };
        
        // Extract all parameters with improved regex patterns to handle missing tabs
        const extractParamImproved = (name, str) => {
            // Try normal pattern first
            let pattern = new RegExp(name + '=([^\\s\\t]+)', 'i');
            let match = str.match(pattern);
            if (match) return match[1];
            
            // Try pattern that handles concatenated parameters (like Index=13Valid=1)
            pattern = new RegExp(name + '=([^A-Za-z_=]+)(?=[A-Za-z_]+=|$)', 'i');
            match = str.match(pattern);
            return match ? match[1] : null;
        };
        
        // Extract all parameters
        params.Pin = extractParamImproved('Pin', paramsString);
        params.No = extractParamImproved('No', paramsString);
        params.Index = extractParamImproved('Index', paramsString);
        params.Valid = extractParamImproved('Valid', paramsString);
        params.Duress = extractParamImproved('Duress', paramsString);
        params.Type = extractParamImproved('Type', paramsString);
        params.MajorVer = extractParamImproved('MajorVer', paramsString);
        params.MinorVer = extractParamImproved('MinorVer', paramsString);
        params.Format = extractParamImproved('Format', paramsString);
        params.Tmp = extractTmp(paramsString);
        
        // Log what we found
        for (const [key, value] of Object.entries(params)) {
            if (value !== null) {
                const displayValue = value && value.length > 50 ? value.substring(0, 50) + '...' : value;
                console.log('📝 Found ' + key + '=' + displayValue);
            }
        }
        
        // Build the corrected command with proper tab separation
        const orderedParams = ['Pin', 'No', 'Index', 'Valid', 'Duress', 'Type', 'MajorVer', 'MinorVer', 'Format', 'Tmp'];
        const rebuiltParams = orderedParams
            .filter(param => params[param] !== null && params[param] !== undefined)
            .map(param => param + '=' + params[param])
            .join('\t');
        
        const correctedCommand = commandPrefix + rebuiltParams;
        
        // Always rebuild to ensure proper tab formatting
        // BIODATA should have exactly 9 tabs between 10 parameters
        const tabCount = (commandData.match(/\t/g) || []).length;
        const expectedTabs = 9;
        const hasProperTabs = commandData.includes('\t') && tabCount === expectedTabs;
        
        // Always return the corrected command to ensure consistent tab formatting
        // This prevents issues where tabs might be missing between specific parameters
        console.log('🔧 BIODATA command validation:');
        console.log('   Original length: ' + commandData.length);
        console.log('   Corrected length: ' + correctedCommand.length);
        console.log('   Tab count in original: ' + tabCount);
        console.log('   Tab count in corrected: ' + (correctedCommand.match(/\t/g) || []).length);
        console.log('   Expected tabs: ' + expectedTabs);
        console.log('   Has proper tabs: ' + (hasProperTabs ? 'YES' : 'NO'));
        
        if (!hasProperTabs || correctedCommand !== commandData) {
            console.log('   ✅ Returning corrected command with proper tab formatting');
        } else {
            console.log('   ✅ Command already has proper formatting, but returning rebuilt version for consistency');
        }
        
        return correctedCommand;
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

                console.log('Command reply processed: ' + reply.ID + ' -> Return: ' + reply.Return);
                
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
        // Normalize command type to handle any whitespace issues
        const cmdType = reply.CMD ? reply.CMD.trim().toUpperCase() : '';
        console.log('🔍 Processing command result: CMD="' + cmdType + '" (original: "' + reply.CMD + '"), Return: ' + reply.Return);
        
        switch (cmdType) {
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
                console.log('🔧 Control command ' + cmdType + ' result for device ' + deviceSerial + ': ' + (reply.Return === '0' ? 'Success' : 'Failed'));
                break;
            case 'CHECK':
            case 'LOG':
            case 'VERIFY':
                console.log('📊 Check command ' + cmdType + ' result for device ' + deviceSerial + ': ' + (reply.Return === '0' ? 'Success' : 'Failed'));
                break;
            case 'INFO':
                console.log('ℹ️ Info command result for device ' + deviceSerial + ': ' + (reply.Return === '0' ? 'Success' : 'Failed'));
                break;
            default:
                console.log('❓ Unhandled command result: "' + cmdType + '" (original: "' + reply.CMD + '") for device ' + deviceSerial + ', Return: ' + reply.Return);
        }
    }

    async handleDataCommandResult(deviceSerial, reply) {
        // Handle DATA command results
        if (reply.Return === '0') {
            console.log('✅ Data command successful for device ' + deviceSerial);
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
            
            console.log('❌ Data command failed for device ' + deviceSerial + ', error code: ' + errorCode + ' (' + errorDescription + ')');
            
            // Special handling for template-related errors
            if (errorCode === '-11' || errorCode === '-12') {
                console.log('🔧 Template format issue detected. This may be due to algorithm version mismatch or corrupted template data.');
                
                // Check if this is actually a USERPIC command failing with wrong error code
                if (reply.CMD === 'DATA' && reply.ID) {
                    // Try to get the command from pending commands to see what type it was
                    const pendingCmd = await this.db.get(
                        'SELECT command_data FROM commands WHERE command_id = ?',
                        [reply.ID]
                    );
                    
                    if (pendingCmd && pendingCmd.command_data.includes('USERPIC')) {
                        console.log('🚨 IMPORTANT: Device returned fingerprint error (-12) for a USERPIC command!');
                        console.log('   This suggests the device may not support USERPIC or has a firmware issue.');
                        console.log('   Command was: ' + pendingCmd.command_data.substring(0, 100) + '...');
                    }
                }
            }
        }
    }

    async handleClearCommandResult(deviceSerial, reply) {
        // Handle CLEAR command results
        if (reply.Return === '0') {
            console.log('Clear command successful for device ' + deviceSerial);
        } else {
            console.log('Clear command failed for device ' + deviceSerial + ', return code: ' + reply.Return);
        }
    }

    async handleEnrollCommandResult(deviceSerial, reply) {
        // Handle enrollment command results
        if (reply.Return === '0') {
            console.log('Enrollment successful for device ' + deviceSerial);
        } else {
            console.log('Enrollment failed for device ' + deviceSerial + ', return code: ' + reply.Return);
        }
    }

    // Unified biometric template management
    async addUnifiedBiometricTemplate(deviceSerial, templateInfo) {
        const { pin, biometricType, fid = 0, template, valid = 1, index = 0 } = templateInfo;
        
        // Enhanced validation using the new validation method
        const validation = this.validateBiometricTemplate(templateInfo, biometricType);
        if (!validation.valid) {
            console.log(`⚠️ Biometric template validation failed for PIN ${pin}: ${validation.error}`);
            return { success: false, error: validation.error };
        }

        // Map biometric types to BIODATA Type values according to protocol
        const typeMapping = {
            'fingerprint': 1,
            'face': 2,
            'voiceprint': 3,
            'iris': 4,
            'retina': 5,
            'palmprint': 6,
            'fingervein': 7,
            'palm': 8,
            'visible_light_face': 9
        };

        const biodataType = typeMapping[biometricType.toLowerCase()];
        if (!biodataType) {
            console.log('⚠️ Unknown biometric type: ' + biometricType);
            return { success: false, error: 'Unknown biometric type' };
        }

        console.log(`🔧 Adding unified biometric template: PIN=${pin}, Type=${biodataType} (${biometricType}), FID=${fid}`);

        // Use BIODATA format for all biometric types
        return await this.addBiodataTemplate(deviceSerial, {
            pin,
            no: fid,  // Use FID as the biometric number
            index,
            valid,
            duress: 0,
            type: biodataType,
            majorVer: 0,
            minorVer: 0,
            format: 'ZK',
            template
        });
    }

    // User management commands
    async addUser(deviceSerial, userInfo) {
        const { pin, name, privilege = 0, password = '', card = '', groupId = 1, timeZone = '0000000000000000', verifyMode = -1, viceCard = '' } = userInfo;
        
        const TAB = '\t';
        const commandData = 'DATA UPDATE USERINFO PIN=' + pin + TAB + 'Name=' + name + TAB + 'Pri=' + privilege + TAB + 'Passwd=' + password + TAB + 'Card=' + card + TAB + 'Grp=' + groupId + TAB + 'TZ=' + timeZone + TAB + 'Verify=' + verifyMode + TAB + 'ViceCard=' + viceCard;
        
        return await this.addCommand(deviceSerial, 'DATA', commandData);
    }

    async deleteUser(deviceSerial, pin) {
        const commandData = 'DATA DELETE USERINFO PIN=' + pin;
        return await this.addCommand(deviceSerial, 'DATA', commandData);
    }

    async queryUser(deviceSerial, pin) {
        const commandData = 'DATA QUERY USERINFO PIN=' + pin;
        return await this.addCommand(deviceSerial, 'DATA', commandData);
    }

    // Fingerprint template commands
    async addFingerprintTemplate(deviceSerial, fpData) {
        const { PIN: pin, FID: fid, Size: size, Valid: valid, TMP: template } = fpData;
        
        // Validate template data to prevent -12 errors
        if (!template || template.length === 0) {
            console.log('⚠️ Skipping fingerprint template for PIN ' + pin + ', FID ' + fid + ' - empty template data');
            return { success: false, error: 'Empty template data' };
        }

        // Basic base64 validation
        try {
            const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
            if (!base64Regex.test(template)) {
                console.log('⚠️ Skipping fingerprint template for PIN ' + pin + ', FID ' + fid + ' - invalid base64 format');
                return { success: false, error: 'Invalid base64 format' };
            }
        } catch (error) {
            console.log('⚠️ Skipping fingerprint template for PIN ' + pin + ', FID ' + fid + ' - validation error:', error.message);
            return { success: false, error: 'Validation failed' };
        }

        console.log(`🔄 Converting fingerprint template to unified BIODATA format: PIN=${pin}, FID=${fid}`);
        
        // Use unified approach instead of legacy FINGERTMP format
        return await this.addUnifiedBiometricTemplate(deviceSerial, {
            pin,
            biometricType: 'fingerprint',
            fid: parseInt(fid),
            template,
            valid: parseInt(valid) || 1
        });
    }

    async deleteFingerprintTemplate(deviceSerial, pin, fid = null) {
        console.log(`🔄 Converting fingerprint delete to unified BIODATA format: PIN=${pin}, FID=${fid}`);
        
        // Use unified BIODATA delete format instead of legacy FINGERTMP
        return await this.deleteBioTemplate(deviceSerial, pin, 1, fid); // Type 1 = fingerprint
    }

    async queryFingerprintTemplate(deviceSerial, pin, fingerId = null) {
        console.log(`🔄 Converting fingerprint query to unified BIODATA format: PIN=${pin}, FID=${fingerId}`);
        
        // Use unified BIODATA query format instead of legacy FINGERTMP
        return await this.queryBioTemplate(deviceSerial, 1, pin, fingerId); // Type 1 = fingerprint
    }

    // Enhanced face template method that uses unified approach
    async addFaceTemplate(deviceSerial, templateInfo) {
        const { pin, fid, size, valid = 1, template } = templateInfo;
        
        // Validate template data
        if (!template || template.length === 0) {
            console.log('⚠️ Skipping face template for PIN ' + pin + ', FID ' + fid + ' - empty template data');
            return { success: false, error: 'Empty template data' };
        }

        console.log(`🔄 Converting face template to unified BIODATA format: PIN=${pin}, FID=${fid}`);
        
        // Use unified approach instead of legacy FACE format
        return await this.addUnifiedBiometricTemplate(deviceSerial, {
            pin,
            biometricType: 'face',
            fid: parseInt(fid) || 0,
            template,
            valid: parseInt(valid) || 1
        });
    }

    async deleteFaceTemplate(deviceSerial, pin, fid = null) {
        console.log(`🔄 Converting face delete to unified BIODATA format: PIN=${pin}, FID=${fid}`);
        
        // Use unified BIODATA delete format instead of legacy FACE
        return await this.deleteBioTemplate(deviceSerial, pin, 2, fid); // Type 2 = face
    }

    // Unified bio template commands (BIODATA format)
    async addBiodataTemplate(deviceSerial, templateInfo) {
        console.log('templateInfo**********************************************',templateInfo)
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
        
        console.log('🔧 BIODATA COMMAND DEBUG for device ' + deviceSerial + ':');
        console.log('   📋 Input params: pin=' + pin + ', no=' + no + ', index=' + index + ', valid=' + valid + ', duress=' + duress);
        console.log('   📊 Bio params: type=' + type + ', majorVer=' + majorVer + ', minorVer=' + minorVer + ', format=' + format);
        console.log('   📝 Template: ' + (template ? (template.length + ' chars, starts with: ' + template.substring(0, 20) + '...') : 'undefined'));
        
        // Validate required fields
        if (!pin || !type || !template) {
            console.log('⚠️ Validation failed: pin=' + pin + ', type=' + type + ', template=' + (template ? 'present' : 'missing'));
            return { success: false, error: 'Missing required fields: pin, type, or template' };
        }

        // Validate template data
        if (!template || template.length === 0) {
            console.log('⚠️ Skipping BIODATA template for PIN ' + pin + ', Type ' + type + ' - empty template data');
            return { success: false, error: 'Empty template data' };
        }

        // Basic base64 validation for BIODATA templates
        try {
            const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
            if (!base64Regex.test(template)) {
                console.log('⚠️ Skipping BIODATA template for PIN ' + pin + ', Type ' + type + ' - invalid base64 format');
                return { success: false, error: 'Invalid base64 template format' };
            }
        } catch (error) {
            console.log('⚠️ Template validation error for PIN ' + pin + ', Type ' + type + ':', error.message);
            return { success: false, error: 'Template validation failed' };
        }

        // Build command according to exact protocol specification:
        // C:${CmdID}:DATA UPDATE BIODATA Pin=${XXX}${HT}No=${XXX}${HT}Index=${XXX}${HT}Valid=${XXX}${HT}Duress=${XXX}${HT}Type=${XXX}${HT}MajorVer=${XXX}${HT}MinorVer=${XXX}${HT}Format=${XXX}${HT}Tmp=${XXX}
        const commandData = 'DATA UPDATE BIODATA Pin=' + pin + '\tNo=' + no + '\tIndex=' + index + '\tValid=' + valid + '\tDuress=' + duress + '\tType=' + type + '\tMajorVer=' + majorVer + '\tMinorVer=' + minorVer + '\tFormat=' + format + '\tTmp=' + template;
        
        console.log('🚀 Generated BIODATA command (first 200 chars): ' + commandData.substring(0, 200) + '...');
        console.log('🔍 Tab character verification: ' + (commandData.includes('\t') ? 'TABS PRESENT' : 'NO TABS FOUND'));
        
        return await this.addCommand(deviceSerial, 'DATA', commandData);
    }

    async deleteBioTemplate(deviceSerial, pin, type = null, no = null) {
        let commandData = 'DATA DELETE BIODATA Pin=' + pin;
        if (type !== null) {
            commandData += '\tType=' + type;
            if (no !== null) {
                commandData += '\tNo=' + no;
            }
        }
        
        return await this.addCommand(deviceSerial, 'DATA', commandData);
    }

    async queryBioTemplate(deviceSerial, type, pin = null, no = null) {
        let commandData = 'DATA QUERY BIODATA Type=' + type;
        if (pin !== null) {
            commandData += '\tPIN=' + pin;
            if (no !== null) {
                commandData += '\tNo=' + no;
            }
        }
        
        return await this.addCommand(deviceSerial, 'DATA', commandData);
    }

    // User photo commands
    async addUserPhoto(deviceSerial, photoInfo) {
        const { pin, size, content } = photoInfo;
        
        console.log(`🚫 USERPIC command disabled for PIN ${pin} - biometric data sync only`);
        return { success: false, error: 'USERPIC commands disabled - using biometric data only' };
    }

    async deleteUserPhoto(deviceSerial, pin) {
        const commandData = 'DATA DELETE USERPIC PIN=' + pin;
        return await this.addCommand(deviceSerial, 'DATA', commandData);
    }

    // Comparison photo commands
    async addComparisonPhoto(deviceSerial, photoInfo) {
        const { pin } = photoInfo;
        
        console.log(`🚫 BIOPHOTO command disabled for PIN ${pin} - biometric data sync only`);
        return { success: false, error: 'BIOPHOTO commands disabled - using biometric data only' };
    }

    async deleteComparisonPhoto(deviceSerial, pin) {
        const commandData = 'DATA DELETE BIOPHOTO PIN=' + pin;
        return await this.addCommand(deviceSerial, 'DATA', commandData);
    }

    // Work code commands
    async addWorkCode(deviceSerial, workCodeInfo) {
        const { pin, code, name } = workCodeInfo;
        const commandData = 'DATA UPDATE WORKCODE PIN=' + pin + '\tCODE=' + code + '\tNAME=' + name;
        
        return await this.addCommand(deviceSerial, 'DATA', commandData);
    }

    async deleteWorkCode(deviceSerial, code) {
        const commandData = 'DATA DELETE WORKCODE CODE=' + code;
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

    // Time synchronization commands
    async syncDeviceTime(deviceSerial) {
        const results = [];
        
        try {
            console.log(`🕐 Synchronizing time for device ${deviceSerial}`);
            
            // The ZKTeco protocol automatically syncs time via Date headers in HTTP responses
            // and TimeZone setting in initialization. However, we can also send explicit commands
            // to ensure proper synchronization.
            
            // 1. Send a time zone configuration
            const serverTimezoneOffset = Math.round(-new Date().getTimezoneOffset() / 60);
            const timezoneResult = await this.setOption(deviceSerial, 'TimeZone', serverTimezoneOffset);
            results.push({ type: 'TimeZone', success: timezoneResult.success, result: timezoneResult });
            
            // 2. Send current date and time in UTC format (to match Date header)
            // The Date header is the primary sync mechanism and is always in GMT/UTC
            const now = new Date();
            const utcDateTimeString = now.getUTCFullYear() + '-' + 
                                     String(now.getUTCMonth() + 1).padStart(2, '0') + '-' +
                                     String(now.getUTCDate()).padStart(2, '0') + ' ' +
                                     String(now.getUTCHours()).padStart(2, '0') + ':' +
                                     String(now.getUTCMinutes()).padStart(2, '0') + ':' +
                                     String(now.getUTCSeconds()).padStart(2, '0');
            
            const datetimeResult = await this.setOption(deviceSerial, 'DateTime', utcDateTimeString);
            results.push({ type: 'DateTime', success: datetimeResult.success, result: datetimeResult });
            
            // 3. Reload options to apply changes
            const reloadResult = await this.reloadOptions(deviceSerial);
            results.push({ type: 'ReloadOptions', success: reloadResult.success, result: reloadResult });
            
            const successCount = results.filter(r => r.success).length;
            
            // Show both UTC and local time for clarity
            const localDateTimeString = now.getFullYear() + '-' + 
                                       String(now.getMonth() + 1).padStart(2, '0') + '-' +
                                       String(now.getDate()).padStart(2, '0') + ' ' +
                                       String(now.getHours()).padStart(2, '0') + ':' +
                                       String(now.getMinutes()).padStart(2, '0') + ':' +
                                       String(now.getSeconds()).padStart(2, '0');
            
            console.log(`🕐 Time synchronization for device ${deviceSerial}: ${successCount}/${results.length} commands queued successfully`);
            console.log(`   📅 Server UTC DateTime: ${utcDateTimeString} (sent to device)`);
            console.log(`   📅 Server Local DateTime: ${localDateTimeString} (GMT${serverTimezoneOffset >= 0 ? '+' : ''}${serverTimezoneOffset})`);
            console.log(`   ℹ️  Device will use UTC time + TimeZone offset for display`);
            
            return {
                success: successCount > 0,
                syncCommands: successCount,
                totalCommands: results.length,
                timezone: serverTimezoneOffset,
                datetime: utcDateTimeString,
                localDatetime: localDateTimeString,
                results
            };
            
        } catch (error) {
            console.error(`❌ Error synchronizing time for device ${deviceSerial}:`, error);
            return { success: false, error: error.message, results };
        }
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

    // Enhanced finger vein template method that uses unified approach
    async addFingerVeinTemplate(deviceSerial, templateInfo) {
        console.log("Finger vein template info:", templateInfo);
        const { pin, fid, index, size, valid = 1, template } = templateInfo;
        
        // Validate template data
        if (!template || template.length === 0) {
            console.log('⚠️ Skipping finger vein template for PIN ' + pin + ', FID ' + fid + ' - empty template data');
            return { success: false, error: 'Empty template data' };
        }

        console.log(`🔄 Converting finger vein template to unified BIODATA format: PIN=${pin}, FID=${fid}, Index=${index}`);
        
        // Use unified approach with fingervein type
        return await this.addUnifiedBiometricTemplate(deviceSerial, {
            pin,
            biometricType: 'fingervein',
            fid: parseInt(fid) || 0,
            template,
            valid: parseInt(valid) || 1,
            index: parseInt(index) || 0
        });
    }

    async deleteFingerVeinTemplate(deviceSerial, pin, fid = null) {
        console.log(`🔄 Converting finger vein delete to unified BIODATA format: PIN=${pin}, FID=${fid}`);
        
        // Use unified BIODATA delete format instead of legacy FVEIN
        return await this.deleteBioTemplate(deviceSerial, pin, 7, fid); // Type 7 = finger vein
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

    // Enhanced method for adding multiple biometric templates for a single user
    async addUserWithBiometrics(deviceSerial, userInfo, biometrics = []) {
        const results = [];
        
        try {
            // First add the user
            console.log(`📝 Adding user ${userInfo.pin} with ${biometrics.length} biometric templates`);
            const userResult = await this.addUser(deviceSerial, userInfo);
            results.push({ type: 'USER', success: userResult.success, result: userResult });
            
            if (!userResult.success) {
                console.log(`❌ Failed to add user ${userInfo.pin}, skipping biometrics`);
                return { success: false, results, error: 'User creation failed' };
            }

            // Then add biometric templates using unified format
            for (let i = 0; i < biometrics.length; i++) {
                const biometric = biometrics[i];
                console.log(`🔧 Adding biometric ${i + 1}/${biometrics.length}: ${biometric.type} for user ${userInfo.pin}`);
                
                const bioResult = await this.addUnifiedBiometricTemplate(deviceSerial, {
                    pin: userInfo.pin,
                    biometricType: biometric.type,
                    fid: biometric.fid || i,
                    template: biometric.template,
                    valid: biometric.valid || 1,
                    index: biometric.index || 0
                });
                
                results.push({ 
                    type: biometric.type.toUpperCase(), 
                    fid: biometric.fid || i,
                    success: bioResult.success, 
                    result: bioResult 
                });
                
                if (!bioResult.success) {
                    console.log(`⚠️ Failed to add ${biometric.type} template for user ${userInfo.pin}: ${bioResult.error}`);
                }
            }

            const successCount = results.filter(r => r.success).length;
            const totalCount = results.length;
            
            console.log(`✅ User ${userInfo.pin} setup complete: ${successCount}/${totalCount} operations successful`);
            
            return {
                success: successCount > 0, // Success if at least user was created
                results,
                summary: `${successCount}/${totalCount} operations successful`,
                userCreated: userResult.success,
                biometricsAdded: results.filter(r => r.type !== 'USER' && r.success).length
            };
            
        } catch (error) {
            console.error(`Error adding user ${userInfo.pin} with biometrics:`, error);
            return { success: false, results, error: error.message };
        }
    }

    // Add missing query methods using unified format
    async queryFaceTemplate(deviceSerial, pin, fid = null) {
        console.log(`🔄 Converting face query to unified BIODATA format: PIN=${pin}, FID=${fid}`);
        
        // Use unified BIODATA query format
        return await this.queryBioTemplate(deviceSerial, 2, pin, fid); // Type 2 = face
    }

    async queryFingerVeinTemplate(deviceSerial, pin, fid = null) {
        console.log(`🔄 Converting finger vein query to unified BIODATA format: PIN=${pin}, FID=${fid}`);
        
        // Use unified BIODATA query format
        return await this.queryBioTemplate(deviceSerial, 7, pin, fid); // Type 7 = finger vein
    }

    // Enhanced unified delete method with better error handling
    async deleteUnifiedBiometricTemplate(deviceSerial, templateInfo) {
        const { pin, biometricType, fid = null } = templateInfo;
        
        // Map biometric types to BIODATA Type values
        const typeMapping = {
            'fingerprint': 1,
            'face': 2,
            'voiceprint': 3,
            'iris': 4,
            'retina': 5,
            'palmprint': 6,
            'fingervein': 7,
            'palm': 8,
            'visible_light_face': 9
        };

        const biodataType = typeMapping[biometricType.toLowerCase()];
        if (!biodataType) {
            console.log('⚠️ Unknown biometric type for delete: ' + biometricType);
            return { success: false, error: 'Unknown biometric type' };
        }

        console.log(`🗑️ Deleting unified biometric template: PIN=${pin}, Type=${biodataType} (${biometricType}), FID=${fid}`);
        
        return await this.deleteBioTemplate(deviceSerial, pin, biodataType, fid);
    }

    // Enhanced unified query method  
    async queryUnifiedBiometricTemplate(deviceSerial, templateInfo) {
        const { pin, biometricType, fid = null } = templateInfo;
        
        // Map biometric types to BIODATA Type values
        const typeMapping = {
            'fingerprint': 1,
            'face': 2,
            'voiceprint': 3,
            'iris': 4,
            'retina': 5,
            'palmprint': 6,
            'fingervein': 7,
            'palm': 8,
            'visible_light_face': 9
        };

        const biodataType = typeMapping[biometricType.toLowerCase()];
        if (!biodataType) {
            console.log('⚠️ Unknown biometric type for query: ' + biometricType);
            return { success: false, error: 'Unknown biometric type' };
        }

        console.log(`🔍 Querying unified biometric template: PIN=${pin}, Type=${biodataType} (${biometricType}), FID=${fid}`);
        
        return await this.queryBioTemplate(deviceSerial, biodataType, pin, fid);
    }

    // Protocol compatibility helper - detects device capability and falls back if needed
    async addBiometricWithFallback(deviceSerial, templateInfo) {
        try {
            // First try unified BIODATA format
            console.log(`🔧 Attempting unified BIODATA format for device ${deviceSerial}`);
            const result = await this.addUnifiedBiometricTemplate(deviceSerial, templateInfo);
            
            if (result.success) {
                console.log(`✅ Unified BIODATA format successful for device ${deviceSerial}`);
                return result;
            }
            
            // If BIODATA failed, log but don't fallback automatically
            // Device should support BIODATA format for consistency
            console.log(`❌ Unified BIODATA format failed for device ${deviceSerial}: ${result.error}`);
            return result;
            
        } catch (error) {
            console.error(`Error in unified biometric template for device ${deviceSerial}:`, error);
            return { success: false, error: error.message };
        }
    }

    // Bulk operations for multiple users with biometric data
    async addMultipleUsersWithBiometrics(deviceSerial, usersData) {
        const allResults = [];
        
        try {
            console.log(`📝 Bulk adding ${usersData.length} users with biometric data to device ${deviceSerial}`);
            
            for (let i = 0; i < usersData.length; i++) {
                const userData = usersData[i];
                const { userInfo, biometrics = [] } = userData;
                
                console.log(`👤 Processing user ${i + 1}/${usersData.length}: PIN=${userInfo.pin}`);
                
                const result = await this.addUserWithBiometrics(deviceSerial, userInfo, biometrics);
                allResults.push({
                    pin: userInfo.pin,
                    success: result.success,
                    summary: result.summary,
                    results: result.results
                });
                
                // Small delay between users to prevent overwhelming the device
                if (i < usersData.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }

            const successfulUsers = allResults.filter(r => r.success).length;
            const totalUsers = allResults.length;
            
            console.log(`✅ Bulk operation complete: ${successfulUsers}/${totalUsers} users processed successfully`);
            
            return {
                success: successfulUsers > 0,
                totalUsers,
                successfulUsers,
                results: allResults,
                summary: `${successfulUsers}/${totalUsers} users processed successfully`
            };
            
        } catch (error) {
            console.error('Error in bulk user operation:', error);
            return { success: false, error: error.message, results: allResults };
        }
    }

    // Enhanced validation for biometric template data
    validateBiometricTemplate(templateData, biometricType) {
        const { pin, template, fid, valid } = templateData;
        
        // Basic validation
        if (!pin || !template) {
            return { valid: false, error: 'Missing PIN or template data' };
        }

        // Base64 validation
        try {
            const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
            if (!base64Regex.test(template)) {
                return { valid: false, error: 'Invalid base64 template format' };
            }
        } catch (error) {
            return { valid: false, error: 'Template validation failed: ' + error.message };
        }

        // Biometric type specific validation
        switch (biometricType.toLowerCase()) {
            case 'fingerprint':
                if (fid !== undefined && (fid < 0 || fid > 9)) {
                    return { valid: false, error: 'Fingerprint FID must be between 0-9' };
                }
                break;
            case 'face':
                if (fid !== undefined && fid !== 0) {
                    return { valid: false, error: 'Face FID should be 0' };
                }
                break;
            case 'fingervein':
                if (fid !== undefined && (fid < 0 || fid > 9)) {
                    return { valid: false, error: 'Finger vein FID must be between 0-9' };
                }
                break;
        }

        // Template size validation (basic check)
        if (template.length < 10) {
            return { valid: false, error: 'Template data too short' };
        }

        return { valid: true };
    }

    // Clear all biometric data for a user (unified approach)
    async clearUserBiometrics(deviceSerial, pin) {
        const results = [];
        
        try {
            console.log(`🧹 Clearing all biometric data for user ${pin} on device ${deviceSerial}`);
            
            // Clear each biometric type
            const biometricTypes = [
                { type: 'fingerprint', id: 1 },
                { type: 'face', id: 2 },
                { type: 'fingervein', id: 7 }
            ];
            
            for (const bioType of biometricTypes) {
                try {
                    const result = await this.deleteBioTemplate(deviceSerial, pin, bioType.id);
                    results.push({
                        type: bioType.type,
                        success: result.success || true, // Assume success if no error
                        result
                    });
                    console.log(`🗑️ Cleared ${bioType.type} templates for user ${pin}`);
                } catch (error) {
                    console.log(`⚠️ Error clearing ${bioType.type} for user ${pin}: ${error.message}`);
                    results.push({
                        type: bioType.type,
                        success: false,
                        error: error.message
                    });
                }
            }
            
            const successCount = results.filter(r => r.success).length;
            
            return {
                success: successCount > 0,
                cleared: successCount,
                total: biometricTypes.length,
                results
            };
            
        } catch (error) {
            console.error(`Error clearing biometrics for user ${pin}:`, error);
            return { success: false, error: error.message, results };
        }
    }

    // Device capability check
    async checkDevicePhotoSupport(deviceSerial) {
        try {
            const device = await this.db.get(
                'SELECT options FROM devices WHERE serial_number = ?',
                [deviceSerial]
            );
            
            if (device && device.options) {
                const options = JSON.parse(device.options);
                const photoSupported = options.PhotoFunOn === '1';
                const maxPhotos = parseInt(options['~MaxUserPhotoCount']) || 0;
                
                console.log(`📸 Device ${deviceSerial} photo support: ${photoSupported ? 'YES' : 'NO'}, Max photos: ${maxPhotos}`);
                
                return {
                    supported: photoSupported,
                    maxPhotos: maxPhotos
                };
            }
            
            return { supported: false, maxPhotos: 0 };
        } catch (error) {
            console.error('Error checking device photo support:', error);
            return { supported: false, maxPhotos: 0 };
        }
    }

}

module.exports = CommandManager; 
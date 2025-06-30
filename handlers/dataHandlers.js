const { pool } = require('../database/connection');
const { queueCommandForOtherDevices } = require('./commandHandlers');

// Parse ZKTeco data format (tab-separated key=value pairs)
function parseZKData(dataLine) {
    const data = {};
    const parts = dataLine.split('\t');
    
    for (const part of parts) {
        if (part.includes('=')) {
            const [key, value] = part.split('=', 2);
            data[key] = value || '';
        }
    }
    
    return data;
}

// Handle user information upload
async function handleUserData(dataLine, sourceDevice) {
    try {
        const userData = parseZKData(dataLine.replace('USER ', ''));
        
        if (!userData.PIN) {
            throw new Error('Missing PIN in user data');
        }

        // Insert or update user in database
        await pool.execute(`
            INSERT INTO users (pin, name, privilege, password, card, vice_card, group_id, timezone, verify_mode)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
            name = VALUES(name),
            privilege = VALUES(privilege),
            password = VALUES(password),
            card = VALUES(card),
            vice_card = VALUES(vice_card),
            group_id = VALUES(group_id),
            timezone = VALUES(timezone),
            verify_mode = VALUES(verify_mode),
            updated_at = NOW()
        `, [
            userData.PIN,
            userData.Name || '',
            parseInt(userData.Pri) || 0,
            userData.Passwd || '',
            userData.Card || '',
            userData.ViceCard || '',
            parseInt(userData.Grp) || 1,
            userData.TZ || '0000000000000000',
            parseInt(userData.Verify) || -1
        ]);

        console.log(`✓ User ${userData.PIN} synchronized from device ${sourceDevice}`);

        // Sync to other devices
        await syncUserToOtherDevices(userData, sourceDevice);

    } catch (error) {
        console.error('Error handling user data:', error);
        throw error;
    }
}

// Handle fingerprint template upload
async function handleFingerprintData(dataLine, sourceDevice) {
    try {
        const fpData = parseZKData(dataLine.replace('FP ', ''));
        
        if (!fpData.PIN || fpData.FID === undefined) {
            throw new Error('Missing PIN or FID in fingerprint data');
        }

        // Insert or update fingerprint template
        await pool.execute(`
            INSERT INTO fingerprint_templates (pin, finger_id, template_size, valid_flag, template_data, algorithm_version)
            VALUES (?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
            template_size = VALUES(template_size),
            valid_flag = VALUES(valid_flag),
            template_data = VALUES(template_data),
            algorithm_version = VALUES(algorithm_version),
            updated_at = NOW()
        `, [
            fpData.PIN,
            parseInt(fpData.FID),
            parseInt(fpData.Size) || 0,
            parseInt(fpData.Valid) || 1,
            fpData.TMP || '',
            '10.0' // Default algorithm version
        ]);

        console.log(`✓ Fingerprint template ${fpData.PIN}:${fpData.FID} synchronized from device ${sourceDevice}`);

        // Sync to other devices
        await syncFingerprintToOtherDevices(fpData, sourceDevice);

    } catch (error) {
        console.error('Error handling fingerprint data:', error);
        throw error;
    }
}

// Handle face template upload
async function handleFaceData(dataLine, sourceDevice) {
    try {
        const faceData = parseZKData(dataLine.replace('FACE ', ''));
        
        if (!faceData.PIN || faceData.FID === undefined) {
            throw new Error('Missing PIN or FID in face data');
        }

        // Insert or update face template
        await pool.execute(`
            INSERT INTO face_templates (pin, face_id, template_size, valid_flag, template_data, algorithm_version)
            VALUES (?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
            template_size = VALUES(template_size),
            valid_flag = VALUES(valid_flag),
            template_data = VALUES(template_data),
            algorithm_version = VALUES(algorithm_version),
            updated_at = NOW()
        `, [
            faceData.PIN,
            parseInt(faceData.FID),
            parseInt(faceData.SIZE) || 0,
            parseInt(faceData.VALID) || 1,
            faceData.TMP || '',
            '7.0' // Default algorithm version
        ]);

        console.log(`✓ Face template ${faceData.PIN}:${faceData.FID} synchronized from device ${sourceDevice}`);

        // Sync to other devices
        await syncFaceToOtherDevices(faceData, sourceDevice);

    } catch (error) {
        console.error('Error handling face data:', error);
        throw error;
    }
}

// Handle unified biometric data upload (newer protocol)
async function handleBioData(dataLine, sourceDevice) {
    try {
        const bioData = parseZKData(dataLine.replace('BIODATA ', ''));
        
        if (!bioData.Pin || bioData.Type === undefined) {
            throw new Error('Missing Pin or Type in biometric data');
        }

        // Insert or update biometric template
        await pool.execute(`
            INSERT INTO biometric_templates (
                pin, bio_number, bio_index, valid_flag, duress_flag, bio_type, 
                major_version, minor_version, format_type, template_data
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
            valid_flag = VALUES(valid_flag),
            duress_flag = VALUES(duress_flag),
            major_version = VALUES(major_version),
            minor_version = VALUES(minor_version),
            format_type = VALUES(format_type),
            template_data = VALUES(template_data),
            updated_at = NOW()
        `, [
            bioData.Pin,
            parseInt(bioData.No) || 0,
            parseInt(bioData.Index) || 0,
            parseInt(bioData.Valid) || 1,
            parseInt(bioData.Duress) || 0,
            parseInt(bioData.Type),
            parseInt(bioData.MajorVer) || 0,
            parseInt(bioData.MinorVer) || 0,
            parseInt(bioData.Format) || 0,
            bioData.Tmp || ''
        ]);

        console.log(`✓ Biometric template ${bioData.Pin}:${bioData.Type}:${bioData.No} synchronized from device ${sourceDevice}`);

        // Sync to other devices
        await syncBioDataToOtherDevices(bioData, sourceDevice);

    } catch (error) {
        console.error('Error handling biometric data:', error);
        throw error;
    }
}

// Sync user data to all other devices
async function syncUserToOtherDevices(userData, sourceDevice) {
    try {
        const commandData = `DATA UPDATE USERINFO PIN=${userData.PIN}\tName=${userData.Name || ''}\tPri=${userData.Pri || 0}\tPasswd=${userData.Passwd || ''}\tCard=${userData.Card || ''}\tGrp=${userData.Grp || 1}\tTZ=${userData.TZ || '0000000000000000'}\tVerify=${userData.Verify || -1}\tViceCard=${userData.ViceCard || ''}`;
        
        await queueCommandForOtherDevices(sourceDevice, 'DATA_UPDATE_USER', commandData);
    } catch (error) {
        console.error('Error syncing user to other devices:', error);
    }
}

// Sync fingerprint template to all other devices
async function syncFingerprintToOtherDevices(fpData, sourceDevice) {
    try {
        const commandData = `DATA UPDATE FINGERTMP PIN=${fpData.PIN}\tFID=${fpData.FID}\tSize=${fpData.Size || 0}\tValid=${fpData.Valid || 1}\tTMP=${fpData.TMP || ''}`;
        
        await queueCommandForOtherDevices(sourceDevice, 'DATA_UPDATE_FINGERPRINT', commandData);
    } catch (error) {
        console.error('Error syncing fingerprint to other devices:', error);
    }
}

// Sync face template to all other devices
async function syncFaceToOtherDevices(faceData, sourceDevice) {
    try {
        const commandData = `DATA UPDATE FACE PIN=${faceData.PIN}\tFID=${faceData.FID}\tValid=${faceData.VALID || 1}\tSize=${faceData.SIZE || 0}\tTMP=${faceData.TMP || ''}`;
        
        await queueCommandForOtherDevices(sourceDevice, 'DATA_UPDATE_FACE', commandData);
    } catch (error) {
        console.error('Error syncing face to other devices:', error);
    }
}

// Sync unified biometric data to all other devices
async function syncBioDataToOtherDevices(bioData, sourceDevice) {
    try {
        const commandData = `DATA UPDATE BIODATA Pin=${bioData.Pin}\tNo=${bioData.No || 0}\tIndex=${bioData.Index || 0}\tValid=${bioData.Valid || 1}\tDuress=${bioData.Duress || 0}\tType=${bioData.Type}\tMajorVer=${bioData.MajorVer || 0}\tMinorVer=${bioData.MinorVer || 0}\tFormat=${bioData.Format || 0}\tTmp=${bioData.Tmp || ''}`;
        
        await queueCommandForOtherDevices(sourceDevice, 'DATA_UPDATE_BIODATA', commandData);
    } catch (error) {
        console.error('Error syncing biometric data to other devices:', error);
    }
}

// Sync all data for a new device (when device comes online)
async function syncAllDataToDevice(deviceSerial) {
    try {
        console.log(`🔄 Starting full sync for device ${deviceSerial}`);

        // Sync all users
        const [users] = await pool.execute('SELECT * FROM users ORDER BY updated_at DESC');
        for (const user of users) {
            const commandData = `DATA UPDATE USERINFO PIN=${user.pin}\tName=${user.name || ''}\tPri=${user.privilege}\tPasswd=${user.password || ''}\tCard=${user.card || ''}\tGrp=${user.group_id}\tTZ=${user.timezone}\tVerify=${user.verify_mode}\tViceCard=${user.vice_card || ''}`;
            await queueCommandForDevice(deviceSerial, 'DATA_UPDATE_USER', commandData);
        }

        // Sync all fingerprint templates
        const [fingerprints] = await pool.execute('SELECT * FROM fingerprint_templates WHERE valid_flag = 1 ORDER BY updated_at DESC');
        for (const fp of fingerprints) {
            const commandData = `DATA UPDATE FINGERTMP PIN=${fp.pin}\tFID=${fp.finger_id}\tSize=${fp.template_size}\tValid=${fp.valid_flag}\tTMP=${fp.template_data}`;
            await queueCommandForDevice(deviceSerial, 'DATA_UPDATE_FINGERPRINT', commandData);
        }

        // Sync all face templates
        const [faces] = await pool.execute('SELECT * FROM face_templates WHERE valid_flag = 1 ORDER BY updated_at DESC');
        for (const face of faces) {
            const commandData = `DATA UPDATE FACE PIN=${face.pin}\tFID=${face.face_id}\tValid=${face.valid_flag}\tSize=${face.template_size}\tTMP=${face.template_data}`;
            await queueCommandForDevice(deviceSerial, 'DATA_UPDATE_FACE', commandData);
        }

        // Sync all biometric templates
        const [bioTemplates] = await pool.execute('SELECT * FROM biometric_templates WHERE valid_flag = 1 ORDER BY updated_at DESC');
        for (const bio of bioTemplates) {
            const commandData = `DATA UPDATE BIODATA Pin=${bio.pin}\tNo=${bio.bio_number}\tIndex=${bio.bio_index}\tValid=${bio.valid_flag}\tDuress=${bio.duress_flag}\tType=${bio.bio_type}\tMajorVer=${bio.major_version}\tMinorVer=${bio.minor_version}\tFormat=${bio.format_type}\tTmp=${bio.template_data}`;
            await queueCommandForDevice(deviceSerial, 'DATA_UPDATE_BIODATA', commandData);
        }

        console.log(`✓ Full sync queued for device ${deviceSerial}`);

    } catch (error) {
        console.error('Error syncing all data to device:', error);
        throw error;
    }
}

// Queue command for specific device
async function queueCommandForDevice(deviceSerial, commandType, commandData) {
    const { generateCommandId } = require('./commandHandlers');
    const commandId = generateCommandId();
    
    await pool.execute(`
        INSERT INTO device_commands (device_serial, command_id, command_type, command_data, status)
        VALUES (?, ?, ?, ?, 'pending')
    `, [deviceSerial, commandId, commandType, commandData]);
}

module.exports = {
    handleUserData,
    handleFingerprintData,
    handleFaceData,
    handleBioData,
    syncAllDataToDevice,
    parseZKData
}; 
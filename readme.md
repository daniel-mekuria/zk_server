# ZKTeco PUSH Protocol Server

A comprehensive Node.js implementation of the ZKTeco PUSH communication protocol for syncing user and biometric data across multiple ZKTeco devices.

## Features

### Implemented Features
- Device registration and management
- User information synchronization
- Biometric template management (fingerprint, face, finger vein, unified templates)
- User photo and comparison photo handling
- Work code management
- ID card information processing
- Real-time data synchronization across devices
- Multi-device support with automatic sync
- Command queuing and execution tracking
- Heartbeat monitoring and connection management

### Excluded Features (as requested)
- Attendance record management
- Communication encryption
- Operation log processing for attendance

## Quick Start

### Installation

```bash
# Install dependencies
npm install

# Start the server
npm start

# For development with auto-reload
npm run dev
```

### Configuration

The server runs on port 8080 by default. Set PORT environment variable to change:

```bash
PORT=3000 npm start
```

### Device Setup

Configure your ZKTeco devices to connect to this server:
- Server IP: Your server's IP address
- Server Port: 8080 (or your configured port)
- Protocol: PUSH

## Architecture

### Core Components

1. **Server (server.js)** - Main HTTP server handling ZK protocol endpoints
2. **Database (database.js)** - SQLite database layer with full schema
3. **Device Manager (deviceManager.js)** - Device registration and configuration
4. **Command Manager (commandManager.js)** - Command queue and execution
5. **Data Processor (dataProcessor.js)** - Data parsing and synchronization

### Database Schema

Main tables:
- `devices` - Device registration and status
- `users` - User information and credentials
- `fingerprint_templates` - Fingerprint biometric data
- `face_templates` - Face biometric data
- `bio_templates` - Unified biometric templates
- `user_photos` - User profile photos
- `comparison_photos` - Biometric comparison photos
- `commands` - Command queue and execution tracking
- `sync_log` - Data synchronization logging

## API Endpoints

### ZKTeco Protocol Endpoints

- `GET /iclock/cdata` - Device initialization and configuration exchange
- `POST /iclock/cdata` - Data upload from devices (users, templates, photos)
- `GET /iclock/getrequest` - Command requests from devices
- `POST /iclock/devicecmd` - Command replies from devices
- `GET /iclock/ping` - Heartbeat monitoring

### Management API Endpoints

- `GET /api/devices` - List all devices with status
- `GET /api/devices/{serialNumber}` - Get device details
- `DELETE /api/devices/{serialNumber}` - Remove device
- `GET /api/users` - List users (query: ?device=serialNumber)
- `GET /api/users/{pin}` - Get user details with biometrics
- `DELETE /api/users/{pin}` - Delete user and all related biometric data
- `GET /api/commands` - List commands (query: ?device=&status=&limit=)
- `POST /api/commands/user/add` - Add user command
- `POST /api/commands/user/delete` - Delete user command
- `POST /api/commands/device/reboot` - Reboot device command
- `GET /api/status` - System status and statistics
- `GET /api/stats` - Detailed system statistics
- `POST /api/sync/manual` - Trigger manual synchronization between devices

#### New API Endpoints Details

**Delete User API**
```
DELETE /api/users/{pin}
```
Permanently deletes a user and all their associated biometric data (fingerprints, face templates, bio templates, photos) from the database. Additionally, automatically creates delete user commands for all active devices to sync the deletion across the entire system.

**Manual Sync API**
```
POST /api/sync/manual
```
Triggers manual synchronization of data to target devices. Can sync from a specific device or from the entire database.

Request body options:

**Sync from Database to All Devices:**
```json
{
  "syncType": "all" // Options: "all", "users", "fingerprints", "faces", "bio"
}
```

**Sync from Specific Device to Other Devices:**
```json
{
  "sourceDevice": "device_serial_number",
  "targetDevices": ["target1", "target2"], // Optional: if not provided, syncs to all active devices except source
  "syncType": "all" // Options: "all", "users", "fingerprints", "faces", "bio"
}
```

Response includes sync results, number of commands created, and detailed status for each target device.

### Supported Data Types

1. **User Information (USERINFO)**
2. **Fingerprint Templates (FINGERTMP)**
3. **Face Templates (FACE)**
4. **Finger Vein Templates (FVEIN)**
5. **Unified Bio Templates (BIODATA)**
6. **User Photos (USERPIC)**
7. **Comparison Photos (BIOPHOTO)**
8. **Work Codes (WORKCODE)**
9. **ID Card Information (IDCARD)**

## Synchronization

When any device uploads data, the server automatically:

1. Processes and stores the data
2. Identifies all other active devices
3. Creates sync commands for each device
4. Queues commands for delivery
5. Tracks synchronization status

This ensures all devices maintain consistent user and biometric data.

## Command Management

Supports all ZKTeco command types:

### Data Commands
- Add/update users, templates, photos
- Delete user data and biometrics
- Query specific information

### Control Commands
- Device reboot
- Door unlock
- Alarm control

### Configuration Commands
- Set device options
- Reload configuration

### Enrollment Commands
- Remote fingerprint enrollment
- Remote biometric enrollment

## Protocol Compliance

- Based on ZKTeco PUSH Protocol v2.4.1
- Supports protocol versions 2.2.14 through 2.4.1
- Full HTTP/1.1 compliance
- Standard ZK message formatting

## Development

### Project Structure

```
zk_server/
├── server.js           # Main application
├── database.js         # Database layer
├── deviceManager.js    # Device management
├── commandManager.js   # Command handling
├── dataProcessor.js    # Data processing
├── package.json        # Dependencies
└── README.md          # Documentation
```

### Key Classes

- `ZKPushServer` - Main server class
- `Database` - SQLite database wrapper
- `DeviceManager` - Device lifecycle management
- `CommandManager` - Command queue operations
- `DataProcessor` - Data parsing and sync logic

## Logging

Comprehensive logging includes:
- Device connections/disconnections
- Data upload processing
- Command execution results
- Synchronization operations
- Error tracking

## Usage Examples

### Management API Examples

**Get all devices:**
```bash
curl http://localhost:8080/api/devices
```

**Add a user to a device:**
```bash
curl -X POST http://localhost:8080/api/commands/user/add \
  -H "Content-Type: application/json" \
  -d '{
    "deviceSerial": "DEVICE001",
    "userInfo": {
      "pin": "123",
      "name": "John Doe",
      "privilege": 0,
      "card": "123456789"
    }
  }'
```

**Get system status:**
```bash
curl http://localhost:8080/api/status
```

### Device Configuration

Configure your ZKTeco device with these settings:
- Communication Mode: TCP/IP Push
- Server IP: Your server IP
- Server Port: 8080
- Push Protocol: Enabled
- Realtime: Enabled

## License

MIT License

## Enhanced Biometric Sync System

### Problem Solved: Fingerprint and Face Template Sync Conflicts

**Issue**: Previously, fingerprint and face templates worked separately but couldn't be properly synced for the same user due to competing protocols and storage conflicts.

**Solution**: Implemented a unified BIODATA approach that uses the ZKTeco protocol's modern unified biometric template format for all biometric types.

### Key Improvements

1. **Unified Protocol**: All biometric templates (fingerprint, face, finger vein) now use the `DATA UPDATE BIODATA` command format
2. **Consistent Operations**: Delete and query operations now use the same unified format as add operations
3. **Multi-Modal Support**: Proper support for users with multiple biometric modalities
4. **Enhanced Validation**: Better template data validation to prevent sync errors
5. **Bulk Operations**: Support for adding multiple users with biometric data in one operation
6. **Granular Control**: Individual biometric type deletion and querying
7. **Protocol Consistency**: All CRUD operations (Create, Read, Update, Delete) use the same BIODATA format
8. **🔥 Delete-First Updates**: **NEW** - Automatically deletes existing templates before adding new ones to prevent conflicts
9. **Update Operations**: **NEW** - Dedicated update methods that ensure clean biometric data replacement

### Issues Fixed

- ✅ **Delete Operations**: Fixed inconsistency where deletes used legacy format while adds used BIODATA
- ✅ **Query Operations**: Updated queries to use unified BIODATA format for consistency  
- ✅ **Sync Conflicts**: Eliminated conflicts between different template formats for the same user
- ✅ **Protocol Fragmentation**: Unified all biometric operations under single protocol
- ✅ **Multi-Modal Users**: Proper handling of users with both fingerprint and face templates
- ✅ **Template Validation**: Enhanced validation prevents common sync errors
- ✅ **🔥 Template Update Conflicts**: **NEW** - Automatically clears existing templates before updates to prevent conflicts
- ✅ **🔥 Stale Data Issues**: **NEW** - Update operations ensure fresh biometric data without remnants

### API Endpoints

#### Add User with Multiple Biometric Templates
```http
POST /api/users/biometric-add
Content-Type: application/json

{
  "deviceSerial": "DEVICE123",
  "userInfo": {
    "pin": "001",
    "name": "John Doe",
    "privilege": 0
  },
  "biometrics": [
    {
      "type": "fingerprint",
      "fid": 0,
      "template": "base64_encoded_fingerprint_template",
      "valid": 1
    },
    {
      "type": "face", 
      "fid": 0,
      "template": "base64_encoded_face_template",
      "valid": 1
    }
  ],
  "updateMode": false  // Optional: set to true to delete existing templates first
}
```

#### Update User with Biometric Templates (Deletes existing first)
```http
PUT /api/users/biometric-update
Content-Type: application/json

{
  "deviceSerial": "DEVICE123",
  "userInfo": {
    "pin": "001",
    "name": "John Doe Updated",
    "privilege": 0
  },
  "biometrics": [
    {
      "type": "fingerprint",
      "fid": 0,
      "template": "new_base64_encoded_fingerprint_template",
      "valid": 1
    },
    {
      "type": "face", 
      "fid": 0,
      "template": "new_base64_encoded_face_template",
      "valid": 1
    }
  ]
}
```

#### Bulk Add Multiple Users with Biometric Data
```http
POST /api/users/bulk-biometric-add
Content-Type: application/json

{
  "deviceSerial": "DEVICE123",
  "usersData": [
    {
      "userInfo": {
        "pin": "001",
        "name": "John Doe",
        "privilege": 0
      },
      "biometrics": [
        {
          "type": "fingerprint",
          "fid": 0,
          "template": "base64_template_1"
        }
      ]
    },
    {
      "userInfo": {
        "pin": "002", 
        "name": "Jane Smith",
        "privilege": 0
      },
      "biometrics": [
        {
          "type": "face",
          "fid": 0,
          "template": "base64_template_2"
        }
      ]
    }
  ]
}
```

#### Bulk Update Multiple Users (Deletes existing templates first)
```http
PUT /api/users/bulk-biometric-update
Content-Type: application/json

{
  "deviceSerial": "DEVICE123",
  "usersData": [
    {
      "userInfo": {
        "pin": "001",
        "name": "John Doe Updated",
        "privilege": 0
      },
      "biometrics": [
        {
          "type": "fingerprint",
          "fid": 0,
          "template": "new_base64_template_1"
        }
      ]
    }
  ]
}
```

#### Clear All Biometric Data for a User
```http
DELETE /api/users/{pin}/biometrics
Content-Type: application/json

{
  "deviceSerial": "DEVICE123"
}
```

#### Delete Specific Biometric Type
```http
DELETE /api/users/{pin}/biometrics/{type}
Content-Type: application/json

{
  "deviceSerial": "DEVICE123",
  "fid": 0  // optional
}
```

#### Query Specific Biometric Type
```http
GET /api/users/{pin}/biometrics/{type}?deviceSerial=DEVICE123&fid=0
```

#### Validate Biometric Template
```http
POST /api/biometrics/validate
Content-Type: application/json

{
  "templateData": {
    "pin": "001",
    "template": "base64_template_data",
    "fid": 0
  },
  "biometricType": "fingerprint"
}
```

#### Test Biometric Sync Between Devices
```http
POST /api/users/biometric-sync
Content-Type: application/json

{
  "sourceDevice": "DEVICE123",
  "targetDevice": "DEVICE456", 
  "pin": "001"
}
```

### Supported Biometric Types

The system now supports the following biometric types using the unified BIODATA format:

- `fingerprint` (Type=1)
- `face` (Type=2) 
- `voiceprint` (Type=3)
- `iris` (Type=4)
- `retina` (Type=5)
- `palmprint` (Type=6)
- `fingervein` (Type=7)
- `palm` (Type=8)
- `visible_light_face` (Type=9)

### Migration Guide

If you have existing systems using the legacy format:

1. **Automatic Conversion**: The system automatically converts legacy FP and FACE sync operations to BIODATA format
2. **Backward Compatibility**: Existing API calls to `addFingerprintTemplate` and `addFaceTemplate` still work but now use the unified format internally
3. **New Recommended Method**: Use `addUserWithBiometrics` for new implementations

### Technical Details

#### Command Format
All biometric templates now use:
```
C:${CmdID}:DATA UPDATE BIODATA Pin=${PIN}\tNo=${FID}\tIndex=${INDEX}\tValid=${VALID}\tDuress=0\tType=${TYPE}\tMajorVer=0\tMinorVer=0\tFormat=ZK\tTmp=${TEMPLATE}
```

#### Database Storage
Templates are stored in a unified format in the `bio_templates` table with proper type identification.

### Troubleshooting

**If you still experience sync issues:**

1. Check the console logs for "🔄 Converting" messages to confirm unified format is being used
2. Verify template data is valid base64
3. Ensure devices support the BIODATA format (newer ZKTeco devices)
4. Use the `/api/users/biometric-sync` endpoint to test sync between specific devices

### Legacy Support

The system maintains backward compatibility:
- Old `FINGERTMP` and `FACE` commands are automatically converted
- Existing database records are preserved
- Legacy API endpoints continue to function

For best results with multi-modal biometric users, use the new unified endpoints and ensure all devices in your network support the BIODATA protocol format.

## 🔥 Delete-First Update Behavior

### Why Delete First?

When updating biometric templates, the system now **automatically deletes existing templates before adding new ones**. This prevents:

- **Template Conflicts**: Old and new templates competing during verification
- **Sync Issues**: Mixed template formats causing sync failures
- **Storage Bloat**: Accumulation of outdated template data
- **Authentication Problems**: Stale templates interfering with user verification

### Update Methods

**Automatic Delete-First (Recommended):**
```bash
# Use dedicated update endpoints - always deletes existing first
PUT /api/users/biometric-update          # Single user update
PUT /api/users/bulk-biometric-update     # Bulk user update
```

**Manual Control:**
```bash
# Use add endpoints with updateMode flag
POST /api/users/biometric-add
{
  "updateMode": true,  # Deletes existing templates first
  "userInfo": {...},
  "biometrics": [...]
}
```

**Legacy Add (No Delete):**
```bash
# Add without deleting (may cause conflicts)
POST /api/users/biometric-add
{
  "updateMode": false,  # Default - adds without deleting
  "userInfo": {...},
  "biometrics": [...]
}
```

### Best Practices

1. **For Updates**: Always use `PUT` endpoints or set `updateMode: true`
2. **For New Users**: Use `POST` endpoints with `updateMode: false` (default)
3. **For Troubleshooting**: Use clear endpoints to remove problematic templates first
4. **For Migration**: Use bulk update endpoints to refresh all user data

### Console Output

When delete-first is active, you'll see:
```
🗑️ Deleting existing fingerprint templates for PIN 123 before adding new one
✅ Existing fingerprint templates deleted for PIN 123
🔧 Adding unified biometric template: PIN=123, Type=1 (fingerprint), FID=0
``` 
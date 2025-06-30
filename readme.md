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
- `GET /api/commands` - List commands (query: ?device=&status=&limit=)
- `POST /api/commands/user/add` - Add user command
- `POST /api/commands/user/delete` - Delete user command
- `POST /api/commands/device/reboot` - Reboot device command
- `GET /api/status` - System status and statistics
- `GET /api/stats` - Detailed system statistics

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
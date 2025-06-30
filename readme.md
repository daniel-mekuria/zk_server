# ZKTeco Sync Server

A Node.js + MySQL server that implements the ZKTeco PUSH Communication Protocol to synchronize user information and biometric data (fingerprints and face templates) across multiple ZKTeco attendance devices.

## Features

- **Real-time Synchronization**: Automatically sync user data and biometric templates across all connected devices
- **ZKTeco PUSH Protocol**: Full implementation of the official ZKTeco PUSH Communication Protocol v2.4.1
- **Multi-Device Support**: Manage unlimited number of ZKTeco devices
- **Biometric Data Sync**: Support for fingerprint templates, face templates, and unified biometric data
- **Command Queuing**: Reliable command delivery with retry mechanism
- **Device Management**: Track device status, capabilities, and connection history
- **MySQL Storage**: Robust data storage with proper indexing and relationships

## Supported Data Types

- **User Information**: User ID, name, privilege level, passwords, card numbers, access groups
- **Fingerprint Templates**: All 10 fingers with template data and algorithm versions  
- **Face Templates**: Face recognition templates with algorithm version support
- **Unified Biometric Data**: Modern biometric data format supporting multiple modalities
- **Device Management**: Device registration, status tracking, and capability detection

## Protocol Support

This server implements the ZKTeco PUSH Communication Protocol as documented in the official specification:

- Device registration and initialization
- Data upload handling (users, fingerprints, faces, biometric data)
- Command distribution and queuing
- Command reply processing
- Real-time and scheduled synchronization modes

## Installation

### Prerequisites

- Node.js 14+ 
- MySQL 5.7+ or MariaDB 10.3+
- ZKTeco devices with PUSH protocol support

### Quick Start

```bash
git clone <repository-url>
cd zk_server
npm install
npm run init    # Creates .env + starts server
```

### Detailed Setup

1. **Clone and Install**
   ```bash
   git clone <repository-url>
   cd zk_server
   npm install
   ```

2. **Configure Environment**
   ```bash
   # Use setup script (recommended)
   npm run setup
   
   # Or copy manually
   cp config.example .env
   
   # Edit .env with your database credentials
   nano .env
   ```

3. **Start Server**
   ```bash
   # Development mode
   npm run dev
   
   # Production mode
   npm start
   ```
   
   The server automatically runs database migration on startup, creating all required tables.

**Manual Migration (Optional)**: If you need to run migration separately:
```bash
npm run migrate
```

## Configuration

Update the `.env` file with your settings:

```env
# Database Configuration
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=zkteco_sync

# Server Configuration  
PORT=8081

# Optional: Enable debug logging
DEBUG=false
```

**Note:** The `.env` file is not tracked in git for security reasons. Always use the provided `config.example` as a template.

## Device Configuration

Configure your ZKTeco devices to connect to the server:

1. **Network Settings**
   - Set server IP to your server's IP address
   - Set server port to 8081 (or your configured port)
   - Enable PUSH protocol

2. **PUSH Protocol Settings**
   - Server URL: `http://your-server-ip:8081/iclock/`
   - Enable real-time uploading
   - Set upload interval as needed

3. **Data Upload Settings**
   - Enable user information upload
   - Enable fingerprint template upload  
   - Enable face template upload
   - Enable operation log upload

## API Endpoints

The server implements the following ZKTeco PUSH protocol endpoints:

### Device Registration
- `GET /iclock/cdata?SN={serial}&options=all` - Device initialization and configuration

### Data Upload  
- `POST /iclock/cdata?SN={serial}&table={type}` - Upload user/biometric data

### Command Polling
- `GET /iclock/getrequest?SN={serial}` - Get pending commands

### Command Reply
- `POST /iclock/devicecmd?SN={serial}` - Command execution results

### Health Check
- `GET /health` - Server status

## Database Schema

The complete database schema is defined in `migrate.js` and includes:

### Key Tables

- **devices**: Connected device information and status
- **users**: User account information  
- **fingerprint_templates**: Fingerprint biometric data
- **face_templates**: Face recognition templates
- **biometric_templates**: Unified biometric data (newer protocol)
- **device_commands**: Command queue for device synchronization

## How Synchronization Works

1. **Device Registration**: Devices connect and register with the server
2. **Data Upload**: When a device uploads new/updated user or biometric data, it's stored in the database
3. **Command Generation**: Server automatically generates sync commands for all other connected devices
4. **Command Distribution**: Commands are queued and sent to devices when they poll for updates
5. **Confirmation**: Devices acknowledge command completion

### Sync Flow Example

```
Device A adds new user → Server stores user → Commands queued for Devices B,C,D → 
Devices poll for commands → Server sends user data → Devices confirm receipt → Sync complete
```

## Monitoring

### Server Logs
The server provides detailed logging for:
- Device connections and status
- Data synchronization events  
- Command queue processing
- Error conditions

### Database Monitoring
Check sync status with SQL queries:
```sql
-- View connected devices
SELECT * FROM devices WHERE status = 'online';

-- Check command queue
SELECT device_serial, command_type, status, created_at 
FROM device_commands 
WHERE status = 'pending';

-- View recent user syncs
SELECT * FROM users ORDER BY updated_at DESC LIMIT 10;
```

## Troubleshooting

### Common Issues

1. **Device Not Connecting**
   - Verify network connectivity
   - Check server IP and port configuration
   - Ensure firewall allows connections on configured port

2. **Data Not Syncing**
   - Check device logs for upload errors
   - Verify command queue is processing (`device_commands` table)
   - Ensure devices are polling regularly for commands

3. **Database Errors**
   - Verify MySQL connection settings
   - Check database user permissions
   - Run `npm run migrate` to ensure database and tables are created

### Debug Mode
Enable debug logging by setting `DEBUG=true` in your `.env` file.

## Security Considerations

- Run server behind a firewall with only necessary ports open
- Use strong MySQL credentials
- Consider enabling HTTPS for production deployments
- Regularly backup the database containing biometric data
- Monitor device connections for unauthorized access

## Performance

- Server supports 100+ concurrent devices
- MySQL provides efficient querying with proper indexing
- Command queue prevents overwhelming devices with updates
- Automatic cleanup of old commands and logs

## License

[Add your license information here]

## Support

For issues related to:
- ZKTeco device configuration: Consult ZKTeco documentation
- Server setup and operation: Check logs and database status
- Protocol implementation: Refer to ZKTeco PUSH Protocol specification

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly with actual ZKTeco devices
5. Submit a pull request

---

**Note**: This server only handles user and biometric data synchronization. It does not process attendance records or other device functions beyond data sync.

### 🚀 Quick Start Summary
```bash
npm install && npm run init
# Edit .env with database credentials, then restart
```
✅ Database migration runs automatically on startup - no manual setup required!

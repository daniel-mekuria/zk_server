# Quick Setup Guide

## 1. Install Dependencies

```bash
npm install
```

## 2. Configure Environment

```bash
# Option 1: Use npm script
npm run setup

# Option 2: Manual copy
cp config.example .env

# Edit with your database credentials
nano .env
```

Update `.env` with your settings:
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

## 3. Start Server

```bash
# Production
npm start

# Development with auto-reload
npm run dev
```

The server will automatically:
- Run database migration on startup
- Create database and tables if they don't exist
- Verify database connectivity
- Start listening for ZKTeco devices

### Manual Database Setup (Optional)

If you need to run the migration separately:

```bash
npm run migrate
```

## 4. Configure ZKTeco Devices

In your ZKTeco device network settings:

- **Server IP**: Your server's IP address
- **Server Port**: 8081 (or your configured port)
- **Server URL**: `/iclock/`
- **Protocol**: PUSH

Enable these data uploads:
- User information
- Fingerprint templates
- Face templates
- Operation logs

## 5. Monitor System

```bash
# View all status once
npm run monitor

# Continuous monitoring
npm run monitor:watch

# View only devices
npm run monitor:devices

# View command queue
npm run monitor:queue

# View recent activity
npm run monitor:activity
```

## 6. Verify Sync

1. Add a user on one device
2. Check server logs for upload
3. Verify data appears in database
4. Check that commands are queued for other devices
5. Confirm user appears on other devices

## Troubleshooting

**Device not connecting?**
- Check IP/port configuration
- Verify firewall settings
- Ensure PUSH protocol is enabled

**Data not syncing?**
- Check device upload settings
- Monitor command queue for errors
- Verify database connectivity

**Performance issues?**
- Monitor database connections
- Check MySQL slow query log
- Consider adding more indexes for large datasets 
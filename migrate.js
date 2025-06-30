#!/usr/bin/env node

require('dotenv').config();
const mysql = require('mysql2/promise');

// Colors for console output
const colors = {
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    reset: '\x1b[0m',
    bright: '\x1b[1m'
};

// Database schema - will be created dynamically
const SCHEMA = {
    
    // Create tables
    tables: {
        devices: `
            CREATE TABLE IF NOT EXISTS devices (
                id INT AUTO_INCREMENT PRIMARY KEY,
                serial_number VARCHAR(50) UNIQUE NOT NULL,
                ip_address VARCHAR(45),
                last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                push_version VARCHAR(20),
                language VARCHAR(10),
                firmware_version VARCHAR(50),
                user_count INT DEFAULT 0,
                fingerprint_count INT DEFAULT 0,
                face_count INT DEFAULT 0,
                attendance_count INT DEFAULT 0,
                status ENUM('online', 'offline') DEFAULT 'offline',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `,
        
        users: `
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                pin VARCHAR(20) UNIQUE NOT NULL,
                name VARCHAR(100),
                privilege INT DEFAULT 0,
                password VARCHAR(50),
                card VARCHAR(50),
                vice_card VARCHAR(50),
                group_id INT DEFAULT 1,
                timezone VARCHAR(16) DEFAULT '0000000000000000',
                verify_mode INT DEFAULT -1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `,
        
        fingerprint_templates: `
            CREATE TABLE IF NOT EXISTS fingerprint_templates (
                id INT AUTO_INCREMENT PRIMARY KEY,
                pin VARCHAR(20) NOT NULL,
                finger_id INT NOT NULL,
                template_size INT,
                valid_flag INT DEFAULT 1,
                duress_flag INT DEFAULT 0,
                template_data LONGTEXT,
                algorithm_version VARCHAR(10),
                format_type INT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY unique_finger (pin, finger_id)
            )
        `,
        
        face_templates: `
            CREATE TABLE IF NOT EXISTS face_templates (
                id INT AUTO_INCREMENT PRIMARY KEY,
                pin VARCHAR(20) NOT NULL,
                face_id INT NOT NULL,
                template_size INT,
                valid_flag INT DEFAULT 1,
                template_data LONGTEXT,
                algorithm_version VARCHAR(10),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY unique_face (pin, face_id)
            )
        `,
        
        biometric_templates: `
            CREATE TABLE IF NOT EXISTS biometric_templates (
                id INT AUTO_INCREMENT PRIMARY KEY,
                pin VARCHAR(20) NOT NULL,
                bio_number INT DEFAULT 0,
                bio_index INT DEFAULT 0,
                valid_flag INT DEFAULT 1,
                duress_flag INT DEFAULT 0,
                bio_type INT NOT NULL,
                major_version INT,
                minor_version INT,
                format_type INT DEFAULT 0,
                template_data LONGTEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY unique_bio (pin, bio_type, bio_number, bio_index)
            )
        `,
        
        device_commands: `
            CREATE TABLE IF NOT EXISTS device_commands (
                id INT AUTO_INCREMENT PRIMARY KEY,
                device_serial VARCHAR(50) NOT NULL,
                command_id VARCHAR(16) NOT NULL,
                command_type VARCHAR(50) NOT NULL,
                command_data TEXT,
                status ENUM('pending', 'sent', 'completed', 'failed') DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                sent_at TIMESTAMP NULL,
                completed_at TIMESTAMP NULL,
                retry_count INT DEFAULT 0
            )
        `,
        
        sync_status: `
            CREATE TABLE IF NOT EXISTS sync_status (
                id INT AUTO_INCREMENT PRIMARY KEY,
                device_serial VARCHAR(50) NOT NULL,
                table_name VARCHAR(50) NOT NULL,
                last_sync_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY unique_sync (device_serial, table_name)
            )
        `
    },
    
    // Create foreign keys (after tables exist)
    foreignKeys: [
        'ALTER TABLE fingerprint_templates ADD CONSTRAINT fk_fp_user FOREIGN KEY (pin) REFERENCES users(pin) ON DELETE CASCADE',
        'ALTER TABLE face_templates ADD CONSTRAINT fk_face_user FOREIGN KEY (pin) REFERENCES users(pin) ON DELETE CASCADE', 
        'ALTER TABLE biometric_templates ADD CONSTRAINT fk_bio_user FOREIGN KEY (pin) REFERENCES users(pin) ON DELETE CASCADE',
        'ALTER TABLE device_commands ADD CONSTRAINT fk_cmd_device FOREIGN KEY (device_serial) REFERENCES devices(serial_number) ON DELETE CASCADE',
        'ALTER TABLE sync_status ADD CONSTRAINT fk_sync_device FOREIGN KEY (device_serial) REFERENCES devices(serial_number) ON DELETE CASCADE'
    ],
    
    // Create indexes for better performance
    indexes: [
        'CREATE INDEX IF NOT EXISTS idx_users_pin ON users(pin)',
        'CREATE INDEX IF NOT EXISTS idx_fingerprint_pin ON fingerprint_templates(pin)',
        'CREATE INDEX IF NOT EXISTS idx_face_pin ON face_templates(pin)',
        'CREATE INDEX IF NOT EXISTS idx_bio_pin ON biometric_templates(pin)',
        'CREATE INDEX IF NOT EXISTS idx_bio_type ON biometric_templates(bio_type)',
        'CREATE INDEX IF NOT EXISTS idx_commands_device ON device_commands(device_serial, status)',
        'CREATE INDEX IF NOT EXISTS idx_devices_serial ON devices(serial_number)',
        'CREATE INDEX IF NOT EXISTS idx_devices_status ON devices(status)'
    ]
};

async function migrate(options = {}) {
    const { quiet = false } = options;
    
    if (!quiet) {
        console.log(`${colors.bright}${colors.blue}🗄️  ZKTeco Database Migration${colors.reset}\n`);
    }

    const dbConfig = {
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || ''
    };

    const dbName = process.env.DB_NAME || 'zkteco_sync';
    let connection;

    try {
        // Step 1: Connect to MySQL server (without database)
        if (!quiet) console.log(`${colors.blue}📡 Connecting to MySQL server...${colors.reset}`);
        connection = await mysql.createConnection(dbConfig);
        if (!quiet) console.log(`${colors.green}✓ Connected to MySQL server${colors.reset}`);

        // Step 2: Create database if it doesn't exist
        if (!quiet) console.log(`${colors.blue}🏗️  Creating database '${dbName}' if not exists...${colors.reset}`);
        await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
        if (!quiet) console.log(`${colors.green}✓ Database '${dbName}' ready${colors.reset}`);

        // Step 3: Use the database
        await connection.query(`USE \`${dbName}\``);

        // Step 4: Create tables
        if (!quiet) console.log(`${colors.blue}📋 Creating tables...${colors.reset}`);
        const tableNames = Object.keys(SCHEMA.tables);
        
        for (const tableName of tableNames) {
            try {
                await connection.query(SCHEMA.tables[tableName]);
                if (!quiet) console.log(`${colors.green}  ✓ ${tableName}${colors.reset}`);
            } catch (error) {
                if (!quiet) console.log(`${colors.yellow}  ⚠️  ${tableName} (${error.message})${colors.reset}`);
            }
        }

        // Step 5: Add foreign keys (ignore errors if they already exist)
        if (!quiet) console.log(`${colors.blue}🔗 Adding foreign key constraints...${colors.reset}`);
        for (const fk of SCHEMA.foreignKeys) {
            try {
                await connection.query(fk);
                if (!quiet) console.log(`${colors.green}  ✓ Foreign key added${colors.reset}`);
            } catch (error) {
                if (error.code === 'ER_DUP_KEYNAME' || error.code === 'ER_FK_DUP_NAME') {
                    if (!quiet) console.log(`${colors.yellow}  ⚠️  Foreign key already exists${colors.reset}`);
                } else {
                    if (!quiet) console.log(`${colors.yellow}  ⚠️  Foreign key error: ${error.message}${colors.reset}`);
                }
            }
        }

        // Step 6: Create indexes
        if (!quiet) console.log(`${colors.blue}📊 Creating indexes...${colors.reset}`);
        for (const index of SCHEMA.indexes) {
            try {
                await connection.query(index);
                if (!quiet) console.log(`${colors.green}  ✓ Index created${colors.reset}`);
            } catch (error) {
                if (error.code === 'ER_DUP_KEYNAME') {
                    if (!quiet) console.log(`${colors.yellow}  ⚠️  Index already exists${colors.reset}`);
                } else {
                    if (!quiet) console.log(`${colors.yellow}  ⚠️  Index error: ${error.message}${colors.reset}`);
                }
            }
        }

        // Step 7: Verify migration
        if (!quiet) console.log(`${colors.blue}🔍 Verifying migration...${colors.reset}`);
        const [tables] = await connection.query(`
            SELECT TABLE_NAME, TABLE_ROWS
            FROM information_schema.TABLES 
            WHERE TABLE_SCHEMA = ?
            ORDER BY TABLE_NAME
        `, [dbName]);

        if (!quiet) {
            console.log(`\n${colors.bright}📋 Database Tables:${colors.reset}`);
            if (tables.length === 0) {
                console.log(`${colors.red}  ✗ No tables found${colors.reset}`);
            } else {
                tables.forEach(table => {
                    console.log(`${colors.green}  ✓ ${table.TABLE_NAME} (${table.TABLE_ROWS} rows)${colors.reset}`);
                });
            }

            // Verify device_commands table specifically
            const [columns] = await connection.query(`
                SELECT COLUMN_NAME 
                FROM information_schema.COLUMNS 
                WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'device_commands'
                ORDER BY ORDINAL_POSITION
            `, [dbName]);

            if (columns.length > 0) {
                console.log(`\n${colors.bright}🔧 device_commands columns:${colors.reset}`);
                const columnNames = columns.map(c => c.COLUMN_NAME).join(', ');
                console.log(`${colors.green}  ${columnNames}${colors.reset}`);
            }

            console.log(`\n${colors.green}${colors.bright}✅ Migration completed successfully!${colors.reset}`);
            console.log(`${colors.blue}🚀 You can now start the server with: npm start${colors.reset}`);
        }

    } catch (error) {
        console.error(`\n${colors.red}${colors.bright}✗ Migration failed:${colors.reset}`);
        console.error(`${colors.red}${error.message}${colors.reset}`);
        
        if (error.code === 'ER_ACCESS_DENIED_ERROR') {
            console.log(`\n${colors.yellow}💡 Troubleshooting tips:${colors.reset}`);
            console.log(`${colors.yellow}  • Check your database credentials in .env file${colors.reset}`);
            console.log(`${colors.yellow}  • Make sure MySQL is running${colors.reset}`);
            console.log(`${colors.yellow}  • Verify the database user has CREATE privileges${colors.reset}`);
        } else if (error.code === 'ECONNREFUSED') {
            console.log(`\n${colors.yellow}💡 Troubleshooting tips:${colors.reset}`);
            console.log(`${colors.yellow}  • Make sure MySQL server is running${colors.reset}`);
            console.log(`${colors.yellow}  • Check if MySQL is listening on the correct port${colors.reset}`);
            console.log(`${colors.yellow}  • Verify host and port in .env file${colors.reset}`);
        }
        
        process.exit(1);
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

// Command line help
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
    console.log(`
${colors.bright}ZKTeco Database Migration Script${colors.reset}

This script creates the database and all required tables for the ZKTeco sync server.

Usage:
  node migrate.js                    # Run migration
  npm run migrate                    # Same as above (if script is added to package.json)

Prerequisites:
  1. Configure .env file with database credentials
  2. Ensure MySQL server is running
  3. Database user must have CREATE privileges

The script will:
  ✓ Create database if it doesn't exist
  ✓ Create all required tables
  ✓ Add foreign key constraints
  ✓ Create performance indexes
  ✓ Verify the migration was successful

Safe to run multiple times - uses IF NOT EXISTS checks.
`);
    process.exit(0);
}

// Run migration
if (require.main === module) {
    migrate().catch(console.error);
}

module.exports = { 
    migrate, 
    SCHEMA,
    createDatabaseSQL: (dbName) => `CREATE DATABASE IF NOT EXISTS \`${dbName}\``
}; 
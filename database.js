const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class Database {
    constructor(dbPath = './database/zkpush.db') {
        this.dbPath = dbPath;
        this.db = null;
    }

    async initialize() {
        return new Promise((resolve, reject) => {
            this.db = new sqlite3.Database(this.dbPath, (err) => {
                if (err) {
                    reject(err);
                    return;
                }
                console.log('Connected to SQLite database');
                this.createTables()
                    .then(resolve)
                    .catch(reject);
            });
        });
    }

    async createTables() {
        const tables = [
            // Devices table
            `CREATE TABLE IF NOT EXISTS devices (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                serial_number TEXT UNIQUE NOT NULL,
                push_version TEXT,
                language TEXT,
                push_comm_key TEXT,
                firmware_version TEXT,
                ip_address TEXT,
                fingerprint_algorithm TEXT,
                face_algorithm TEXT,
                device_info TEXT,
                config TEXT,
                last_seen DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,

            // Users table
            `CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                pin TEXT NOT NULL,
                name TEXT,
                privilege INTEGER DEFAULT 0,
                password TEXT,
                card TEXT,
                group_id INTEGER DEFAULT 1,
                time_zone TEXT DEFAULT '0000000000000000',
                verify_mode INTEGER DEFAULT -1,
                vice_card TEXT,
                device_serial TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (device_serial) REFERENCES devices (serial_number)
            )`,

            // Fingerprint templates table
            `CREATE TABLE IF NOT EXISTS fingerprint_templates (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                pin TEXT NOT NULL,
                fid INTEGER NOT NULL,
                size INTEGER,
                valid INTEGER DEFAULT 1,
                template_data TEXT,
                device_serial TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (device_serial) REFERENCES devices (serial_number),
                UNIQUE(pin, fid, device_serial)
            )`,

            // Face templates table
            `CREATE TABLE IF NOT EXISTS face_templates (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                pin TEXT NOT NULL,
                fid INTEGER NOT NULL,
                size INTEGER,
                valid INTEGER DEFAULT 1,
                template_data TEXT,
                device_serial TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (device_serial) REFERENCES devices (serial_number),
                UNIQUE(pin, fid, device_serial)
            )`,

            // Finger vein templates table
            `CREATE TABLE IF NOT EXISTS finger_vein_templates (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                pin TEXT NOT NULL,
                fid INTEGER NOT NULL,
                index_num INTEGER NOT NULL,
                size INTEGER,
                valid INTEGER DEFAULT 1,
                template_data TEXT,
                device_serial TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (device_serial) REFERENCES devices (serial_number),
                UNIQUE(pin, fid, index_num, device_serial)
            )`,

            // Unified bio templates table (BIODATA)
            `CREATE TABLE IF NOT EXISTS bio_templates (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                pin TEXT NOT NULL,
                bio_no INTEGER DEFAULT 0,
                index_num INTEGER DEFAULT 0,
                valid INTEGER DEFAULT 1,
                duress INTEGER DEFAULT 0,
                type INTEGER NOT NULL,
                major_ver INTEGER,
                minor_ver INTEGER,
                format INTEGER DEFAULT 0,
                template_data TEXT,
                device_serial TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (device_serial) REFERENCES devices (serial_number),
                UNIQUE(pin, bio_no, index_num, type, device_serial)
            )`,

            // User photos table
            `CREATE TABLE IF NOT EXISTS user_photos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                pin TEXT NOT NULL,
                filename TEXT,
                size INTEGER,
                content TEXT,
                device_serial TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (device_serial) REFERENCES devices (serial_number),
                UNIQUE(pin, device_serial)
            )`,

            // Comparison photos table (BIOPHOTO)
            `CREATE TABLE IF NOT EXISTS comparison_photos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                pin TEXT NOT NULL,
                filename TEXT,
                type INTEGER NOT NULL,
                size INTEGER,
                content TEXT,
                device_serial TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (device_serial) REFERENCES devices (serial_number),
                UNIQUE(pin, type, device_serial)
            )`,

            // Work codes table
            `CREATE TABLE IF NOT EXISTS work_codes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                pin TEXT NOT NULL,
                code TEXT NOT NULL,
                name TEXT,
                device_serial TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (device_serial) REFERENCES devices (serial_number),
                UNIQUE(pin, device_serial)
            )`,

            // Short messages table
            `CREATE TABLE IF NOT EXISTS short_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                uid INTEGER NOT NULL,
                msg TEXT NOT NULL,
                tag INTEGER NOT NULL,
                min_duration INTEGER,
                start_time DATETIME,
                device_serial TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (device_serial) REFERENCES devices (serial_number),
                UNIQUE(uid, device_serial)
            )`,

            // User SMS associations
            `CREATE TABLE IF NOT EXISTS user_sms (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                pin TEXT NOT NULL,
                uid INTEGER NOT NULL,
                device_serial TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (device_serial) REFERENCES devices (serial_number),
                UNIQUE(pin, uid, device_serial)
            )`,

            // ID Card information table
            `CREATE TABLE IF NOT EXISTS id_cards (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                pin TEXT,
                sn_num TEXT,
                id_num TEXT NOT NULL,
                dn_num TEXT,
                name TEXT,
                gender INTEGER,
                nation INTEGER,
                birthday TEXT,
                valid_info TEXT,
                address TEXT,
                additional_info TEXT,
                issuer TEXT,
                photo TEXT,
                fp_template1 TEXT,
                fp_template2 TEXT,
                reserve TEXT,
                notice TEXT,
                device_serial TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (device_serial) REFERENCES devices (serial_number),
                UNIQUE(id_num, device_serial)
            )`,

            // Commands table
            `CREATE TABLE IF NOT EXISTS commands (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                command_id TEXT UNIQUE NOT NULL,
                device_serial TEXT NOT NULL,
                command_type TEXT NOT NULL,
                command_data TEXT NOT NULL,
                status TEXT DEFAULT 'pending',
                result TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                executed_at DATETIME,
                FOREIGN KEY (device_serial) REFERENCES devices (serial_number)
            )`,

            // Device configurations
            `CREATE TABLE IF NOT EXISTS device_configs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                device_serial TEXT NOT NULL,
                config_key TEXT NOT NULL,
                config_value TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (device_serial) REFERENCES devices (serial_number),
                UNIQUE(device_serial, config_key)
            )`,

            // Sync log for tracking data synchronization
            `CREATE TABLE IF NOT EXISTS sync_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                source_device TEXT NOT NULL,
                target_device TEXT,
                data_type TEXT NOT NULL,
                data_id TEXT NOT NULL,
                action TEXT NOT NULL,
                status TEXT DEFAULT 'pending',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                synced_at DATETIME,
                FOREIGN KEY (source_device) REFERENCES devices (serial_number)
            )`
        ];

        for (const table of tables) {
            await this.run(table);
        }

        // Create indexes for better performance
        const indexes = [
            'CREATE INDEX IF NOT EXISTS idx_users_pin ON users(pin)',
            'CREATE INDEX IF NOT EXISTS idx_users_device ON users(device_serial)',
            'CREATE INDEX IF NOT EXISTS idx_fingerprint_pin ON fingerprint_templates(pin)',
            'CREATE INDEX IF NOT EXISTS idx_face_pin ON face_templates(pin)',
            'CREATE INDEX IF NOT EXISTS idx_bio_pin ON bio_templates(pin)',
            'CREATE INDEX IF NOT EXISTS idx_commands_device ON commands(device_serial)',
            'CREATE INDEX IF NOT EXISTS idx_commands_status ON commands(status)',
            'CREATE INDEX IF NOT EXISTS idx_sync_log_source ON sync_log(source_device)',
            'CREATE INDEX IF NOT EXISTS idx_sync_log_status ON sync_log(status)'
        ];

        for (const index of indexes) {
            await this.run(index);
        }

        console.log('Database tables created successfully');
    }

    async run(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function(err) {
                if (err) {
                    reject(err);
                    return;
                }
                resolve({ id: this.lastID, changes: this.changes });
            });
        });
    }

    async get(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.get(sql, params, (err, row) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(row);
            });
        });
    }

    async all(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.all(sql, params, (err, rows) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(rows);
            });
        });
    }

    async transaction(operations) {
        return new Promise((resolve, reject) => {
            this.db.serialize(() => {
                this.db.run('BEGIN TRANSACTION');
                
                let hasError = false;
                const results = [];
                
                const executeOperations = async () => {
                    try {
                        for (const operation of operations) {
                            const result = await this.run(operation.sql, operation.params);
                            results.push(result);
                        }
                        
                        this.db.run('COMMIT', (err) => {
                            if (err) {
                                reject(err);
                            } else {
                                resolve(results);
                            }
                        });
                    } catch (error) {
                        this.db.run('ROLLBACK', () => {
                            reject(error);
                        });
                    }
                };
                
                executeOperations();
            });
        });
    }

    async close() {
        if (this.db) {
            return new Promise((resolve) => {
                this.db.close((err) => {
                    if (err) {
                        console.error('Error closing database:', err);
                    }
                    console.log('Database connection closed');
                    resolve();
                });
            });
        }
    }
}

module.exports = Database; 
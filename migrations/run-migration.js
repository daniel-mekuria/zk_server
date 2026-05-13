#!/usr/bin/env node

/**
 * Database Migration Runner
 * 
 * This script runs the timezone fix migration to update all devices
 * with hardcoded timezone value '9' to '0' (GMT).
 */

const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const DB_PATH = './database/zkpush.db';
const MIGRATION_FILE = path.join(__dirname, 'fix-timezone-hardcoded-value.sql');

async function runMigration() {
    console.log('🔧 Starting database migration: Fix timezone hardcoded value');
    console.log(`📁 Database: ${DB_PATH}`);
    console.log(`📄 Migration file: ${MIGRATION_FILE}`);
    console.log('');

    // Check if database exists
    if (!fs.existsSync(DB_PATH)) {
        console.log('⚠️  Database file does not exist yet.');
        console.log('   The migration will be applied automatically when devices are registered.');
        console.log('   New devices will receive timeZone: "0" (GMT) by default.');
        return;
    }

    // Read migration SQL
    const migrationSQL = fs.readFileSync(MIGRATION_FILE, 'utf8');
    
    // Split SQL statements (simple split by semicolon)
    const statements = migrationSQL
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('--'));

    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(DB_PATH, (err) => {
            if (err) {
                console.error('❌ Error connecting to database:', err);
                reject(err);
                return;
            }

            console.log('✅ Connected to database');
            console.log('');

            // Check current state before migration
            db.get(
                "SELECT COUNT(*) as count FROM device_configs WHERE config_key = 'timeZone' AND config_value = '9'",
                (err, row) => {
                    if (err) {
                        console.error('❌ Error checking current state:', err);
                        db.close();
                        reject(err);
                        return;
                    }

                    const affectedCount = row ? row.count : 0;
                    console.log(`📊 Devices with hardcoded timezone '9': ${affectedCount}`);
                    console.log('');

                    if (affectedCount === 0) {
                        console.log('✅ No devices need migration. All devices already have correct timezone configuration.');
                        db.close();
                        resolve();
                        return;
                    }

                    // Calculate server timezone offset
                    const serverTimezoneOffset = Math.round(-new Date().getTimezoneOffset() / 60);
                    console.log(`🌍 Server timezone offset: GMT${serverTimezoneOffset >= 0 ? '+' : ''}${serverTimezoneOffset}`);
                    console.log('');

                    // Run migration
                    console.log('🔄 Running migration...');
                    
                    db.run(
                        `UPDATE device_configs SET config_value = '${serverTimezoneOffset}', updated_at = CURRENT_TIMESTAMP WHERE config_key = 'timeZone' AND config_value = '9'`,
                        function(err) {
                            if (err) {
                                console.error('❌ Error running migration:', err);
                                db.close();
                                reject(err);
                                return;
                            }

                            console.log(`✅ Migration completed successfully!`);
                            console.log(`   Updated ${this.changes} device configuration(s) to timezone GMT${serverTimezoneOffset >= 0 ? '+' : ''}${serverTimezoneOffset}`);
                            console.log('');

                            // Verify the migration
                            db.all(
                                "SELECT device_serial, config_key, config_value, updated_at FROM device_configs WHERE config_key = 'timeZone' ORDER BY updated_at DESC",
                                (err, rows) => {
                                    if (err) {
                                        console.error('❌ Error verifying migration:', err);
                                        db.close();
                                        reject(err);
                                        return;
                                    }

                                    console.log('📋 Current timezone configurations:');
                                    if (rows && rows.length > 0) {
                                        rows.forEach(row => {
                                            const tz = parseInt(row.config_value);
                                            const tzDisplay = `GMT${tz >= 0 ? '+' : ''}${tz}`;
                                            console.log(`   - Device: ${row.device_serial}, TimeZone: ${tzDisplay}, Updated: ${row.updated_at}`);
                                        });
                                    } else {
                                        console.log('   (No devices configured yet)');
                                    }
                                    console.log('');
                                    console.log('✅ Migration verification complete!');
                                    console.log('');
                                    console.log('📝 Next steps:');
                                    console.log(`   1. Devices will receive TimeZone=${serverTimezoneOffset} on their next initialization request`);
                                    console.log('   2. Devices will display local server time (matching your server timezone)');
                                    console.log('   3. Time display will automatically adjust if server is migrated to a different timezone');

                                    db.close((err) => {
                                        if (err) {
                                            console.error('❌ Error closing database:', err);
                                            reject(err);
                                        } else {
                                            resolve();
                                        }
                                    });
                                }
                            );
                        }
                    );
                }
            );
        });
    });
}

// Run migration
runMigration()
    .then(() => {
        console.log('');
        console.log('🎉 Migration process completed successfully!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('');
        console.error('❌ Migration failed:', error);
        process.exit(1);
    });

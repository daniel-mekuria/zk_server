# Database Migration: Fix Timezone Hardcoded Value

## Overview

This migration fixes the time synchronization bug where ZKTeco attendance devices display incorrect time. The bug was caused by a hardcoded timezone value '9' from a previous server location that was not updated when the server was migrated to a new timezone (GMT+3 / EAT).

## ⚡ AUTOMATIC MIGRATION

**This migration now runs AUTOMATICALLY on server startup!**

The server will automatically:
1. Detect devices with hardcoded timezone '9'
2. Update them to the server's local timezone (GMT+3 for EAT)
3. Log the number of devices updated

**You don't need to run any manual migration commands.**

## What This Migration Does

1. **Updates existing device configurations**: Changes all device configurations with `timeZone = '9'` to the server's local timezone (e.g., `'3'` for GMT+3)
2. **Preserves custom configurations**: Only updates devices with the hardcoded default value '9', leaving custom timezone configurations unchanged
3. **Enables consistent time display**: Ensures all devices display the server's local time

## Files

- `fix-timezone-hardcoded-value.sql` - SQL migration script (for reference)
- `run-migration.js` - Manual migration script (optional, for manual runs)
- `README.md` - This file

## How It Works

### Automatic Migration (Default)

When you start the server:

```bash
node server.js
```

The server will automatically:
```
🔧 Running automatic timezone migration...
✅ Timezone migration complete: Updated 5 device(s) from timezone '9' to '3' (GMT+3)
   Devices will sync to server's local time on next initialization
```

### Manual Migration (Optional)

If you want to run the migration manually:

```bash
node migrations/run-migration.js
```

## Expected Results

### Before Migration

Devices with hardcoded timezone value:
```
device_serial: DEVICE-001, config_key: timeZone, config_value: 9
device_serial: DEVICE-002, config_key: timeZone, config_value: 9
```

### After Migration

All devices updated to server's local timezone (GMT+3):
```
device_serial: DEVICE-001, config_key: timeZone, config_value: 3
device_serial: DEVICE-002, config_key: timeZone, config_value: 3
```

Devices with custom timezone configurations are preserved:
```
device_serial: DEVICE-003, config_key: timeZone, config_value: 5  (unchanged)
```

## Impact

### Immediate Impact
- Existing devices will receive `TimeZone=3` (or server's timezone) on their next initialization request
- Devices will display the same time as the server (e.g., 12:16 PM when server shows 12:16 PM)

### Long-term Benefits
- Automatic migration on every server restart ensures consistency
- Server timezone changes are automatically applied to devices
- No manual intervention required

## Verification

After server starts, verify the changes:

```sql
-- Check all timezone configurations
SELECT device_serial, config_key, config_value, updated_at 
FROM device_configs 
WHERE config_key = 'timeZone' 
ORDER BY updated_at DESC;

-- Count devices with each timezone value
SELECT config_value, COUNT(*) as count 
FROM device_configs 
WHERE config_key = 'timeZone' 
GROUP BY config_value;
```

## Example: Current Time Display

**Server Time: 12:16 PM EAT (GMT+3)**

| Before Fix | After Fix |
|------------|-----------|
| Server: 12:16 PM | Server: 12:16 PM |
| Machine: 5:16 PM ❌ | Machine: 12:16 PM ✅ |
| Difference: +5 hours | Difference: 0 hours |

## Related Changes

This migration is part of a larger fix that includes:

1. **deviceManager.js**: Changed default timezone calculation to use server's local timezone
2. **commandManager.js**: Removed incorrect +1 offset from timezone calculation
3. **server.js**: Added automatic migration on startup + changed default fallback to server's timezone
4. **Database migration**: Updates existing devices automatically

## Testing

The fix includes comprehensive property-based tests:

```bash
npm test -- time-sync-fix.test.js
```

Tests verify:
- Bug condition: Devices receive correct TimeZone and display server's local time
- Preservation: Non-timezone configurations and custom timezones are unchanged

## Support

If you encounter any issues:

1. Check server startup logs for migration status
2. Verify database permissions: Ensure the database file is writable
3. Check device configurations: Use the SQL queries above
4. Restart server to re-run migration if needed

## References

- Bug Report: Time synchronization issue (devices showing incorrect time)
- Design Document: `.kiro/specs/time-sync-fix/design.md`
- Requirements: `.kiro/specs/time-sync-fix/bugfix.md`
- Tasks: `.kiro/specs/time-sync-fix/tasks.md`

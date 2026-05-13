-- Migration: Fix hardcoded timezone value from '9' to server's local timezone
-- Date: 2024
-- Description: Updates all device configurations that have the hardcoded timezone value '9'
--              from the previous server location to '3' (GMT+3 for Africa/Addis_Ababa)
--              for consistent local time display. This fixes existing devices without 
--              requiring re-registration.

-- Update all devices with hardcoded timezone value '9' to '3' (GMT+3)
UPDATE device_configs 
SET config_value = '3', 
    updated_at = CURRENT_TIMESTAMP 
WHERE config_key = 'timeZone' 
  AND config_value = '9';

-- Display the number of affected rows
SELECT changes() AS 'Rows Updated';

-- Verify the update
SELECT device_serial, config_key, config_value, updated_at 
FROM device_configs 
WHERE config_key = 'timeZone' 
ORDER BY updated_at DESC;

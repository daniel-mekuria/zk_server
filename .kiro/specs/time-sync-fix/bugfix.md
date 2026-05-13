# Bugfix Requirements Document

## Introduction

The ZKTeco attendance machines are displaying time 8 hours ahead of GMT (or 5 hours ahead of the server's local time in GMT+3 timezone). When the server's local time is 1:35 PM (13:35) and GMT time is 10:35 AM, the devices show 6:35 PM (18:35). This bug affects all connected attendance machines and causes incorrect time display on the devices, potentially impacting attendance record timestamps and user experience.

**Context**: This issue started after migrating the server from a previous location (likely GMT+8 or GMT+9 timezone) to a new location (Africa/Addis_Ababa, GMT+3 timezone). The bug has two root causes:

1. **Hardcoded timezone value**: The `deviceManager.js` file contains a hardcoded `timeZone: '9'` in the default device configuration, which was likely correct for the previous server location but is now incorrect.

2. **Incorrect timezone calculation**: The `commandManager.js` file has an incorrect calculation `Math.round(-new Date().getTimezoneOffset() / 60) + 1` which adds an extra hour to the timezone offset.

The time synchronization mechanism works as follows: the server sends an HTTP Date header in GMT format and a TimeZone parameter. Devices calculate their display time by adding the TimeZone offset to the GMT time from the Date header.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a new device is registered THEN the system initializes the device configuration with a hardcoded `timeZone` value of '9' (from previous server location)

1.2 WHEN the server builds the initialization response for a device THEN the system uses `config.timeZone || serverTimezoneOffset`, which returns the stored hardcoded value '9' instead of calculating the current server timezone

1.3 WHEN the time synchronization command is executed THEN the system calculates timezone as `Math.round(-new Date().getTimezoneOffset() / 60) + 1`, which incorrectly adds an extra hour

1.4 WHEN devices receive the Date header (GMT time: 10:35 AM) and TimeZone parameter (value: 8 or 9) THEN the devices add the TimeZone offset to GMT time, resulting in 18:35 (6:35 PM) or 19:35 (7:35 PM)

1.5 WHEN the server is in GMT+3 timezone (Africa/Addis_Ababa) and local time is 13:35 (1:35 PM) THEN the devices display 18:35 (6:35 PM), which is 5 hours ahead of local time or 8 hours ahead of GMT

### Expected Behavior (Correct)

2.1 WHEN a new device is registered THEN the system SHALL initialize the device configuration with `timeZone` value of 0 (GMT) instead of a hardcoded value from a previous server location

2.2 WHEN the server builds the initialization response for a device THEN the system SHALL use `config.timeZone || 0` to default to GMT timezone when no device-specific timezone is configured

2.3 WHEN the time synchronization command is executed THEN the system SHALL calculate timezone as `Math.round(-new Date().getTimezoneOffset() / 60)` without adding any extra offset

2.4 WHEN devices receive the Date header (GMT time) and TimeZone=0 THEN the devices SHALL display the GMT time without adding any offset

2.5 WHEN the server is in GMT+3 timezone and GMT time is 10:35 AM THEN the devices SHALL display 10:35 AM (GMT time) without adding timezone offset

2.6 WHEN existing devices have incorrect hardcoded timezone values in the database THEN the system SHALL provide a mechanism to update or reset these values to 0

### Unchanged Behavior (Regression Prevention)

3.1 WHEN the server sends the Date header in GMT format THEN the system SHALL CONTINUE TO use `new Date().toUTCString()` to generate the Date header

3.2 WHEN the server responds to device initialization requests at `/iclock/cdata` THEN the system SHALL CONTINUE TO include the TimeZone parameter in the response

3.3 WHEN the server sets HTTP response headers THEN the system SHALL CONTINUE TO set the Date header for all responses (initialization, data upload, command requests, heartbeat)

3.4 WHEN devices connect and register with the server THEN the system SHALL CONTINUE TO process device registration and configuration exchange normally

3.5 WHEN the server builds the initialization response THEN the system SHALL CONTINUE TO include all required configuration parameters (Stamps, ErrorDelay, Delay, TransTimes, TransInterval, TransFlag, Realtime, Encrypt, ServerVer, PushProtVer, etc.)

3.6 WHEN a device already has a custom timezone configuration (not the hardcoded default) THEN the system SHALL CONTINUE TO respect that custom configuration

3.7 WHEN device configuration is retrieved from the database THEN the system SHALL CONTINUE TO use the `device_configs` table to store and retrieve per-device configuration

## Bug Condition and Property

### Bug Condition Function

```pascal
FUNCTION isBugCondition(X)
  INPUT: X of type DeviceConfig
  OUTPUT: boolean
  
  // Returns true when device has hardcoded timezone value from previous server location
  // OR when timezone calculation includes incorrect +1 offset
  RETURN (X.timeZone = '9' AND X.isHardcodedDefault = true) OR
         (X.timezoneCalculation_includes_plus_one = true)
END FUNCTION
```

### Property Specification - Fix Checking

```pascal
// Property: Fix Checking - TimeZone Configuration Correction
FOR ALL X WHERE isBugCondition(X) DO
  newTimeZone ← getDeviceTimeZone'(X)
  calculatedOffset ← calculateTimezoneOffset'(X)
  
  ASSERT newTimeZone = 0 AND 
         calculatedOffset_excludes_plus_one(X) = true AND
         device_displays_GMT_time(X) = true
END FOR
```

**Key Definitions:**
- **F1**: The original hardcoded timezone initialization - `{ key: 'timeZone', value: '9' }`
- **F1'**: The fixed timezone initialization - `{ key: 'timeZone', value: '0' }`
- **F2**: The original timezone calculation - `Math.round(-new Date().getTimezoneOffset() / 60) + 1`
- **F2'**: The fixed timezone calculation - `Math.round(-new Date().getTimezoneOffset() / 60)`

### Preservation Goal

```pascal
// Property: Preservation Checking
FOR ALL X WHERE NOT isBugCondition(X) DO
  // For devices with custom (non-default) timezone configurations
  ASSERT F1(X) = F1'(X) AND F2(X) = F2'(X)
END FOR
```

This ensures that for devices with custom timezone configurations (not the hardcoded default), the behavior remains unchanged.

### Counterexample

**Concrete example demonstrating the bug:**

**Scenario: Server Migration from GMT+9 to GMT+3**

- **Previous Server Location**: GMT+9 timezone (e.g., Asia/Tokyo, Asia/Seoul)
- **New Server Location**: GMT+3 timezone (Africa/Addis_Ababa)
- **Current GMT Time**: 10:35 AM
- **Current Server Local Time**: 13:35 (1:35 PM) = 10:35 + 3 hours

**Current Buggy Behavior**:

1. **Device Registration**:
   - New device registers with server
   - `initializeDeviceConfig()` sets `timeZone: '9'` (hardcoded from previous location)
   - Database stores: `device_configs.config_value = '9'` for `config_key = 'timeZone'`

2. **Initialization Response**:
   - Server builds response: `TimeZone=${config.timeZone || serverTimezoneOffset}`
   - Since `config.timeZone = '9'` exists, it uses '9'
   - Response sent: `TimeZone=9`

3. **Device Calculation**:
   - Date header: `Date: [Day], [Date] 10:35:00 GMT`
   - TimeZone parameter: `9`
   - Device calculates: `10:35 + 9 hours = 19:35 (7:35 PM)`
   - **But user reports 18:35 (6:35 PM), suggesting TimeZone=8 is being used**

4. **Time Sync Command** (if executed):
   - `commandManager.js` line 730: `Math.round(-new Date().getTimezoneOffset() / 60) + 1`
   - For GMT+3: `getTimezoneOffset() = -180` minutes
   - Calculation: `Math.round(-(-180) / 60) + 1 = 3 + 1 = 4`
   - This would send `TimeZone=4`, but the hardcoded '9' takes precedence

**Root Cause Analysis**:
- The hardcoded `timeZone: '9'` from the previous server location (GMT+9) is stored in the database
- When devices initialize, they receive this incorrect timezone value
- Devices add 8-9 hours to GMT time instead of 0 hours
- Result: Devices show 18:35-19:35 instead of 10:35 (GMT) or 13:35 (local)

**Expected Correct Behavior**:

1. **Device Registration**:
   - New device registers with server
   - `initializeDeviceConfig()` sets `timeZone: '0'` (GMT)
   - Database stores: `device_configs.config_value = '0'`

2. **Initialization Response**:
   - Server builds response: `TimeZone=${config.timeZone || 0}`
   - Response sent: `TimeZone=0`

3. **Device Calculation**:
   - Date header: `Date: [Day], [Date] 10:35:00 GMT`
   - TimeZone parameter: `0`
   - Device calculates: `10:35 + 0 hours = 10:35 AM` ✓

4. **Time Sync Command** (if executed):
   - Calculation: `Math.round(-new Date().getTimezoneOffset() / 60)` (no +1)
   - For GMT+3: `Math.round(-(-180) / 60) = 3`
   - But since we want GMT display, we should send `TimeZone=0` instead

**Note**: The fix should set TimeZone=0 to display GMT time on all devices, regardless of the server's local timezone. This ensures consistent time display across all devices and prevents issues when servers are migrated between timezones.

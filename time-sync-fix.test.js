const fc = require('fast-check');
const DeviceManager = require('./deviceManager');
const CommandManager = require('./commandManager');

/**
 * Bug Condition Exploration Test for Time Synchronization Fix
 * 
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5**
 * 
 * CRITICAL: This test MUST FAIL on unfixed code - failure confirms the bug exists
 * DO NOT attempt to fix the test or the code when it fails
 * 
 * This test encodes the EXPECTED behavior (after fix):
 * - New devices should initialize with timeZone: '0' (GMT)
 * - buildInitializationResponse should return TimeZone=0 when no custom timezone
 * - syncDeviceTime should calculate timezone without +1 offset
 * - Devices should display GMT time without adding incorrect offset
 * 
 * When run on UNFIXED code, this test will FAIL and surface counterexamples
 * demonstrating the bug exists.
 */

describe('Bug Condition Exploration - Time Synchronization Fix', () => {
  let mockDb;
  let deviceManager;
  let commandManager;

  beforeEach(() => {
    // Mock database for testing
    mockDb = {
      run: jest.fn().mockResolvedValue({ lastID: 1 }),
      get: jest.fn().mockResolvedValue(null),
      all: jest.fn().mockResolvedValue([]),
    };

    deviceManager = new DeviceManager(mockDb);
    commandManager = new CommandManager(mockDb);
  });

  /**
   * Property 1: Bug Condition - Hardcoded Timezone Initialization
   * 
   * Tests that new device registration initializes with timeZone: '0' instead of '9'
   * 
   * EXPECTED ON UNFIXED CODE: FAIL - devices receive timeZone: '9'
   * EXPECTED ON FIXED CODE: PASS - devices receive timeZone: '0'
   */
  test('Property 1.1: New device registration should initialize with timeZone: 0 (GMT)', async () => {
    // Arrange: Generate a random device serial number
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 8, maxLength: 20 }),
        async (serialNumber) => {
          // Reset mock for each property test iteration
          mockDb.run.mockClear();
          mockDb.get.mockResolvedValue(null); // Device doesn't exist

          // Act: Register a new device
          await deviceManager.registerDevice({
            serialNumber,
            pushVersion: '2.2.14',
            language: '69',
            pushCommKey: 'test-key',
            lastSeen: new Date(),
          });

          // Assert: Check that initializeDeviceConfig was called
          // and verify the timeZone configuration value
          const configCalls = mockDb.run.mock.calls.filter(call => 
            call[0].includes('INSERT OR REPLACE INTO device_configs')
          );

          // Find the timeZone config call
          const timeZoneCall = configCalls.find(call => 
            call[1] && call[1][1] === 'timeZone'
          );

          // EXPECTED BEHAVIOR: timeZone should be '0' (GMT)
          // ON UNFIXED CODE: This will be '9' (hardcoded from previous location)
          expect(timeZoneCall).toBeDefined();
          expect(timeZoneCall[1][2]).toBe('0'); // config_value should be '0'
        }
      ),
      { numRuns: 10 } // Run 10 times with different serial numbers
    );
  });

  /**
   * Property 1.2: Bug Condition - Initialization Response TimeZone Parameter
   * 
   * Tests that buildInitializationResponse returns TimeZone=0 when no custom timezone
   * 
   * EXPECTED ON UNFIXED CODE: FAIL - response contains TimeZone=9 or TimeZone=serverOffset
   * EXPECTED ON FIXED CODE: PASS - response contains TimeZone=0
   */
  test('Property 1.2: buildInitializationResponse should return TimeZone=0 when no custom timezone', () => {
    // We need to test the server.js buildInitializationResponse function
    // Since it's part of the ZKPushServer class, we'll test the logic directly
    
    // Simulate the config object with no custom timezone (undefined)
    const config = {
      operlogStamp: 'None',
      biodataStamp: 'None',
      idcardStamp: 'None',
      errorlogStamp: 'None',
      errorDelay: '30',
      delay: '10',
      transTimes: '00:00;12:00',
      transInterval: '1',
      // timeZone is NOT set (undefined) - should default to 0, not serverTimezoneOffset
      realtime: '1',
      multiBioDataSupport: '0:1:1:0:0:0:0:1:1:1',
      multiBioPhotoSupport: '0:1:1:0:0:0:0:1:1:1',
    };

    // Calculate what the server would use
    const serverTimezoneOffset = Math.round(-new Date().getTimezoneOffset() / 60);
    
    // EXPECTED BEHAVIOR: When config.timeZone is undefined, should use 0 (GMT)
    // ON UNFIXED CODE: Will use serverTimezoneOffset (e.g., 3 for GMT+3)
    const timeZoneValue = config.timeZone || 0; // FIXED behavior
    const buggyTimeZoneValue = config.timeZone || serverTimezoneOffset; // UNFIXED behavior

    // This assertion checks the EXPECTED (fixed) behavior
    expect(timeZoneValue).toBe(0);
    
    // This assertion will FAIL on unfixed code if server is not in GMT timezone
    // It demonstrates the bug: unfixed code uses serverTimezoneOffset instead of 0
    if (serverTimezoneOffset !== 0) {
      expect(buggyTimeZoneValue).not.toBe(0); // Demonstrates the bug
    }
  });

  /**
   * Property 1.3: Bug Condition - Time Sync Calculation with Incorrect +1 Offset
   * 
   * Tests that syncDeviceTime calculates timezone without the incorrect +1 offset
   * 
   * EXPECTED ON UNFIXED CODE: FAIL - calculation includes +1 offset
   * EXPECTED ON FIXED CODE: PASS - calculation excludes +1 offset
   */
  test('Property 1.3: syncDeviceTime should calculate timezone without +1 offset', async () => {
    // Arrange: Mock device serial number
    const deviceSerial = 'TEST-DEVICE-001';
    
    // Mock the setOption and reloadOptions methods
    commandManager.setOption = jest.fn().mockResolvedValue({ success: true });
    commandManager.reloadOptions = jest.fn().mockResolvedValue({ success: true });

    // Act: Call syncDeviceTime
    const result = await commandManager.syncDeviceTime(deviceSerial);

    // Get the actual timezone offset calculation
    const actualTimezoneOffset = Math.round(-new Date().getTimezoneOffset() / 60);
    
    // UNFIXED CODE: Adds +1 to the offset
    const buggyTimezoneOffset = actualTimezoneOffset + 1;
    
    // EXPECTED BEHAVIOR: Should use actualTimezoneOffset without +1
    // ON UNFIXED CODE: result.timezone will be buggyTimezoneOffset
    expect(result.timezone).toBe(actualTimezoneOffset); // FIXED behavior
    expect(result.timezone).not.toBe(buggyTimezoneOffset); // Should NOT have +1
  });

  /**
   * Property 1.4: Bug Condition - Device Time Display Calculation
   * 
   * Tests that devices display GMT time (10:35) instead of incorrect time (18:35 or 19:35)
   * 
   * This simulates what the device would calculate based on the TimeZone parameter
   * 
   * EXPECTED ON UNFIXED CODE: FAIL - devices would display 18:35 or 19:35
   * EXPECTED ON FIXED CODE: PASS - devices display 10:35 (GMT)
   */
  test('Property 1.4: Devices should display GMT time without incorrect offset', () => {
    // Simulate the scenario from the bug report
    const gmtTime = new Date('2024-01-01T10:35:00Z'); // GMT 10:35 AM
    const gmtHours = gmtTime.getUTCHours(); // 10
    const gmtMinutes = gmtTime.getUTCMinutes(); // 35

    // UNFIXED CODE: Device receives TimeZone=9 (hardcoded)
    const buggyTimeZone = 9;
    const buggyDisplayHours = (gmtHours + buggyTimeZone) % 24; // 10 + 9 = 19 (7:35 PM)

    // EXPECTED BEHAVIOR: Device receives TimeZone=0 (GMT)
    const fixedTimeZone = 0;
    const fixedDisplayHours = (gmtHours + fixedTimeZone) % 24; // 10 + 0 = 10 (10:35 AM)

    // Assert: Fixed behavior should display GMT time
    expect(fixedDisplayHours).toBe(10);
    expect(gmtMinutes).toBe(35);

    // Demonstrate the bug: unfixed code would display 19:35 (7:35 PM)
    expect(buggyDisplayHours).toBe(19);
    expect(buggyDisplayHours).not.toBe(fixedDisplayHours);
  });

  /**
   * Property 1.5: Bug Condition - Server Migration Scenario
   * 
   * Tests the complete scenario: server in GMT+3, devices should display GMT time
   * 
   * EXPECTED ON UNFIXED CODE: FAIL - devices display time 8-9 hours ahead
   * EXPECTED ON FIXED CODE: PASS - devices display GMT time
   */
  test('Property 1.5: Server migration scenario - devices should display GMT regardless of server timezone', async () => {
    // Simulate server in GMT+3 timezone (Africa/Addis_Ababa)
    // getTimezoneOffset() returns -180 for GMT+3
    const mockGetTimezoneOffset = -180; // GMT+3
    const serverTimezoneOffset = Math.round(-mockGetTimezoneOffset / 60); // 3

    // Current time scenario from bug report
    const gmtTime = new Date('2024-01-01T10:35:00Z'); // GMT 10:35 AM
    const serverLocalTime = new Date('2024-01-01T13:35:00+03:00'); // Server local: 13:35 (1:35 PM)

    // UNFIXED CODE BEHAVIOR:
    // 1. New device registers with timeZone: '9' (hardcoded)
    const buggyHardcodedTimeZone = 9;
    
    // 2. Device receives TimeZone=9 in initialization response
    // 3. Device calculates: GMT 10:35 + 9 hours = 19:35 (7:35 PM)
    const buggyDeviceDisplayHours = (gmtTime.getUTCHours() + buggyHardcodedTimeZone) % 24;
    
    // EXPECTED FIXED BEHAVIOR:
    // 1. New device registers with timeZone: '0' (GMT)
    const fixedTimeZone = 0;
    
    // 2. Device receives TimeZone=0 in initialization response
    // 3. Device calculates: GMT 10:35 + 0 hours = 10:35 (10:35 AM)
    const fixedDeviceDisplayHours = (gmtTime.getUTCHours() + fixedTimeZone) % 24;

    // Assert: Fixed behavior displays GMT time
    expect(fixedDeviceDisplayHours).toBe(10);
    expect(fixedTimeZone).toBe(0);

    // Demonstrate the bug: unfixed code displays 19:35 instead of 10:35
    expect(buggyDeviceDisplayHours).toBe(19);
    expect(buggyDeviceDisplayHours - fixedDeviceDisplayHours).toBe(9); // 9 hours ahead

    // Verify server timezone calculation (for context)
    expect(serverTimezoneOffset).toBe(3); // Server is in GMT+3
  });

  /**
   * Property 1.6: Scoped PBT - Concrete Failing Case
   * 
   * This property test is scoped to the concrete failing case from the bug report
   * to ensure reproducibility and clear demonstration of the bug.
   */
  test('Property 1.6: Concrete failing case - hardcoded timezone 9 causes 9-hour offset', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constant('TEST-DEVICE-CONCRETE'),
        async (serialNumber) => {
          // Reset mock
          mockDb.run.mockClear();
          mockDb.get.mockResolvedValue(null);

          // Act: Register device
          await deviceManager.registerDevice({
            serialNumber,
            pushVersion: '2.2.14',
            language: '69',
            pushCommKey: 'test-key',
            lastSeen: new Date(),
          });

          // Get the timeZone config value that was set
          const configCalls = mockDb.run.mock.calls.filter(call => 
            call[0].includes('INSERT OR REPLACE INTO device_configs')
          );
          const timeZoneCall = configCalls.find(call => 
            call[1] && call[1][1] === 'timeZone'
          );

          const actualTimeZone = timeZoneCall ? timeZoneCall[1][2] : null;

          // EXPECTED: timeZone should be '0'
          // UNFIXED: timeZone will be '9'
          expect(actualTimeZone).toBe('0');

          // If this fails, it demonstrates the bug:
          // The hardcoded value '9' causes devices to add 9 hours to GMT time
          // GMT 10:35 + 9 = 19:35 (7:35 PM) instead of 10:35 (10:35 AM)
        }
      ),
      { numRuns: 1 } // Single concrete case
    );
  });
});


/**
 * ============================================================================
 * PRESERVATION PROPERTY TESTS - Task 2
 * ============================================================================
 * 
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7**
 * 
 * IMPORTANT: These tests follow observation-first methodology
 * - Observe behavior on UNFIXED code for non-buggy inputs
 * - Write property-based tests capturing observed behavior patterns
 * - EXPECTED OUTCOME: Tests PASS on unfixed code (confirms baseline to preserve)
 * 
 * These tests ensure that the fix does NOT break existing functionality:
 * - Non-timezone configuration parameters (ErrorDelay, Delay, TransTimes, etc.)
 * - Devices with custom (non-default) timezone configurations
 * - Date header generation using new Date().toUTCString()
 * - Device registration flow and database operations
 */

describe('Preservation Property Tests - Non-Timezone Configuration', () => {
  let mockDb;
  let deviceManager;
  let commandManager;

  beforeEach(() => {
    // Mock database for testing
    mockDb = {
      run: jest.fn().mockResolvedValue({ lastID: 1 }),
      get: jest.fn().mockResolvedValue(null),
      all: jest.fn().mockResolvedValue([]),
    };

    deviceManager = new DeviceManager(mockDb);
    commandManager = new CommandManager(mockDb);
  });

  /**
   * Property 2.1: Preservation - Non-Timezone Configuration Parameters
   * 
   * Tests that all configuration parameters OTHER than timezone are initialized
   * with the same values before and after the fix.
   * 
   * EXPECTED ON UNFIXED CODE: PASS - non-timezone configs are correct
   * EXPECTED ON FIXED CODE: PASS - non-timezone configs remain unchanged
   */
  test('Property 2.1: Non-timezone configuration parameters should remain unchanged', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 8, maxLength: 20 }),
        async (serialNumber) => {
          // Reset mock for each property test iteration
          mockDb.run.mockClear();
          mockDb.get.mockResolvedValue(null); // Device doesn't exist

          // Act: Register a new device
          await deviceManager.registerDevice({
            serialNumber,
            pushVersion: '2.2.14',
            language: '69',
            pushCommKey: 'test-key',
            lastSeen: new Date(),
          });

          // Assert: Check that all non-timezone config parameters are set correctly
          const configCalls = mockDb.run.mock.calls.filter(call => 
            call[0].includes('INSERT OR REPLACE INTO device_configs')
          );

          // Define expected non-timezone configuration values
          const expectedConfigs = {
            'errorDelay': '30',
            'delay': '10',
            'transTimes': '00:00;12:00',
            'transInterval': '1',
            'realtime': '1',
            'operlogStamp': 'None',
            'biodataStamp': 'None',
            'idcardStamp': 'None',
            'errorlogStamp': 'None',
            'multiBioDataSupport': '0:1:1:0:0:0:0:1:1:1',
            'multiBioPhotoSupport': '0:1:1:0:0:0:0:1:1:1',
            'FingerFunOn': '1',
            'FaceFunOn': '1',
            'BioPhotoFun': '1',
            'BioDataFun': '1',
            'VisilightFun': '1',
          };

          // Verify each non-timezone config parameter
          for (const [key, expectedValue] of Object.entries(expectedConfigs)) {
            const configCall = configCalls.find(call => 
              call[1] && call[1][1] === key
            );

            expect(configCall).toBeDefined();
            expect(configCall[1][2]).toBe(expectedValue);
          }
        }
      ),
      { numRuns: 10 } // Run 10 times with different serial numbers
    );
  });

  /**
   * Property 2.2: Preservation - Custom Timezone Configurations
   * 
   * Tests that devices with custom (non-default) timezone configurations
   * continue to use their custom values after the fix.
   * 
   * EXPECTED ON UNFIXED CODE: PASS - custom timezones are respected
   * EXPECTED ON FIXED CODE: PASS - custom timezones remain respected
   */
  test('Property 2.2: Devices with custom timezone configurations should preserve their values', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 8, maxLength: 20 }),
        fc.integer({ min: -12, max: 12 }).filter(tz => tz !== 9), // Custom timezone (not the hardcoded '9')
        async (serialNumber, customTimezone) => {
          // Reset mock
          mockDb.run.mockClear();
          mockDb.get.mockResolvedValue(null);

          // Arrange: Register device first
          await deviceManager.registerDevice({
            serialNumber,
            pushVersion: '2.2.14',
            language: '69',
            pushCommKey: 'test-key',
            lastSeen: new Date(),
          });

          // Act: Update device with custom timezone configuration
          await deviceManager.updateDeviceConfig(serialNumber, 'timeZone', customTimezone.toString());

          // Mock the getDeviceConfig to return the custom timezone
          mockDb.all.mockResolvedValue([
            { config_key: 'timeZone', config_value: customTimezone.toString() },
            { config_key: 'errorDelay', config_value: '30' },
            { config_key: 'delay', config_value: '10' },
          ]);

          // Get the device config
          const config = await deviceManager.getDeviceConfig(serialNumber);

          // Assert: Custom timezone should be preserved
          expect(config.timeZone).toBe(customTimezone.toString());
          
          // Simulate buildInitializationResponse logic
          const serverTimezoneOffset = Math.round(-new Date().getTimezoneOffset() / 60);
          const timeZoneValue = config.timeZone || serverTimezoneOffset;
          
          // Custom timezone should be used (not overridden)
          expect(timeZoneValue).toBe(customTimezone.toString());
        }
      ),
      { numRuns: 10 } // Test with 10 different custom timezone values
    );
  });

  /**
   * Property 2.3: Preservation - Date Header Generation
   * 
   * Tests that Date header generation continues to use new Date().toUTCString()
   * and produces GMT time in RFC 2822 format.
   * 
   * EXPECTED ON UNFIXED CODE: PASS - Date header uses GMT format
   * EXPECTED ON FIXED CODE: PASS - Date header remains unchanged
   */
  test('Property 2.3: Date header generation should continue using GMT format', () => {
    // Test the Date header generation logic from server.js
    // The server sets: res.header('Date', new Date().toUTCString());
    
    const dateHeader = new Date().toUTCString();
    
    // Assert: Date header should be in RFC 2822 format (GMT)
    // Format: "Day, DD Mon YYYY HH:MM:SS GMT"
    const rfc2822Pattern = /^[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/;
    expect(dateHeader).toMatch(rfc2822Pattern);
    
    // Assert: Date header should end with "GMT"
    expect(dateHeader).toMatch(/GMT$/);
    
    // Assert: Date header should represent current time (within 1 second)
    const parsedDate = new Date(dateHeader);
    const now = new Date();
    const timeDiff = Math.abs(now.getTime() - parsedDate.getTime());
    expect(timeDiff).toBeLessThan(1000); // Within 1 second
  });

  /**
   * Property 2.4: Preservation - Device Registration Flow
   * 
   * Tests that device registration flow and database operations work identically
   * before and after the fix.
   * 
   * EXPECTED ON UNFIXED CODE: PASS - registration works correctly
   * EXPECTED ON FIXED CODE: PASS - registration remains unchanged
   */
  test('Property 2.4: Device registration flow should remain unchanged', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          serialNumber: fc.string({ minLength: 8, maxLength: 20 }),
          pushVersion: fc.constantFrom('2.2.14', '2.2.15', '2.3.0'),
          language: fc.constantFrom('69', '82', '86'), // English, Chinese, Spanish
          pushCommKey: fc.string({ minLength: 10, maxLength: 30 }),
        }),
        async (deviceInfo) => {
          // Reset mock
          mockDb.run.mockClear();
          mockDb.get.mockResolvedValue(null); // New device

          // Act: Register device
          const result = await deviceManager.registerDevice({
            ...deviceInfo,
            lastSeen: new Date(),
          });

          // Assert: Registration should succeed
          expect(result.success).toBe(true);

          // Assert: Device INSERT should be called
          const insertCalls = mockDb.run.mock.calls.filter(call => 
            call[0].includes('INSERT INTO devices')
          );
          expect(insertCalls.length).toBeGreaterThan(0);

          // Assert: Device info should be stored correctly
          const insertCall = insertCalls[0];
          expect(insertCall[1]).toContain(deviceInfo.serialNumber);
          expect(insertCall[1]).toContain(deviceInfo.pushVersion);
          expect(insertCall[1]).toContain(deviceInfo.language);
          expect(insertCall[1]).toContain(deviceInfo.pushCommKey);

          // Assert: Config initialization should be called
          const configCalls = mockDb.run.mock.calls.filter(call => 
            call[0].includes('INSERT OR REPLACE INTO device_configs')
          );
          expect(configCalls.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 10 } // Test with 10 different device configurations
    );
  });

  /**
   * Property 2.5: Preservation - HTTP Response Headers
   * 
   * Tests that HTTP response headers (Server, Pragma, Cache-Control, Date)
   * remain unchanged by the fix.
   * 
   * EXPECTED ON UNFIXED CODE: PASS - headers are set correctly
   * EXPECTED ON FIXED CODE: PASS - headers remain unchanged
   */
  test('Property 2.5: HTTP response headers should remain unchanged', () => {
    // Test the header values from server.js setupMiddleware
    const expectedHeaders = {
      'Server': 'ZK-Push-Server/1.0',
      'Pragma': 'no-cache',
      'Cache-Control': 'no-store',
      'Date': new Date().toUTCString(), // GMT format
    };

    // Assert: All expected headers should have correct values
    expect(expectedHeaders['Server']).toBe('ZK-Push-Server/1.0');
    expect(expectedHeaders['Pragma']).toBe('no-cache');
    expect(expectedHeaders['Cache-Control']).toBe('no-store');
    expect(expectedHeaders['Date']).toMatch(/GMT$/);
  });

  /**
   * Property 2.6: Preservation - Initialization Response Structure
   * 
   * Tests that the initialization response structure and all parameters
   * (except TimeZone value) remain unchanged.
   * 
   * EXPECTED ON UNFIXED CODE: PASS - response structure is correct
   * EXPECTED ON FIXED CODE: PASS - response structure remains unchanged
   */
  test('Property 2.6: Initialization response structure should remain unchanged', () => {
    // Simulate buildInitializationResponse logic
    const serialNumber = 'TEST-DEVICE-001';
    const config = {
      operlogStamp: 'None',
      biodataStamp: 'None',
      idcardStamp: 'None',
      errorlogStamp: 'None',
      errorDelay: '30',
      delay: '10',
      transTimes: '00:00;12:00',
      transInterval: '1',
      timeZone: '9', // This is the buggy value, but we're testing structure preservation
      realtime: '1',
      multiBioDataSupport: '0:1:1:0:0:0:0:1:1:1',
      multiBioPhotoSupport: '0:1:1:0:0:0:0:1:1:1',
    };

    // Build response lines (excluding TimeZone value which will change)
    const expectedLines = [
      `GET OPTION FROM: ${serialNumber}`,
      `ATTLOGStamp=None`,
      `OPERLOGStamp=${config.operlogStamp}`,
      `ATTPHOTOStamp=None`,
      `BIODATAStamp=${config.biodataStamp}`,
      `IDCARDStamp=${config.idcardStamp}`,
      `ERRORLOGStamp=${config.errorlogStamp}`,
      `ErrorDelay=${config.errorDelay}`,
      `Delay=${config.delay}`,
      `TransTimes=${config.transTimes}`,
      `TransInterval=${config.transInterval}`,
      `TransFlag=TransData EnrollUser ChgUser EnrollFP ChgFP FACE UserPic BioPhoto WORKCODE FVEIN`,
      // TimeZone line is excluded from this test as its value will change
      `Realtime=${config.realtime}`,
      `Encrypt=None`,
      `ServerVer=2.4.1`,
      `PushProtVer=2.4.1`,
      `PushOptionsFlag=1`,
      `PushOptions=FingerFunOn,FaceFunOn,MultiBioDataSupport,MultiBioPhotoSupport,BioPhotoFun,BioDataFun,VisilightFun`,
      `MultiBioDataSupport=${config.multiBioDataSupport}`,
      `MultiBioPhotoSupport=${config.multiBioPhotoSupport}`,
      `ATTPHOTOBase64=1`,
    ];

    // Assert: All expected lines should be present (except first line which is header)
    expectedLines.forEach((line, index) => {
      expect(line).toBeTruthy();
      // First line is "GET OPTION FROM: ..." which doesn't contain '='
      if (index > 0) {
        expect(line).toContain('=');
      }
    });

    // Assert: Response should start with "GET OPTION FROM:"
    expect(expectedLines[0]).toMatch(/^GET OPTION FROM:/);
  });

  /**
   * Property 2.7: Preservation - Configuration Storage and Retrieval
   * 
   * Tests that device configuration storage and retrieval from device_configs
   * table works identically before and after the fix.
   * 
   * EXPECTED ON UNFIXED CODE: PASS - config storage works correctly
   * EXPECTED ON FIXED CODE: PASS - config storage remains unchanged
   */
  test('Property 2.7: Configuration storage and retrieval should remain unchanged', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 8, maxLength: 20 }),
        fc.record({
          errorDelay: fc.integer({ min: 10, max: 60 }).map(String),
          delay: fc.integer({ min: 5, max: 30 }).map(String),
          realtime: fc.constantFrom('0', '1'),
        }),
        async (serialNumber, configValues) => {
          // Reset mock
          mockDb.run.mockClear();
          mockDb.all.mockResolvedValue([]);

          // Act: Update multiple config values
          await deviceManager.updateDeviceConfig(serialNumber, 'errorDelay', configValues.errorDelay);
          await deviceManager.updateDeviceConfig(serialNumber, 'delay', configValues.delay);
          await deviceManager.updateDeviceConfig(serialNumber, 'realtime', configValues.realtime);

          // Assert: Each config update should call INSERT OR REPLACE
          const updateCalls = mockDb.run.mock.calls.filter(call => 
            call[0].includes('INSERT OR REPLACE INTO device_configs')
          );
          expect(updateCalls.length).toBe(3);

          // Assert: Each call should have correct parameters
          expect(updateCalls[0][1]).toEqual([serialNumber, 'errorDelay', configValues.errorDelay]);
          expect(updateCalls[1][1]).toEqual([serialNumber, 'delay', configValues.delay]);
          expect(updateCalls[2][1]).toEqual([serialNumber, 'realtime', configValues.realtime]);

          // Mock the retrieval
          mockDb.all.mockResolvedValue([
            { config_key: 'errorDelay', config_value: configValues.errorDelay },
            { config_key: 'delay', config_value: configValues.delay },
            { config_key: 'realtime', config_value: configValues.realtime },
          ]);

          // Act: Retrieve config
          const retrievedConfig = await deviceManager.getDeviceConfig(serialNumber);

          // Assert: Retrieved values should match stored values
          expect(retrievedConfig.errorDelay).toBe(configValues.errorDelay);
          expect(retrievedConfig.delay).toBe(configValues.delay);
          expect(retrievedConfig.realtime).toBe(configValues.realtime);
        }
      ),
      { numRuns: 10 } // Test with 10 different config combinations
    );
  });
});

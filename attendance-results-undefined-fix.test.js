const fc = require('fast-check');
const request = require('supertest');
const express = require('express');
const Database = require('./database');
const ManagementAPI = require('./managementAPI');
const DeviceManager = require('./deviceManager');
const CommandManager = require('./commandManager');

/**
 * Bug Condition Exploration Test for Attendance Results Undefined Fix
 * 
 * **Validates: Requirements 1.1, 1.2, 1.3 (Bug Condition) and 2.1, 2.2, 2.3, 2.4 (Expected Behavior)**
 * 
 * CRITICAL: This test MUST FAIL on unfixed code - failure confirms the bug exists
 * DO NOT attempt to fix the test or the code when it fails
 * 
 * This test encodes the EXPECTED behavior (after fix):
 * - GET /api/attendance should return 200 OK with structured response
 * - Response should have structure { success: true, data: Array, count: Number }
 * - Empty results should return { success: true, data: [], count: 0 }
 * - Invalid device should return 404 with error message
 * 
 * When run on UNFIXED code, this test will FAIL with 404 Not Found and surface
 * counterexamples demonstrating the missing API endpoint.
 */

describe('Bug Condition Exploration - Attendance API Returns 404/Undefined', () => {
  let app;
  let mockDb;
  let deviceManager;
  let commandManager;
  let managementAPI;

  beforeEach(() => {
    // Mock database for testing
    mockDb = {
      run: jest.fn().mockResolvedValue({ lastID: 1, changes: 1 }),
      get: jest.fn().mockResolvedValue(null),
      all: jest.fn().mockResolvedValue([]),
    };

    deviceManager = new DeviceManager(mockDb);
    commandManager = new CommandManager(mockDb);
    managementAPI = new ManagementAPI(mockDb, deviceManager, commandManager);

    // Create Express app with management API routes
    app = express();
    app.use(express.json());
    app.use('/api', managementAPI.getRouter());
  });

  /**
   * Property 1: Bug Condition - Attendance API Returns 404/Undefined
   * 
   * Tests that GET /api/attendance endpoint exists and returns structured data
   * instead of 404 Not Found.
   * 
   * EXPECTED ON UNFIXED CODE: FAIL - endpoint returns 404 Not Found
   * EXPECTED ON FIXED CODE: PASS - endpoint returns 200 OK with structure
   * 
   * **Validates: Requirements 1.1, 1.2, 1.3, 2.1**
   */
  test('Property 1.1: GET /api/attendance should return structured response (not 404)', async () => {
    // Mock database to return empty attendance data
    mockDb.all.mockResolvedValue([]);

    // Act: Call the attendance endpoint
    const response = await request(app)
      .get('/api/attendance')
      .expect('Content-Type', /json/);

    // EXPECTED BEHAVIOR: Should return 200 OK (not 404)
    // ON UNFIXED CODE: This will return 404 Not Found
    expect(response.status).toBe(200);

    // EXPECTED BEHAVIOR: Response should have structured format
    // ON UNFIXED CODE: response.body will be undefined or error object
    expect(response.body).toHaveProperty('success');
    expect(response.body).toHaveProperty('data');
    expect(response.body).toHaveProperty('count');

    // EXPECTED BEHAVIOR: success should be boolean
    expect(typeof response.body.success).toBe('boolean');

    // EXPECTED BEHAVIOR: data should be an array
    expect(Array.isArray(response.body.data)).toBe(true);

    // EXPECTED BEHAVIOR: count should be a number
    expect(typeof response.body.count).toBe('number');

    // EXPECTED BEHAVIOR: count should match array length
    expect(response.body.count).toBe(response.body.data.length);
  });

  /**
   * Property 1.2: Bug Condition - Attendance API with Device Filter
   * 
   * Tests that GET /api/attendance?device=SERIAL123 returns structured data
   * instead of 404 Not Found.
   * 
   * EXPECTED ON UNFIXED CODE: FAIL - endpoint returns 404 Not Found
   * EXPECTED ON FIXED CODE: PASS - endpoint returns 200 OK with filtered data
   * 
   * **Validates: Requirements 1.1, 1.2, 2.1, 2.4**
   */
  test('Property 1.2: GET /api/attendance?device=SERIAL123 should return structured response', async () => {
    const deviceSerial = 'SERIAL123';

    // Mock device exists
    mockDb.get.mockResolvedValueOnce({ serial_number: deviceSerial });
    
    // Mock database to return empty attendance data for this device
    mockDb.all.mockResolvedValue([]);

    // Act: Call the attendance endpoint with device filter
    const response = await request(app)
      .get(`/api/attendance?device=${deviceSerial}`)
      .expect('Content-Type', /json/);

    // EXPECTED BEHAVIOR: Should return 200 OK (not 404)
    // ON UNFIXED CODE: This will return 404 Not Found
    expect(response.status).toBe(200);

    // EXPECTED BEHAVIOR: Response should have structured format
    expect(response.body).toHaveProperty('success');
    expect(response.body).toHaveProperty('data');
    expect(response.body).toHaveProperty('count');
    expect(response.body.success).toBe(true);
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(typeof response.body.count).toBe('number');
  });

  /**
   * Property 1.3: Bug Condition - Attendance API with Date Range Filter
   * 
   * Tests that GET /api/attendance with startDate and endDate parameters
   * returns structured data instead of 404 Not Found.
   * 
   * EXPECTED ON UNFIXED CODE: FAIL - endpoint returns 404 Not Found
   * EXPECTED ON FIXED CODE: PASS - endpoint returns 200 OK with filtered data
   * 
   * **Validates: Requirements 1.1, 1.2, 2.1, 2.4**
   */
  test('Property 1.3: GET /api/attendance with date range should return structured response', async () => {
    const deviceSerial = 'SERIAL123';
    const startDate = '2024-01-01';
    const endDate = '2024-01-31';

    // Mock device exists
    mockDb.get.mockResolvedValueOnce({ serial_number: deviceSerial });
    
    // Mock database to return empty attendance data
    mockDb.all.mockResolvedValue([]);

    // Act: Call the attendance endpoint with device and date range filters
    const response = await request(app)
      .get(`/api/attendance?device=${deviceSerial}&startDate=${startDate}&endDate=${endDate}`)
      .expect('Content-Type', /json/);

    // EXPECTED BEHAVIOR: Should return 200 OK (not 404)
    // ON UNFIXED CODE: This will return 404 Not Found
    expect(response.status).toBe(200);

    // EXPECTED BEHAVIOR: Response should have structured format
    expect(response.body).toHaveProperty('success');
    expect(response.body).toHaveProperty('data');
    expect(response.body).toHaveProperty('count');
    expect(response.body.success).toBe(true);
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(typeof response.body.count).toBe('number');
  });

  /**
   * Property 1.4: Bug Condition - Empty Attendance Results
   * 
   * Tests that when no attendance records exist, the API returns an empty array
   * { success: true, data: [], count: 0 } instead of undefined.
   * 
   * EXPECTED ON UNFIXED CODE: FAIL - endpoint returns 404, external code gets undefined
   * EXPECTED ON FIXED CODE: PASS - endpoint returns empty array
   * 
   * **Validates: Requirements 1.3, 2.3**
   */
  test('Property 1.4: Empty attendance results should return empty array (not undefined)', async () => {
    // Mock database to return empty attendance data
    mockDb.all.mockResolvedValue([]);

    // Act: Call the attendance endpoint
    const response = await request(app)
      .get('/api/attendance')
      .expect('Content-Type', /json/);

    // EXPECTED BEHAVIOR: Should return 200 OK
    // ON UNFIXED CODE: This will return 404 Not Found
    expect(response.status).toBe(200);

    // EXPECTED BEHAVIOR: data should be an empty array (NOT undefined)
    // ON UNFIXED CODE: External code receives undefined
    expect(response.body.success).toBe(true);
    expect(response.body.data).toEqual([]);
    expect(response.body.count).toBe(0);

    // Assert that response.body.data is NOT undefined
    expect(response.body.data).toBeDefined();
  });

  /**
   * Property 1.5: Bug Condition - Attendance with Sample Data
   * 
   * Tests that when attendance records exist, the API returns them in the
   * correct structure with required fields.
   * 
   * EXPECTED ON UNFIXED CODE: FAIL - endpoint returns 404 Not Found
   * EXPECTED ON FIXED CODE: PASS - endpoint returns attendance data
   * 
   * **Validates: Requirements 2.1, 2.2**
   */
  test('Property 1.5: Attendance data should have required fields (timestamp, pin, verifyType, deviceSerial)', async () => {
    // Mock database to return sample attendance records
    const mockAttendanceData = [
      {
        device_serial: 'SERIAL123',
        pin: '1001',
        timestamp: '2024-01-15T10:30:00Z',
        verify_type: 1,
        work_code: '',
        in_out_state: 0,
      },
      {
        device_serial: 'SERIAL123',
        pin: '1002',
        timestamp: '2024-01-15T11:45:00Z',
        verify_type: 15,
        work_code: 'WC001',
        in_out_state: 1,
      },
    ];
    mockDb.all.mockResolvedValue(mockAttendanceData);

    // Act: Call the attendance endpoint
    const response = await request(app)
      .get('/api/attendance')
      .expect('Content-Type', /json/);

    // EXPECTED BEHAVIOR: Should return 200 OK (not 404)
    // ON UNFIXED CODE: This will return 404 Not Found
    expect(response.status).toBe(200);

    // EXPECTED BEHAVIOR: Response should have structured format
    expect(response.body.success).toBe(true);
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.count).toBe(2);

    // EXPECTED BEHAVIOR: Each attendance record should have minimum required fields
    // ON UNFIXED CODE: This won't be reached due to 404
    response.body.data.forEach((record) => {
      expect(record).toHaveProperty('timestamp');
      expect(record).toHaveProperty('pin');
      expect(record).toHaveProperty('verifyType');
      expect(record).toHaveProperty('deviceSerial');
    });
  });

  /**
   * Property 1.6: Bug Condition - Invalid Device Error Handling
   * 
   * Tests that requesting attendance for a non-existent device returns
   * a proper error response instead of undefined.
   * 
   * EXPECTED ON UNFIXED CODE: FAIL - endpoint returns 404 (no endpoint exists)
   * EXPECTED ON FIXED CODE: PASS - endpoint exists and returns 404 with error message
   * 
   * **Validates: Requirements 2.1**
   */
  test('Property 1.6: Invalid device should return 404 with error message', async () => {
    const invalidDeviceSerial = 'INVALID-DEVICE';

    // Mock device does not exist
    mockDb.get.mockResolvedValue(null);

    // Act: Call the attendance endpoint with invalid device
    const response = await request(app)
      .get(`/api/attendance?device=${invalidDeviceSerial}`)
      .expect('Content-Type', /json/);

    // EXPECTED BEHAVIOR: Should return 404 Not Found with proper error structure
    // ON UNFIXED CODE: Will return 404 but for wrong reason (endpoint doesn't exist)
    expect(response.status).toBe(404);

    // EXPECTED BEHAVIOR: Response should indicate device not found
    expect(response.body).toHaveProperty('success');
    expect(response.body).toHaveProperty('error');
    expect(response.body.success).toBe(false);
    expect(response.body.error).toContain('Device not found');
  });

  /**
   * Property 1.7: Scoped PBT - Concrete Failing Cases
   * 
   * This property test uses concrete cases from the bug report to demonstrate
   * the bug clearly and ensure reproducibility.
   * 
   * EXPECTED ON UNFIXED CODE: FAIL - all concrete cases return 404
   * EXPECTED ON FIXED CODE: PASS - all concrete cases return structured data
   * 
   * **Validates: Requirements 1.1, 1.2, 2.1**
   */
  test('Property 1.7: Concrete failing cases from bug report', async () => {
    // Define concrete test cases from the bug report
    const testCases = [
      {
        description: 'GET /api/attendance (no filters)',
        url: '/api/attendance',
        expectedStatus: 200,
      },
      {
        description: 'GET /api/attendance?device=SERIAL123',
        url: '/api/attendance?device=SERIAL123',
        expectedStatus: 200,
        mockDevice: { serial_number: 'SERIAL123' },
      },
      {
        description: 'GET /api/attendance?device=SERIAL123&startDate=2024-01-01&endDate=2024-01-31',
        url: '/api/attendance?device=SERIAL123&startDate=2024-01-01&endDate=2024-01-31',
        expectedStatus: 200,
        mockDevice: { serial_number: 'SERIAL123' },
      },
    ];

    for (const testCase of testCases) {
      // Mock device if specified
      if (testCase.mockDevice) {
        mockDb.get.mockResolvedValueOnce(testCase.mockDevice);
      }

      // Mock empty attendance data
      mockDb.all.mockResolvedValue([]);

      // Act: Call the endpoint
      const response = await request(app)
        .get(testCase.url)
        .expect('Content-Type', /json/);

      // EXPECTED BEHAVIOR: Should return 200 OK
      // ON UNFIXED CODE: This will return 404 Not Found
      expect(response.status).toBe(testCase.expectedStatus);

      // EXPECTED BEHAVIOR: Response should have structured format
      expect(response.body).toHaveProperty('success');
      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('count');
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(typeof response.body.count).toBe('number');

      // Log the counterexample for debugging
      if (response.status !== testCase.expectedStatus) {
        console.log(`❌ COUNTEREXAMPLE FOUND: ${testCase.description}`);
        console.log(`   Expected status: ${testCase.expectedStatus}`);
        console.log(`   Actual status: ${response.status}`);
        console.log(`   Response body:`, response.body);
      }
    }
  });
});

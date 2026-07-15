/**
 * Attendance API Bug Condition Exploration Test
 * 
 * Property 1: Bug Condition - Attendance API Returns 404/Undefined
 * 
 * CRITICAL: This test encodes the EXPECTED behavior.
 * - On UNFIXED code: Test FAILS (404 Not Found) - proves bug exists
 * - On FIXED code: Test PASSES (200 OK with structure) - confirms fix works
 * 
 * This is the SAME test used for both exploration and verification.
 */

const http = require('http');

// Helper function to make HTTP requests
function makeRequest(path) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 8002,
            path: path,
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            }
        };

        const req = http.request(options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                try {
                    const parsed = data ? JSON.parse(data) : null;
                    resolve({
                        statusCode: res.statusCode,
                        headers: res.headers,
                        body: parsed
                    });
                } catch (e) {
                    resolve({
                        statusCode: res.statusCode,
                        headers: res.headers,
                        body: data
                    });
                }
            });
        });

        req.on('error', reject);
        req.setTimeout(5000, () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });
        req.end();
    });
}

// Helper to validate expected response structure
function validateAttendanceResponse(response) {
    const errors = [];

    // Check status code
    if (response.statusCode !== 200) {
        errors.push(`Expected status 200, got ${response.statusCode}`);
    }

    // Check response structure
    if (!response.body) {
        errors.push('Response body is null or undefined');
        return errors;
    }

    if (typeof response.body !== 'object') {
        errors.push(`Expected object response, got ${typeof response.body}`);
        return errors;
    }

    // Check required fields
    if (!('success' in response.body)) {
        errors.push('Missing "success" field in response');
    } else if (typeof response.body.success !== 'boolean') {
        errors.push(`"success" should be boolean, got ${typeof response.body.success}`);
    }

    if (!('data' in response.body)) {
        errors.push('Missing "data" field in response');
    } else if (!Array.isArray(response.body.data)) {
        errors.push(`"data" should be Array, got ${typeof response.body.data}`);
    }

    if (!('count' in response.body)) {
        errors.push('Missing "count" field in response');
    } else if (typeof response.body.count !== 'number') {
        errors.push(`"count" should be number, got ${typeof response.body.count}`);
    }

    return errors;
}

// Main test suite
async function runTests() {
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('📋 PROPERTY 1: Bug Condition Exploration Test');
    console.log('   Testing: Attendance API Returns Structured Data');
    console.log('═══════════════════════════════════════════════════════\n');

    let failureCount = 0;
    const counterexamples = [];

    // Test 1: GET /api/attendance (no parameters)
    console.log('Test 1: GET /api/attendance (no parameters)');
    try {
        const response = await makeRequest('/api/attendance');
        console.log(`   Status: ${response.statusCode}`);
        console.log(`   Body: ${JSON.stringify(response.body, null, 2)}`);

        const errors = validateAttendanceResponse(response);
        if (errors.length > 0) {
            console.log('   ❌ FAILED');
            errors.forEach(err => console.log(`      - ${err}`));
            failureCount++;
            counterexamples.push({
                test: 'GET /api/attendance',
                statusCode: response.statusCode,
                errors: errors
            });
        } else {
            console.log('   ✅ PASSED');
        }
    } catch (error) {
        console.log(`   ❌ ERROR: ${error.message}`);
        failureCount++;
        counterexamples.push({
            test: 'GET /api/attendance',
            error: error.message
        });
    }
    console.log('');

    // Test 2: GET /api/attendance?device=SERIAL123
    console.log('Test 2: GET /api/attendance?device=SERIAL123');
    try {
        const response = await makeRequest('/api/attendance?device=SERIAL123');
        console.log(`   Status: ${response.statusCode}`);
        console.log(`   Body: ${JSON.stringify(response.body, null, 2)}`);

        // For non-existent device, expect 404 OR empty data array
        if (response.statusCode === 404) {
            console.log('   ✅ PASSED (404 for non-existent device is acceptable)');
        } else {
            const errors = validateAttendanceResponse(response);
            if (errors.length > 0) {
                console.log('   ❌ FAILED');
                errors.forEach(err => console.log(`      - ${err}`));
                failureCount++;
                counterexamples.push({
                    test: 'GET /api/attendance?device=SERIAL123',
                    statusCode: response.statusCode,
                    errors: errors
                });
            } else {
                console.log('   ✅ PASSED');
            }
        }
    } catch (error) {
        console.log(`   ❌ ERROR: ${error.message}`);
        failureCount++;
        counterexamples.push({
            test: 'GET /api/attendance?device=SERIAL123',
            error: error.message
        });
    }
    console.log('');

    // Test 3: GET /api/attendance with date range
    console.log('Test 3: GET /api/attendance?startDate=2024-01-01&endDate=2024-01-31');
    try {
        const response = await makeRequest('/api/attendance?startDate=2024-01-01&endDate=2024-01-31');
        console.log(`   Status: ${response.statusCode}`);
        console.log(`   Body: ${JSON.stringify(response.body, null, 2)}`);

        const errors = validateAttendanceResponse(response);
        if (errors.length > 0) {
            console.log('   ❌ FAILED');
            errors.forEach(err => console.log(`      - ${err}`));
            failureCount++;
            counterexamples.push({
                test: 'GET /api/attendance?startDate=2024-01-01&endDate=2024-01-31',
                statusCode: response.statusCode,
                errors: errors
            });
        } else {
            console.log('   ✅ PASSED');
        }
    } catch (error) {
        console.log(`   ❌ ERROR: ${error.message}`);
        failureCount++;
        counterexamples.push({
            test: 'GET /api/attendance?startDate=2024-01-01&endDate=2024-01-31',
            error: error.message
        });
    }
    console.log('');

    // Test 4: Verify empty results return proper structure
    console.log('Test 4: Empty results structure validation');
    try {
        const response = await makeRequest('/api/attendance?startDate=2020-01-01&endDate=2020-01-02');
        console.log(`   Status: ${response.statusCode}`);
        
        const errors = validateAttendanceResponse(response);
        if (errors.length > 0) {
            console.log('   ❌ FAILED');
            errors.forEach(err => console.log(`      - ${err}`));
            failureCount++;
        } else {
            // Additionally verify empty array behavior
            if (response.body.data.length === 0 && response.body.count === 0) {
                console.log('   ✅ PASSED (empty results return [] instead of undefined)');
            } else {
                console.log(`   ⚠️  WARNING: Got ${response.body.count} results, expected 0 for old date range`);
                console.log('   ✅ PASSED (structure is correct)');
            }
        }
    } catch (error) {
        console.log(`   ❌ ERROR: ${error.message}`);
        failureCount++;
    }
    console.log('');

    // Summary
    console.log('═══════════════════════════════════════════════════════');
    console.log('Test Summary:');
    console.log(`   Total tests: 4`);
    console.log(`   Passed: ${4 - failureCount}`);
    console.log(`   Failed: ${failureCount}`);
    console.log('═══════════════════════════════════════════════════════\n');

    if (failureCount > 0) {
        console.log('Counterexamples found:');
        counterexamples.forEach((ce, index) => {
            console.log(`\n${index + 1}. ${ce.test}`);
            if (ce.statusCode) console.log(`   Status: ${ce.statusCode}`);
            if (ce.errors) ce.errors.forEach(err => console.log(`   - ${err}`));
            if (ce.error) console.log(`   Error: ${ce.error}`);
        });
        console.log('\n⚠️  EXPECTED BEHAVIOR: Tests should FAIL on unfixed code');
        console.log('   (Confirms bug exists: endpoint missing or returns wrong structure)');
        process.exit(1);
    } else {
        console.log('✅ ALL TESTS PASSED');
        console.log('   Bug is FIXED: API returns structured data instead of undefined');
        process.exit(0);
    }
}

// Run tests
console.log('\n🧪 Starting Attendance API Bug Condition Exploration Tests...\n');
console.log('NOTE: Server must be running on localhost:8002\n');

// Give server time to start if needed
setTimeout(() => {
    runTests().catch(error => {
        console.error('\n❌ Test execution failed:', error);
        process.exit(1);
    });
}, 1000);

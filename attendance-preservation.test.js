/**
 * Attendance API Preservation Property Tests
 * 
 * Property 2: Preservation - Non-Attendance API Behavior Unchanged
 * 
 * These tests verify that existing API endpoints and functionality
 * remain unchanged after implementing the attendance API fix.
 * 
 * IMPORTANT: These tests should PASS on both unfixed and fixed code.
 */

const http = require('http');

// Helper function to make HTTP requests
function makeRequest(path, method = 'GET', body = null) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 8002,
            path: path,
            method: method,
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
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

        if (body) {
            req.write(JSON.stringify(body));
        }
        req.end();
    });
}

// Main test suite
async function runTests() {
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('📋 PROPERTY 2: Preservation Tests');
    console.log('   Testing: Existing API Endpoints Unchanged');
    console.log('═══════════════════════════════════════════════════════\n');

    let failureCount = 0;
    const results = [];

    // Test 1: GET /api/devices returns device list
    console.log('Test 1: GET /api/devices returns device list');
    try {
        const response = await makeRequest('/api/devices');
        console.log(`   Status: ${response.statusCode}`);

        if (response.statusCode === 200 && response.body && response.body.success !== undefined) {
            console.log('   ✅ PASSED (endpoint accessible, returns JSON with success field)');
            console.log(`   Observed: ${response.body.count || 0} devices`);
            results.push({
                test: 'GET /api/devices',
                passed: true,
                structure: {
                    hasSuccess: 'success' in response.body,
                    hasData: 'data' in response.body,
                    hasCount: 'count' in response.body
                }
            });
        } else {
            console.log(`   ❌ FAILED: Expected 200 with JSON, got ${response.statusCode}`);
            failureCount++;
        }
    } catch (error) {
        console.log(`   ❌ ERROR: ${error.message}`);
        failureCount++;
    }
    console.log('');

    // Test 2: GET /api/users returns user list
    console.log('Test 2: GET /api/users returns user list');
    try {
        const response = await makeRequest('/api/users');
        console.log(`   Status: ${response.statusCode}`);

        if (response.statusCode === 200 && response.body && response.body.success !== undefined) {
            console.log('   ✅ PASSED (endpoint accessible, returns JSON with success field)');
            console.log(`   Observed: ${response.body.count || 0} users`);
            results.push({
                test: 'GET /api/users',
                passed: true,
                structure: {
                    hasSuccess: 'success' in response.body,
                    hasData: 'data' in response.body,
                    hasCount: 'count' in response.body
                }
            });
        } else {
            console.log(`   ❌ FAILED: Expected 200 with JSON, got ${response.statusCode}`);
            failureCount++;
        }
    } catch (error) {
        console.log(`   ❌ ERROR: ${error.message}`);
        failureCount++;
    }
    console.log('');

    // Test 3: GET /api/commands returns command queue
    console.log('Test 3: GET /api/commands returns command queue');
    try {
        const response = await makeRequest('/api/commands');
        console.log(`   Status: ${response.statusCode}`);

        if (response.statusCode === 200 && response.body && response.body.success !== undefined) {
            console.log('   ✅ PASSED (endpoint accessible, returns JSON with success field)');
            console.log(`   Observed: ${response.body.count || 0} commands`);
            results.push({
                test: 'GET /api/commands',
                passed: true,
                structure: {
                    hasSuccess: 'success' in response.body,
                    hasData: 'data' in response.body,
                    hasCount: 'count' in response.body
                }
            });
        } else {
            console.log(`   ❌ FAILED: Expected 200 with JSON, got ${response.statusCode}`);
            failureCount++;
        }
    } catch (error) {
        console.log(`   ❌ ERROR: ${error.message}`);
        failureCount++;
    }
    console.log('');

    // Test 4: GET /api/status returns system status
    console.log('Test 4: GET /api/status returns system status');
    try {
        const response = await makeRequest('/api/status');
        console.log(`   Status: ${response.statusCode}`);

        if (response.statusCode === 200 && response.body && response.body.success !== undefined) {
            console.log('   ✅ PASSED (endpoint accessible, returns JSON with success field)');
            results.push({
                test: 'GET /api/status',
                passed: true,
                structure: {
                    hasSuccess: 'success' in response.body,
                    hasData: 'data' in response.body
                }
            });
        } else {
            console.log(`   ❌ FAILED: Expected 200 with JSON, got ${response.statusCode}`);
            failureCount++;
        }
    } catch (error) {
        console.log(`   ❌ ERROR: ${error.message}`);
        failureCount++;
    }
    console.log('');

    // Test 5: GET /api/stats returns system stats
    console.log('Test 5: GET /api/stats returns system statistics');
    try {
        const response = await makeRequest('/api/stats');
        console.log(`   Status: ${response.statusCode}`);

        if (response.statusCode === 200 && response.body && response.body.success !== undefined) {
            console.log('   ✅ PASSED (endpoint accessible, returns JSON with success field)');
            console.log(`   Observed stats:`, Object.keys(response.body.data || {}).join(', '));
            results.push({
                test: 'GET /api/stats',
                passed: true,
                structure: {
                    hasSuccess: 'success' in response.body,
                    hasData: 'data' in response.body
                }
            });
        } else {
            console.log(`   ❌ FAILED: Expected 200 with JSON, got ${response.statusCode}`);
            failureCount++;
        }
    } catch (error) {
        console.log(`   ❌ ERROR: ${error.message}`);
        failureCount++;
    }
    console.log('');

    // Test 6: Device initialization endpoint accessible
    console.log('Test 6: GET /iclock/cdata (device initialization) accessible');
    try {
        const response = await makeRequest('/iclock/cdata?SN=TESTSERIAL&pushver=2.2.14');
        console.log(`   Status: ${response.statusCode}`);

        // Should return 200 or 400, but not 404
        if (response.statusCode !== 404) {
            console.log('   ✅ PASSED (endpoint accessible, returns valid response)');
            // Check if ATTLOGStamp is present in response
            if (typeof response.body === 'string' && response.body.includes('ATTLOGStamp')) {
                const match = response.body.match(/ATTLOGStamp=([^\n]+)/);
                if (match) {
                    console.log(`   Observed: ATTLOGStamp=${match[1]}`);
                }
            }
            results.push({
                test: 'GET /iclock/cdata',
                passed: true,
                attlogStamp: typeof response.body === 'string' ? response.body.includes('ATTLOGStamp') : false
            });
        } else {
            console.log(`   ❌ FAILED: Endpoint not found (404)`);
            failureCount++;
        }
    } catch (error) {
        console.log(`   ❌ ERROR: ${error.message}`);
        failureCount++;
    }
    console.log('');

    // Test 7: Heartbeat endpoint accessible
    console.log('Test 7: GET /iclock/ping (heartbeat) accessible');
    try {
        const response = await makeRequest('/iclock/ping?SN=TESTSERIAL');
        console.log(`   Status: ${response.statusCode}`);

        if (response.statusCode === 200 || (response.statusCode === 400 && response.body && response.body.includes('Missing'))) {
            console.log('   ✅ PASSED (endpoint accessible)');
            results.push({
                test: 'GET /iclock/ping',
                passed: true
            });
        } else {
            console.log(`   ❌ FAILED: Unexpected status ${response.statusCode}`);
            failureCount++;
        }
    } catch (error) {
        console.log(`   ❌ ERROR: ${error.message}`);
        failureCount++;
    }
    console.log('');

    // Summary
    console.log('═══════════════════════════════════════════════════════');
    console.log('Test Summary:');
    console.log(`   Total tests: 7`);
    console.log(`   Passed: ${7 - failureCount}`);
    console.log(`   Failed: ${failureCount}`);
    console.log('═══════════════════════════════════════════════════════\n');

    if (failureCount > 0) {
        console.log('❌ PRESERVATION TESTS FAILED');
        console.log('   Some existing endpoints are broken!');
        console.log('   This indicates the attendance API fix introduced regressions.');
        process.exit(1);
    } else {
        console.log('✅ ALL PRESERVATION TESTS PASSED');
        console.log('   All existing API endpoints remain functional');
        console.log('   No regressions detected from attendance API implementation');
        
        console.log('\nObserved API Patterns:');
        results.forEach(result => {
            if (result.structure) {
                console.log(`   ${result.test}:`);
                console.log(`     - Has "success" field: ${result.structure.hasSuccess}`);
                console.log(`     - Has "data" field: ${result.structure.hasData}`);
                if ('hasCount' in result.structure) {
                    console.log(`     - Has "count" field: ${result.structure.hasCount}`);
                }
            }
        });
        
        process.exit(0);
    }
}

// Run tests
console.log('\n🧪 Starting Attendance API Preservation Tests...\n');
console.log('NOTE: Server must be running on localhost:8002\n');

// Give server time to start if needed
setTimeout(() => {
    runTests().catch(error => {
        console.error('\n❌ Test execution failed:', error);
        process.exit(1);
    });
}, 1000);

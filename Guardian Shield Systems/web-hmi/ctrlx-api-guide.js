/**
 * ctrlX Data Layer API Helper Functions
 *
 * This file contains helper functions to communicate with the ctrlX CORE Data Layer REST API
 * Replace the mock implementations in index.html with these real API calls
 */

// Configuration
const CTRLX_CONFIG = {
    host: '192.168.0.29',  // Replace with your ctrlX IP address
    port: 443,             // HTTPS port (or 8443 for some configurations)
    username: 'boschrexroth',  // Default username
    password: 'boschrexroth',  // Default password
    basePath: '/automation/api/v2'
};

// Authentication token storage
let authToken = null;

/**
 * Authenticate with ctrlX Data Layer
 * Must be called before any data operations
 */
async function authenticateCtrlX() {
    const url = `https://${CTRLX_CONFIG.host}:${CTRLX_CONFIG.port}/identity-manager/api/v2/auth/token`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                name: CTRLX_CONFIG.username,
                password: CTRLX_CONFIG.password
            })
        });

        if (!response.ok) {
            throw new Error(`Authentication failed: ${response.status}`);
        }

        const data = await response.json();
        authToken = data.access_token;
        console.log('✓ Authenticated with ctrlX CORE');
        return true;

    } catch (error) {
        console.error('Authentication error:', error);
        throw error;
    }
}

/**
 * Read a single PLC variable from ctrlX Data Layer
 * @param {string} nodePath - Path to the variable (e.g., 'plc/app/Application/PLC_PRG.MACHINE_STATE')
 * @returns {Promise<any>} - The variable value
 */
async function readPLCVariable(nodePath) {
    if (!authToken) {
        await authenticateCtrlX();
    }

    // Convert PLC variable path to Data Layer node path
    // Format: plc/app/Application/SymbolName
    const fullPath = `plc/app/Application/${nodePath}`;
    const url = `https://${CTRLX_CONFIG.host}:${CTRLX_CONFIG.port}${CTRLX_CONFIG.basePath}/data/${fullPath}`;

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            if (response.status === 401) {
                // Token expired, re-authenticate
                authToken = null;
                return readPLCVariable(nodePath);
            }
            throw new Error(`Read failed: ${response.status}`);
        }

        const data = await response.json();
        return data.value;

    } catch (error) {
        console.error(`Error reading ${nodePath}:`, error);
        throw error;
    }
}

/**
 * Write a value to a PLC variable
 * @param {string} nodePath - Path to the variable
 * @param {any} value - Value to write
 * @returns {Promise<boolean>} - Success status
 */
async function writePLCVariable(nodePath, value) {
    if (!authToken) {
        await authenticateCtrlX();
    }

    const fullPath = `plc/app/Application/${nodePath}`;
    const url = `https://${CTRLX_CONFIG.host}:${CTRLX_CONFIG.port}${CTRLX_CONFIG.basePath}/data/${fullPath}`;

    try {
        const response = await fetch(url, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                value: value,
                type: typeof value === 'boolean' ? 'bool8' :
                      typeof value === 'number' ? 'int32' : 'string'
            })
        });

        if (!response.ok) {
            if (response.status === 401) {
                authToken = null;
                return writePLCVariable(nodePath, value);
            }
            throw new Error(`Write failed: ${response.status}`);
        }

        return true;

    } catch (error) {
        console.error(`Error writing ${nodePath}:`, error);
        throw error;
    }
}

/**
 * Read multiple variables in a single request (bulk read)
 * More efficient than individual reads
 */
async function readMultiplePLCVariables(nodePaths) {
    if (!authToken) {
        await authenticateCtrlX();
    }

    const url = `https://${CTRLX_CONFIG.host}:${CTRLX_CONFIG.port}${CTRLX_CONFIG.basePath}/data/bulk/read`;

    const nodes = nodePaths.map(path => ({
        path: `plc/app/Application/${path}`
    }));

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(nodes)
        });

        if (!response.ok) {
            throw new Error(`Bulk read failed: ${response.status}`);
        }

        const data = await response.json();

        // Convert array response to object with paths as keys
        const result = {};
        data.forEach((item, index) => {
            result[nodePaths[index]] = item.value;
        });

        return result;

    } catch (error) {
        console.error('Bulk read error:', error);
        throw error;
    }
}

/**
 * Subscribe to variable changes using WebSocket
 * Real-time updates instead of polling
 */
function subscribeToVariables(nodePaths, callback) {
    const wsUrl = `wss://${CTRLX_CONFIG.host}:${CTRLX_CONFIG.port}${CTRLX_CONFIG.basePath}/data/subscribe`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        console.log('✓ WebSocket connection established');

        // Send subscription request
        const subscription = {
            nodes: nodePaths.map(path => ({
                path: `plc/app/Application/${path}`,
                publishIntervalMs: 100  // Update every 100ms
            }))
        };

        ws.send(JSON.stringify(subscription));
    };

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        callback(data);
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };

    ws.onclose = () => {
        console.log('WebSocket connection closed');
        // Optionally reconnect after delay
        setTimeout(() => subscribeToVariables(nodePaths, callback), 5000);
    };

    return ws;
}

/**
 * Example usage in your HTML file:
 *
 * Replace the mock functions with:
 *
 * async function readPLCVariable(varPath) {
 *     return await readPLCVariable(varPath);
 * }
 *
 * async function writePLCVariable(varPath, value) {
 *     return await writePLCVariable(varPath, value);
 * }
 *
 * Or for better performance, use bulk reads:
 *
 * async function updatePLC() {
 *     const values = await readMultiplePLCVariables([
 *         'PLC_PRG.MACHINE_STATE',
 *         'PLC_PRG.stateMachine.isRunning',
 *         'PLC_PRG.stateMachine.isFaulted',
 *         // ... more variables
 *     ]);
 *
 *     updateMachineState(values['PLC_PRG.MACHINE_STATE']);
 *     updateIndicator('indRunning', values['PLC_PRG.stateMachine.isRunning']);
 *     // ... update UI
 * }
 *
 * Or for real-time updates, use WebSocket subscription:
 *
 * const ws = subscribeToVariables([
 *     'PLC_PRG.MACHINE_STATE',
 *     'PLC_PRG.stateMachine.isRunning'
 * ], (data) => {
 *     // Update UI with real-time data
 *     console.log('Variable changed:', data);
 * });
 */

// Export functions for use in modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        authenticateCtrlX,
        readPLCVariable,
        writePLCVariable,
        readMultiplePLCVariables,
        subscribeToVariables,
        CTRLX_CONFIG
    };
}

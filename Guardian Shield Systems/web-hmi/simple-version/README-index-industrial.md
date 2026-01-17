# index-industrial.html JavaScript Documentation

This document explains the JavaScript code in the industrial HMI dashboard for the Foam Block Carving Machine.

---

## Configuration Objects

### `config`
```javascript
const config = {
    plcAddress: '192.168.0.29',
    updateInterval: 500,
    apiBasePath: '/automation/api/v1',
    username: 'boschrexroth',
    password: 'boschrexroth'
};
```
- **plcAddress**: IP address of the ctrlX CORE PLC
- **updateInterval**: How often (in milliseconds) the HMI polls the PLC for updates
- **apiBasePath**: The REST API base path for the ctrlX Data Layer
- **username/password**: Credentials for authenticating with the ctrlX identity manager

### `plcVars`
```javascript
const plcVars = {
    machineState: 'PLC_PRG/MACHINE_STATE',
    btnStart: 'PLC_PRG.btn_Start',
    // ... more variables
};
```
Maps friendly names to PLC variable paths. These paths follow the ctrlX Data Layer naming convention:
- Forward slashes (`/`) for reading nested structures
- Dots (`.`) for writing to variables

The `readPLCVariable` function converts dots to slashes automatically.

### `machineStates`
```javascript
const machineStates = {
    0: 'INIT', 1: 'IDLE', 2: 'HOMING', 3: 'MANUAL',
    4: 'RUNNING', 5: 'STOPPING', 6: 'FAULTED', 7: 'E_STOPPED', 8: 'RESETTING'
};
```
Maps the numeric state values from the PLC to human-readable state names.

### `stateDescriptions`
```javascript
const stateDescriptions = {
    'INIT': 'Initializing...',
    'IDLE': 'Ready for operation',
    // ...
};
```
Provides descriptive text for each machine state, displayed below the main state indicator.

### `axisBitPositions`
```javascript
const axisBitPositions = {
    1: 0, 2: 1, 6: 5, 8: 7, 10: 9, 14: 13, 15: 14, 18: 17, 19: 18,
    22: 21, 23: 22, 26: 25, 27: 26, 30: 29, 31: 30, 34: 33, 35: 34, 36: 35
};
```
Maps axis numbers to their bit positions in the `activeAxesMask` bitmask.

**How it works:** The PLC sends a single LWORD (64-bit integer) where each bit represents whether an axis is currently moving:
- Bit 0 = Axis 1
- Bit 1 = Axis 2
- Bit 5 = Axis 6
- etc.

Only the 18 master axes are tracked here (slave axes move with their masters via gearing).

---

## Global Variables

```javascript
let authToken = null;  // Stores the JWT token after authentication
let drivesOn = false;  // Tracks current state of drives (on/off)
```

---

## Initialization

### `window.onload`
```javascript
window.onload = function() {
    document.getElementById('plcAddress').textContent = config.plcAddress;
    startUpdates();
};
```
Called when the page loads. Displays the PLC address and starts the polling loop.

### `startUpdates()`
```javascript
function startUpdates() {
    updateHMI();
    setInterval(updateHMI, config.updateInterval);
}
```
Calls `updateHMI()` immediately, then sets up a repeating timer to call it every 500ms.

---

## Core Update Function

### `updateHMI()` (async)
This is the main polling function that runs every 500ms. It:

1. **Reads machine state** and updates the display
2. **Reads status flags** (running, faulted, homed, drives)
3. **Updates pilot lights** based on status
4. **Reads recipe info** (name, description, locked status)
5. **Reads motion info** (current step, sub-step, active axes)
6. **Updates connection status** and timestamp

The function uses try/catch blocks to handle communication errors gracefully - if the PLC is unreachable, it shows "Offline" but doesn't crash.

---

## PLC Communication Functions

### `authenticateCtrlX()` (async)
```javascript
async function authenticateCtrlX() {
    const response = await fetch(`https://${config.plcAddress}/identity-manager/api/v2/auth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: config.username, password: config.password })
    });
    const data = await response.json();
    authToken = data.access_token;
}
```
Authenticates with the ctrlX identity manager and stores the JWT token. This token is required for all subsequent API calls.

### `readPLCVariable(varPath)` (async)
```javascript
async function readPLCVariable(varPath) {
    if (!authToken) await authenticateCtrlX();
    const dataLayerPath = varPath.replace(/\./g, '/');
    const url = `https://${config.plcAddress}${config.apiBasePath}/plc/app/Application/sym/${dataLayerPath}`;

    const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const data = await response.json();
    return data.value;
}
```

**What it does:**
1. Ensures we have an auth token (authenticates if needed)
2. Converts the variable path (dots to slashes)
3. Constructs the full API URL
4. Makes a GET request with the Bearer token
5. Extracts and returns the value from the response

**Auto-retry on 401:** If the token has expired (401 response), it clears the token and retries, which triggers re-authentication.

### `writePLCVariable(varPath, value, plcType)` (async)
```javascript
async function writePLCVariable(varPath, value, plcType = null) {
    // ... similar setup to readPLCVariable ...

    let body;
    if (plcType === 'UINT') {
        body = JSON.stringify({ type: "uint16", value: Number(value) });
    } else if (typeof value === 'boolean') {
        body = JSON.stringify({ type: "bool8", value: Boolean(value) });
    } else {
        body = JSON.stringify({ type: "int32", value: Number(value) });
    }

    const response = await fetch(url, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' },
        body: body
    });
}
```

**What it does:**
1. Constructs the request body with the correct PLC data type
2. Makes a PUT request to write the value
3. Handles type conversion (bool, uint16, int32)

**Why types matter:** The ctrlX API requires you to specify the data type when writing. If you send a boolean as an int32, it won't work correctly.

---

## Command Functions

### `sendCommand(buttonVar, value)` (async)
```javascript
async function sendCommand(buttonVar, value) {
    const varName = 'btn' + buttonVar.replace('btn_', '').charAt(0).toUpperCase() +
                    buttonVar.replace('btn_', '').slice(1);
    await writePLCVariable(plcVars[varName], value);

    // Auto-release momentary buttons after 100ms
    if (value === true && buttonVar !== 'btn_DriveOn') {
        setTimeout(() => writePLCVariable(plcVars[varName], false), 100);
    }
}
```

**What it does:**
1. Converts the button name (e.g., `'btn_Start'`) to the plcVars key (e.g., `'btnStart'`)
2. Writes `true` to the PLC variable
3. For momentary buttons (everything except DriveOn), automatically writes `false` after 100ms

**Why the auto-release:** PLC buttons are typically edge-triggered. The PLC code looks for a rising edge (false→true transition). Without the auto-release, you'd have to click twice (once to set true, once to set false).

### `toggleDrives()` (async)
```javascript
async function toggleDrives() {
    await writePLCVariable(plcVars.btnDriveOn, !drivesOn);
}
```
Toggles the drives on/off. Unlike other buttons, this is a maintained state (stays on until toggled off).

### `selectRecipe()` (async)
```javascript
async function selectRecipe() {
    const recipeId = parseInt(document.getElementById('recipeSelect').value);
    await writePLCVariable(plcVars.recipeSelect, recipeId, 'UINT');
}
```
Reads the selected recipe from the dropdown and writes it to the PLC as a UINT (unsigned 16-bit integer).

---

## UI Update Functions

### `updateMachineState(stateValue)`
```javascript
function updateMachineState(stateValue) {
    let stateText = typeof stateValue === 'number' ? machineStates[stateValue] : stateValue;

    const stateEl = document.getElementById('machineState');
    stateEl.textContent = stateText;
    stateEl.className = 'state-value ' + stateText;  // Applies CSS class for color

    document.getElementById('stateDescription').textContent = stateDescriptions[stateText];
}
```
Updates the large state display in the center panel. The CSS class (e.g., `.state-value.RUNNING`) controls the color.

### `updatePilotLight(id, isOn, color)`
```javascript
function updatePilotLight(id, isOn, color) {
    const el = document.getElementById(id);
    el.className = 'pilot-light ' + color + (isOn ? ' on' : '');
}
```
Updates a pilot light indicator. When `isOn` is true, adds the `.on` class which makes the light glow.

### `updateOperationCheck(id, enabled)`
```javascript
function updateOperationCheck(id, enabled) {
    const el = document.getElementById(id);
    el.className = 'operation-check' + (enabled ? ' enabled' : '');
}
```
Updates the checkmark indicators for enabled operations (Studs, Windows, Electrical).

### `updateActiveAxes(axesMask)`
```javascript
function updateActiveAxes(axesMask) {
    // Convert to BigInt to handle bits 32+ properly (axes 34-36)
    const mask = BigInt(axesMask >>> 0);

    const cells = document.querySelectorAll('.axis-cell');
    cells.forEach(cell => {
        const axisNum = parseInt(cell.dataset.axis);
        const bitPos = axisBitPositions[axisNum];
        const isActive = bitPos !== undefined && ((mask >> BigInt(bitPos)) & 1n) === 1n;
        cell.className = 'axis-cell' + (isActive ? ' active' : '');
    });
}
```

**What it does:**
1. Converts the mask to BigInt (required for bits 32+)
2. Loops through each axis cell in the HTML
3. Looks up the bit position for that axis
4. Checks if that bit is set using bitwise operations
5. Adds/removes the `.active` class

**Bitwise operations explained:**
- `mask >> BigInt(bitPos)` - Shifts the mask right so the bit we care about is in position 0
- `& 1n` - Masks out all other bits, leaving just the one we want
- `=== 1n` - Checks if that bit is 1 (axis is active)

**Example:** If `axesMask = 6` (binary: `110`) and we check axis 2 (bit 1):
```
mask:     110
>> 1:     011
& 1:      001  = 1 (active!)
```

### `updateDrivesButton()`
```javascript
function updateDrivesButton() {
    const btn = document.getElementById('btnDrives');
    if (drivesOn) {
        btn.textContent = 'Drives On';
        btn.classList.add('on');
    } else {
        btn.textContent = 'Drives Off';
        btn.classList.remove('on');
    }
}
```
Updates the drives button text and styling based on current state.

### `updateConnectionStatus(isConnected)`
```javascript
function updateConnectionStatus(isConnected) {
    const led = document.getElementById('connectionLed');
    const text = document.getElementById('connectionText');
    if (isConnected) {
        led.className = 'connection-led online';
        text.textContent = 'Online';
        hideError();
    } else {
        led.className = 'connection-led offline';
        text.textContent = 'Offline';
    }
}
```
Updates the connection indicator in the header.

---

## Error Handling

### `showError(message)`
```javascript
function showError(message) {
    const el = document.getElementById('errorBanner');
    el.textContent = message;
    el.classList.add('show');
}
```
Displays an error banner at the bottom of the page.

### `hideError()`
```javascript
function hideError() {
    document.getElementById('errorBanner').classList.remove('show');
}
```
Hides the error banner (called when connection is restored).

---

## Data Flow Summary

```
┌─────────────────────────────────────────────────────────────┐
│                     Every 500ms                              │
│                          │                                   │
│                    updateHMI()                               │
│                          │                                   │
│         ┌────────────────┼────────────────┐                  │
│         ▼                ▼                ▼                  │
│   readPLCVariable   readPLCVariable  readPLCVariable        │
│   (machineState)    (isRunning)      (activeAxesMask)       │
│         │                │                │                  │
│         ▼                ▼                ▼                  │
│   updateMachineState updatePilotLight updateActiveAxes      │
│         │                │                │                  │
│         └────────────────┴────────────────┘                  │
│                          │                                   │
│                    Update DOM                                │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    User clicks button                        │
│                          │                                   │
│                    sendCommand()                             │
│                          │                                   │
│                  writePLCVariable()                          │
│                          │                                   │
│               PLC receives command                           │
│                          │                                   │
│              Next updateHMI() cycle                          │
│              reflects the change                             │
└─────────────────────────────────────────────────────────────┘
```

---

## ctrlX API Reference

### Authentication Endpoint
```
POST https://{plcAddress}/identity-manager/api/v2/auth/token
Body: { "name": "username", "password": "password" }
Response: { "access_token": "eyJ..." }
```

### Read Variable
```
GET https://{plcAddress}/automation/api/v1/plc/app/Application/sym/{path}
Header: Authorization: Bearer {token}
Response: { "value": ... }
```

### Write Variable
```
PUT https://{plcAddress}/automation/api/v1/plc/app/Application/sym/{path}
Header: Authorization: Bearer {token}
Body: { "type": "bool8", "value": true }
```

### Common Data Types
| PLC Type | API Type |
|----------|----------|
| BOOL     | bool8    |
| UINT     | uint16   |
| INT      | int16    |
| DINT     | int32    |
| LWORD    | uint64   |

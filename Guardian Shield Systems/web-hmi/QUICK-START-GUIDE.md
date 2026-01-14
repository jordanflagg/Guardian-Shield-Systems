# Quick Start Guide - Connecting to Your ctrlX CORE PLC

## 🎯 Goal
Connect your web HMI to the real ctrlX CORE and control your foam carving machine.

## 📋 Prerequisites

- [ ] ctrlX CORE PLC powered on and on your network
- [ ] Know the IP address of your ctrlX CORE (e.g., 192.168.1.1)
- [ ] Have login credentials (default: boschrexroth / boschrexroth)
- [ ] PLC program loaded and running
- [ ] PC/laptop on same network as ctrlX CORE

---

## Step 1: Find Your ctrlX IP Address

### Option A: Check on the Device
- Look at the ctrlX CORE display
- IP address is usually shown on the screen

### Option B: Find on Network
```bash
# On Windows, open Command Prompt and try:
ping ctrlx-core

# Or use Bosch's Device Scanner tool
```

### Option C: Check Router
- Log into your router
- Look for "ctrlX CORE" in connected devices

**Write it down:** `My ctrlX IP: ___________________`

---

## Step 2: Test Connection to ctrlX

1. **Open a web browser** (Chrome or Edge recommended)

2. **Navigate to your ctrlX web interface:**
   ```
   https://[YOUR-CTRLX-IP]
   ```
   Example: `https://192.168.1.1`

3. **You'll see a security warning** - This is normal! Click:
   - **Advanced** → **Proceed to [IP address]**

4. **Log in:**
   - Username: `boschrexroth` (or your custom username)
   - Password: `boschrexroth` (or your password)

5. **Verify PLC is running:**
   - Go to **PLC Engineering** or **Data Layer**
   - Check that your program is loaded and running

✅ If you can log in and see your PLC, you're ready to proceed!

---

## Step 3: Enable CORS (Cross-Origin Resource Sharing)

If you plan to host the HMI on a different server (not on ctrlX itself), you need to enable CORS.

### Option A: Host HMI Directly on ctrlX (Recommended - No CORS Needed!)

1. **Connect to ctrlX via SFTP:**
   - Host: `[YOUR-CTRLX-IP]`
   - Port: `22`
   - Username: `boschrexroth`
   - Password: `boschrexroth`

2. **Upload `index.html` to:**
   ```
   /var/www/html/
   ```

3. **Access HMI at:**
   ```
   http://[YOUR-CTRLX-IP]/index.html
   ```

### Option B: Enable CORS for Remote Hosting

If hosting elsewhere, configure ctrlX to allow CORS:

1. SSH into ctrlX or use web terminal
2. Edit CORS configuration (consult ctrlX documentation for your version)

---

## Step 4: Update HMI Configuration

Open `simple-version/index.html` in a text editor (VS Code, Notepad++, etc.)

### Find the Configuration Section (around line 350):

```javascript
const config = {
    plcAddress: 'localhost',     // ← CHANGE THIS
    updateInterval: 500,
    apiBasePath: '/automation/api/v2'
};
```

### Change to Your ctrlX IP:

```javascript
const config = {
    plcAddress: '192.168.1.1',   // ← Your ctrlX IP
    updateInterval: 500,
    apiBasePath: '/automation/api/v2'
};
```

---

## Step 5: Replace Mock Functions with Real API Calls

### Find These Functions (around line 500):

Look for:
```javascript
// Mock data for testing (remove when connecting to real PLC)
function getMockData(varPath) {
```

### Replace with Real Implementation:

**Copy this entire section** and replace the mock functions:

```javascript
// ============================================================================
// REAL ctrlX DATA LAYER API IMPLEMENTATION
// ============================================================================

let authToken = null;

// Authenticate with ctrlX
async function authenticateCtrlX() {
    const url = `https://${config.plcAddress}/identity-manager/api/v2/auth/token`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: 'boschrexroth',        // ← Change if needed
                password: 'boschrexroth'     // ← Change if needed
            })
        });

        if (!response.ok) throw new Error(`Auth failed: ${response.status}`);

        const data = await response.json();
        authToken = data.access_token;
        console.log('✓ Authenticated with ctrlX');
        return true;

    } catch (error) {
        console.error('Authentication error:', error);
        throw error;
    }
}

// Read PLC variable
async function readPLCVariable(varPath) {
    if (!authToken) await authenticateCtrlX();

    const fullPath = `plc/app/Application/${varPath}`;
    const url = `https://${config.plcAddress}${config.apiBasePath}/data/${fullPath}`;

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
                authToken = null;
                return readPLCVariable(varPath);
            }
            throw new Error(`Read failed: ${response.status}`);
        }

        const data = await response.json();
        return data.value;

    } catch (error) {
        console.error(`Error reading ${varPath}:`, error);
        throw error;
    }
}

// Write PLC variable
async function writePLCVariable(varPath, value) {
    if (!authToken) await authenticateCtrlX();

    const fullPath = `plc/app/Application/${varPath}`;
    const url = `https://${config.plcAddress}${config.apiBasePath}/data/${fullPath}`;

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
                return writePLCVariable(varPath, value);
            }
            throw new Error(`Write failed: ${response.status}`);
        }

        return true;

    } catch (error) {
        console.error(`Error writing ${varPath}:`, error);
        throw error;
    }
}

// Remove the getMockData function completely
```

---

## Step 6: Test the Connection

1. **Save your changes** to `index.html`

2. **Open in browser:**
   - If hosted on ctrlX: `http://[CTRLX-IP]/index.html`
   - If testing locally: Just open the file

3. **Open Browser Console** (F12 → Console tab)

4. **Watch for messages:**
   ```
   ✓ Authenticated with ctrlX
   ```

5. **Check connection indicator** in top-right corner:
   - Should turn **green** and say "Connected"

---

## Step 7: Verify PLC Communication

### Test Reading Data:

Watch the HMI display update with real values:
- Machine state should show actual PLC state
- Indicators should reflect real PLC outputs

### Test Writing Data:

Click a button (Start, Stop, etc.) and check:
1. **Browser Console** - Should show: `Writing PLC_PRG.btn_Start = true`
2. **PLC Program** - Variable should change
3. **Machine should respond** to the command

---

## 🐛 Troubleshooting

### Problem: "Authentication failed"

**Solutions:**
- ✅ Verify username/password
- ✅ Check that you can log into ctrlX web interface
- ✅ Ensure your user has Data Layer access permissions

### Problem: "Read failed: 404" or "Variable not found"

**Solutions:**
- ✅ Verify PLC program is running
- ✅ Check variable paths match your PLC structure
- ✅ Use ctrlX Data Layer browser to find correct paths

**How to find correct paths:**
1. Log into ctrlX web interface
2. Go to **Data Layer** or **PLC Engineering**
3. Browse to `plc/app/Application/PLC_PRG`
4. Note the exact path to your variables

### Problem: "CORS error" in browser console

**Solutions:**
- ✅ Host HMI on ctrlX directly (no CORS issues)
- ✅ Or enable CORS in ctrlX configuration
- ✅ Or use a reverse proxy

### Problem: Connection keeps dropping

**Solutions:**
- ✅ Check network stability
- ✅ Verify firewall isn't blocking HTTPS (port 443)
- ✅ Increase `updateInterval` (line 353) from 500ms to 1000ms

### Problem: Buttons don't work

**Solutions:**
- ✅ Check browser console for errors
- ✅ Verify you have write permissions in PLC
- ✅ Ensure PLC is not in a state that blocks writes

---

## 🔒 Security Best Practices

1. **Change default password** on ctrlX CORE
2. **Use HTTPS** only (never HTTP for production)
3. **Limit network access** to ctrlX (firewall rules)
4. **Create dedicated HMI user** with minimal required permissions
5. **Don't expose ctrlX directly to internet** without VPN

---

## 📊 Performance Optimization

### For Better Performance:

Replace the individual `readPLCVariable()` calls in `updatePLC()` with **bulk read**:

```javascript
async function updatePLC() {
    try {
        // Read all variables in ONE request
        const values = await readMultiplePLCVariables([
            'PLC_PRG.MACHINE_STATE',
            'PLC_PRG.stateMachine.isRunning',
            'PLC_PRG.stateMachine.isFaulted',
            'PLC_PRG.stateMachine.isHomed',
            'PLC_PRG.btn_DriveOn'
        ]);

        updateMachineState(values['PLC_PRG.MACHINE_STATE']);
        updateIndicator('indRunning', values['PLC_PRG.stateMachine.isRunning']);
        updateIndicator('indFaulted', values['PLC_PRG.stateMachine.isFaulted']);
        updateIndicator('indHomed', values['PLC_PRG.stateMachine.isHomed']);
        updateIndicator('indDrives', values['PLC_PRG.btn_DriveOn']);

        updateConnectionStatus(true);
        document.getElementById('lastUpdate').textContent = new Date().toLocaleTimeString();

    } catch (error) {
        console.error('Update error:', error);
        updateConnectionStatus(false);
        showError('Connection lost: ' + error.message);
    }
}

// Add this new function for bulk reads
async function readMultiplePLCVariables(varPaths) {
    if (!authToken) await authenticateCtrlX();

    const url = `https://${config.plcAddress}${config.apiBasePath}/data/bulk/read`;

    const nodes = varPaths.map(path => ({
        path: `plc/app/Application/${path}`
    }));

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(nodes)
    });

    if (!response.ok) throw new Error(`Bulk read failed: ${response.status}`);

    const data = await response.json();
    const result = {};
    data.forEach((item, index) => {
        result[varPaths[index]] = item.value;
    });

    return result;
}
```

This reduces network requests from 5+ per cycle to just 1!

---

## ✅ Success Checklist

- [ ] Found ctrlX IP address
- [ ] Can access ctrlX web interface
- [ ] Updated `config.plcAddress` in index.html
- [ ] Replaced mock functions with real API calls
- [ ] Opened HMI in browser
- [ ] See "Connected" in green
- [ ] Machine state displays correctly
- [ ] Buttons work and control PLC
- [ ] No errors in browser console

---

## 🎉 You're Done!

Your web HMI is now connected to your real PLC!

**Next Steps:**
- Customize the UI colors/layout
- Add more status indicators
- Integrate with ctrlX recipe manager
- Add alarm/event logging
- Deploy to production

**Need Help?**
- Check browser console for errors
- Review ctrlX Data Layer documentation
- Test with ctrlX Data Layer browser first
- Verify PLC variable paths are correct

---

**Last Updated:** January 2026
**Compatible with:** ctrlX CORE with Data Layer API v2

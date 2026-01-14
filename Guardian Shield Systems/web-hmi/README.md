# Foam Block Carving Machine - Web HMI

Custom web-based HMI for controlling the foam block carving machine via ctrlX CORE PLC.

## 📁 Project Structure

```
web-hmi/
├── simple-version/
│   └── index.html              # Single-file HTML/JS/CSS HMI (recommended for quick deployment)
├── react-version/              # React-based HMI (more scalable, requires build process)
│   └── package.json
├── ctrlx-api-guide.js         # ctrlX Data Layer API helper functions
└── README.md                  # This file
```

## 🚀 Quick Start - Simple Version

### Option 1: Test Locally (Development)

1. **Open the HMI in a browser:**
   ```bash
   # Navigate to the simple-version folder
   cd web-hmi/simple-version

   # Open index.html in your browser
   # On Windows:
   start index.html
   ```

2. **The HMI will run in MOCK mode** - all data is simulated for testing the UI

### Option 2: Deploy to ctrlX CORE (Production)

1. **Enable Web Server on ctrlX CORE:**
   - Log into ctrlX CORE web interface
   - Navigate to Settings → Services
   - Enable "Web Server" if not already enabled

2. **Upload HMI files:**
   - Copy `index.html` to ctrlX CORE filesystem
   - Default location: `/var/www/html/` or custom web directory
   - You can use SFTP, SCP, or ctrlX CORE file manager

3. **Connect to real PLC data:**
   - Edit `index.html` (line 290-295)
   - Update `config.plcAddress` to your ctrlX IP address
   - Replace mock functions with real API calls (see instructions below)

4. **Access HMI:**
   - Open browser: `http://[ctrlX-IP-address]/index.html`
   - Or if in subfolder: `http://[ctrlX-IP-address]/hmi/index.html`

## 🔧 Connecting to Real PLC Data

### Step 1: Update Configuration

In `index.html`, find the configuration section (around line 290):

```javascript
const config = {
    plcAddress: '192.168.1.1',    // ← Change to your ctrlX IP
    updateInterval: 500,           // Update every 500ms
    apiBasePath: '/automation/api/v2'
};
```

### Step 2: Replace Mock Functions

Copy the real API functions from `ctrlx-api-guide.js`:

**Option A: Polling (Simple):**
```javascript
// Replace the getMockData() function with real API calls
async function readPLCVariable(varPath) {
    return await readPLCVariable(varPath);  // From ctrlx-api-guide.js
}

async function writePLCVariable(varPath, value) {
    return await writePLCVariable(varPath, value);  // From ctrlx-api-guide.js
}
```

**Option B: Bulk Read (Better Performance):**
```javascript
async function updatePLC() {
    const values = await readMultiplePLCVariables([
        'PLC_PRG.MACHINE_STATE',
        'PLC_PRG.stateMachine.isRunning',
        'PLC_PRG.stateMachine.isFaulted',
        'PLC_PRG.stateMachine.isHomed',
        'PLC_PRG.btn_DriveOn'
    ]);

    updateMachineState(values['PLC_PRG.MACHINE_STATE']);
    updateIndicator('indRunning', values['PLC_PRG.stateMachine.isRunning']);
    // ... etc
}
```

**Option C: WebSocket (Real-time, Most Efficient):**
```javascript
const ws = subscribeToVariables([
    'PLC_PRG.MACHINE_STATE',
    'PLC_PRG.stateMachine.isRunning'
], (data) => {
    updateMachineState(data['PLC_PRG.MACHINE_STATE']);
    updateIndicator('indRunning', data['PLC_PRG.stateMachine.isRunning']);
});
```

### Step 3: Configure Authentication

The ctrlX Data Layer requires authentication. Update in `ctrlx-api-guide.js`:

```javascript
const CTRLX_CONFIG = {
    host: '192.168.1.1',           // Your ctrlX IP
    port: 443,                     // HTTPS port
    username: 'boschrexroth',      // Your username
    password: 'boschrexroth',      // Your password
    basePath: '/automation/api/v2'
};
```

## 📊 Features

### ✅ Current Features (Simple Version)

- **Machine Status Display** - Real-time state visualization
- **Control Buttons** - Start, Stop, Home, Manual, Reset, E-Stop, Drive On/Off
- **Recipe Selection** - Choose from multiple recipes
- **Status Indicators** - Running, Faulted, Homed, Drives Powered
- **Connection Status** - Visual indicator of PLC connection
- **Responsive Design** - Works on desktop, tablet, and mobile
- **Mock Mode** - Test UI without PLC connection

### 🔄 Machine States

The HMI displays these machine states with color coding:

- **INIT** (Gray) - Initializing
- **IDLE** (Blue) - Ready to operate
- **HOMING** (Purple) - Homing axes
- **MANUAL** (Orange) - Manual mode
- **RUNNING** (Green) - Active processing
- **STOPPING** (Orange) - Stopping sequence
- **FAULTED** (Red) - Error condition
- **E_STOPPED** (Dark Red) - Emergency stopped
- **RESETTING** (Indigo) - Resetting from fault

## 🔐 Security Considerations

1. **HTTPS** - ctrlX Data Layer uses HTTPS by default
2. **Authentication** - Required for all API calls
3. **Token Refresh** - Auth tokens expire; code handles re-authentication
4. **CORS** - May need to configure CORS if hosting HMI externally
5. **User Permissions** - Ensure PLC user has appropriate read/write permissions

## 🐛 Troubleshooting

### Problem: "Connection lost" error

**Solutions:**
- Verify ctrlX IP address is correct
- Check network connectivity
- Ensure Web Server is enabled on ctrlX
- Verify authentication credentials
- Check firewall settings

### Problem: CORS errors in browser console

**Solutions:**
- Host HMI on ctrlX CORE directly (no CORS issues)
- Or configure ctrlX to allow CORS from your domain
- Or use a reverse proxy

### Problem: Variables not updating

**Solutions:**
- Verify PLC variable paths match your program structure
- Check that PLC is running
- Ensure variables are not optimized out by compiler
- Use ctrlX Web Interface to verify variable exists in Data Layer

### Problem: Authentication fails

**Solutions:**
- Check username/password
- Verify user has Data Layer access permissions
- Try default credentials: `boschrexroth` / `boschrexroth`
- Check ctrlX user management settings

## 📱 Mobile Access

The HMI is fully responsive and works on mobile devices:

1. **Same Network:** Access via `http://[ctrlX-IP]/index.html`
2. **Remote Access:** Set up VPN or port forwarding (security considerations apply)
3. **Touch-Friendly:** All buttons sized for touch interaction

## 🎨 Customization

### Changing Colors

Edit the CSS in `index.html` (style section):

```css
.state-display.RUNNING { color: #10b981; }  /* Green for running */
.btn-start { background: #10b981; }         /* Button colors */
```

### Adding New Controls

1. Add button HTML in the controls section
2. Create onclick handler function
3. Map to PLC variable in `plcVars` object
4. Update `sendCommand()` function

### Adding More Status Indicators

1. Add indicator HTML in status grid
2. Read variable in `updatePLC()` function
3. Call `updateIndicator()` with element ID and value

## 📈 Performance Tips

1. **Use Bulk Reads** - Read multiple variables in one request
2. **Optimize Update Rate** - Don't update faster than necessary (500ms is usually fine)
3. **Use WebSockets** - For real-time updates without polling
4. **Cache Static Data** - Don't re-read recipe names every cycle

## 🔄 React Version

The React version provides:
- Component-based architecture
- Better state management
- Easier to extend and maintain
- TypeScript support (optional)

To use React version:

```bash
cd react-version
npm install
npm start       # Development
npm run build   # Production build
```

Deploy the `build/` folder to ctrlX web server.

## 📝 Next Steps

1. ✅ Test HMI in mock mode locally
2. ⬜ Connect to ctrlX Data Layer API
3. ⬜ Test with real PLC
4. ⬜ Customize UI for your needs
5. ⬜ Add alarm/event logging
6. ⬜ Add trend charts for monitoring
7. ⬜ Integrate with ctrlX recipe manager

## 📚 Additional Resources

- [ctrlX CORE Documentation](https://docs.automation.boschrexroth.com/)
- [ctrlX Data Layer API Guide](https://docs.automation.boschrexroth.com/doc/sdk/)
- [REST API Reference](https://docs.automation.boschrexroth.com/api/)

## 💡 Tips

- Start with mock mode to design your UI
- Test authentication separately before integrating
- Use browser DevTools Network tab to debug API calls
- Consider adding a "Debug Mode" toggle to show raw PLC data
- Log errors to help troubleshoot connection issues

## 🤝 Support

For issues specific to:
- **HMI Code:** Check this README and ctrlx-api-guide.js
- **ctrlX API:** Refer to Bosch Rexroth documentation
- **PLC Variables:** Verify in ctrlX Data Layer browser

---

**Version:** 1.0
**Last Updated:** January 2026
**Compatible with:** ctrlX CORE (all versions with Data Layer)

# Guardian Shield Systems - Foam Block Carving Machine

Automated foam block processing system with 36-axis motion control.

## 📁 Project Structure

```
Guardian Shield Systems/
├── plc-code/
│   ├── function-blocks/       # PLC function blocks (FB_*)
│   │   ├── FB_AxisPower.txt
│   │   ├── FB_ButtonManager.txt
│   │   ├── FB_MachineStateMachine.txt
│   │   └── FB_MotionSequence.txt
│   │
│   ├── data-types/            # Data structures and enumerations
│   │   ├── E_MachineState.txt
│   │   ├── E_MotionStep.txt
│   │   ├── ST_MotionParameters.txt
│   │   └── ST_PositionSetpoints.txt
│   │
│   ├── programs/              # Main PLC programs
│   │   └── PLC_PRG.txt
│   │
│   └── documentation/         # Technical documentation
│       └── Project Overview.txt
│
└── web-hmi/                   # Web-based HMI interface
    ├── simple-version/
    │   └── index.html         # Single-file web HMI
    ├── react-version/         # React-based HMI (optional)
    ├── ctrlx-api-guide.js    # API helper functions
    └── README.md              # HMI documentation
```

## 🎯 Project Overview

**Machine Type:** Automated Foam Block Carving Machine
**Controller:** Bosch ctrlX CORE PLC
**Language:** IEC 61131-3 Structured Text
**Total Axes:** 36 servo axes (18 masters, 18 geared slaves)
**Operations:** Block loading, stud carving, window/door cutting, electrical trough, unloading

## 🚀 Quick Start

### PLC Code

1. **Import Data Types First:**
   - `E_MachineState.txt`
   - `E_MotionStep.txt`
   - `ST_MotionParameters.txt`
   - `ST_PositionSetpoints.txt`

2. **Import Function Blocks:**
   - `FB_ButtonManager.txt`
   - `FB_AxisPower.txt`
   - `FB_MachineStateMachine.txt`
   - `FB_MotionSequence.txt`

3. **Import Main Program:**
   - `PLC_PRG.txt`

### Web HMI

See [web-hmi/README.md](web-hmi/README.md) for complete instructions.

**Quick test:**
```bash
cd web-hmi/simple-version
start index.html
```

## 📖 Documentation

### PLC Code Documentation

- **[Project Overview](plc-code/documentation/Project%20Overview.txt)** - Comprehensive system documentation including:
  - Machine description and specifications
  - Program structure and architecture
  - Axis configuration (all 36 axes)
  - Motion sequence state machine
  - Control flow and operation
  - Data structures
  - Future enhancements
  - Debugging tips

### Function Blocks

**FB_MachineStateMachine**
- High-level machine control
- States: INIT, IDLE, HOMING, MANUAL, RUNNING, STOPPING, FAULTED, E_STOPPED, RESETTING
- Manages safety (E-stop handling)
- Coordinates button inputs with motion sequence

**FB_MotionSequence**
- 36-axis motion coordination
- 6 main motion states with substeps
- Permanent electronic gearing (18 slave axes)
- Sequential motion choreography

**FB_AxisPower**
- Centralized axis power control
- Powers all 36 axes on/off
- Handles power-up and shutdown

**FB_ButtonManager**
- Button debouncing and edge detection
- Command prioritization
- Clean button interface for state machine

### Data Types

**E_MachineState** - Machine state enumeration
**E_MotionStep** - Motion sequence enumeration
**ST_MotionParameters** - Velocity, acceleration, jerk, tolerance
**ST_PositionSetpoints** - All axis target positions (30+ positions)

## 🔧 Development Workflow

### Modifying PLC Code

1. Edit files in `plc-code/` folders
2. Test in simulation or on ctrlX CORE
3. Commit changes to git
4. Update documentation if needed

### Modifying Web HMI

1. Edit `web-hmi/simple-version/index.html` for UI changes
2. Test locally in browser (mock mode)
3. Connect to ctrlX Data Layer API for real testing
4. Deploy to ctrlX web server

## 🔄 Version Control

This project uses Git for version control:

```bash
# View commit history
git log --oneline

# Create a commit
git add .
git commit -m "Description of changes"
git push

# Revert to previous version
git reset --hard [commit-hash]
```

## 📊 System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    PLC_PRG (Main)                       │
├─────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │ Button       │  │ Axis         │  │ Machine      │ │
│  │ Manager      │  │ Power        │  │ State        │ │
│  │ (FB)         │  │ (FB)         │  │ Machine (FB) │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
│                            │                            │
│                    ┌───────▼───────┐                    │
│                    │ Motion        │                    │
│                    │ Sequence (FB) │                    │
│                    └───────────────┘                    │
│                            │                            │
│         ┌──────────────────┼──────────────────┐        │
│         ▼                  ▼                  ▼         │
│   18 Masters      18 Geared Slaves    MC_MoveAbsolute  │
└─────────────────────────────────────────────────────────┘
         │                                      │
         ▼                                      ▼
    ctrlX CORE                           Web HMI
    Data Layer ◄──────────────────────► (Browser)
```

## 🛠️ Hardware Configuration

**Controller:** Bosch ctrlX CORE
**Motion Library:** PLCopen Motion Control
**Drive System:** EtherCAT servo drives
**I/O:** Digital inputs for buttons, safety circuits
**Network:** Industrial Ethernet

**Axes:**
- Axes 1-13: Loading/unloading system
- Axes 14-29: Stud carving (8 pairs of hot wire cutters)
- Axes 30-33: Window/door cutting system
- Axes 34-36: Electrical trough cutting

## 🚦 Machine Operation States

1. **INIT** → **IDLE** - Power up sequence
2. **IDLE** → **HOMING** - Home all axes (if needed)
3. **IDLE** → **RUNNING** - Start automatic sequence
4. **RUNNING** - Execute motion sequence
5. **STOPPING** - Controlled shutdown
6. **FAULTED** - Error condition, requires reset
7. **E_STOPPED** - Emergency stop active
8. **MANUAL** - Manual jog mode

## 🔐 Safety Features

- Emergency stop handling
- State machine-based safety logic
- Drive power management
- Error detection and handling
- Recipe locking during operation

## 📝 Future Enhancements

- [ ] Integration with ctrlX recipe manager
- [ ] Hot wire PWM temperature control
- [ ] Advanced error recovery
- [ ] Production tracking and statistics
- [ ] Alarm logging and trending
- [ ] Automated block loading/unloading
- [ ] Integration with StrutSoft design software

## 📞 Support

**Controller:** Bosch ctrlX CORE
**Language:** IEC 61131-3 Structured Text
**Development Environment:** Bosch IDE / ctrlX WORKS

---

**Project:** Guardian Shield Systems - Foam Block Carving Machine
**Company:** Integrated ControlWorks, LLC
**Last Updated:** January 2026
**Version:** 1.0

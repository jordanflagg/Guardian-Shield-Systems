# Guardian Shield Systems - Foam Block Carving Machine

Automated foam block processing system with 36-axis motion control.

## 📁 Project Structure

```
Guardian Shield Systems/
├── plc-code/
│   ├── function-blocks/       # PLC function blocks (FB_*)
│   │   ├── FB_AxisGearing.txt       # Array-based gearing management (18 pairs)
│   │   ├── FB_AxisMover.txt         # Generic single-axis move handler
│   │   ├── FB_AxisPower.txt         # Drive power control for all 36 axes
│   │   ├── FB_ButtonManager.txt     # Button input with auto-clear
│   │   ├── FB_ErrorHandler.txt      # Centralized error handling
│   │   ├── FB_MachineStateMachine.txt  # Top-level state control
│   │   ├── FB_MotionSequence.txt    # Motion sequence orchestrator
│   │   ├── FB_MotionStep_LoadBlock.txt    # Load step (11 substeps)
│   │   ├── FB_MotionStep_Studs.txt        # Studs step (6 substeps)
│   │   ├── FB_MotionStep_WindowsDoors.txt # Windows step (6 substeps)
│   │   ├── FB_MotionStep_Electrical.txt   # Electrical step (6 substeps)
│   │   ├── FB_MotionStep_Unload.txt       # Unload step (5 substeps)
│   │   └── FB_MultiAxisMover.txt    # Multi-axis coordinated moves
│   │
│   ├── data-types/            # Data structures and enumerations
│   │   ├── E_MachineState.txt       # Machine state enumeration (9 states)
│   │   ├── E_MotionStep.txt         # Motion sequence phases (6 steps)
│   │   ├── ST_AxisMoveCmd.txt       # Axis move command structure
│   │   ├── ST_GearingPair.txt       # Gearing pair configuration
│   │   ├── ST_MotionError.txt       # Motion error information
│   │   ├── ST_MotionParameters.txt  # Velocity, acceleration, jerk
│   │   ├── ST_PositionSetpoints.txt # All axis target positions
│   │   └── ST_Recipe.txt            # Complete recipe structure
│   │
│   ├── global-variables/      # Global variable lists
│   │   └── GVL_Recipes.txt          # Recipe library (10 recipes, 7 active)
│   │
│   ├── programs/              # Main PLC programs
│   │   └── PLC_PRG.txt              # Main orchestrator program
│   │
│   └── documentation/         # Technical documentation
│       └── Project Overview.txt
│
└── web-hmi/                   # Web-based HMI interface
    ├── simple-version/
    │   ├── index.html               # Gradient-styled web HMI
    │   ├── index-industrial.html    # Industrial-styled web HMI (primary)
    │   ├── index-industrial-36axis.html  # WIP: Enhanced 36-axis visualization
    │   ├── recipes.html             # Recipe editor (gradient style)
    │   ├── recipes-industrial.html  # Recipe editor (industrial style)
    │   └── README-index-industrial.md  # JavaScript documentation
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
   - `ST_Recipe.txt`

2. **Import Global Variables:**
   - `GVL_Recipes.txt` (recipe library with 10 pre-configured recipes)

3. **Import Function Blocks (in order):**
   - `FB_AxisMover.txt` (helper - no dependencies)
   - `FB_MultiAxisMover.txt` (helper - depends on FB_AxisMover)
   - `FB_ButtonManager.txt`
   - `FB_AxisPower.txt`
   - `FB_AxisGearing.txt`
   - `FB_ErrorHandler.txt`
   - `FB_MotionStep_LoadBlock.txt`
   - `FB_MotionStep_Studs.txt`
   - `FB_MotionStep_WindowsDoors.txt`
   - `FB_MotionStep_Electrical.txt`
   - `FB_MotionStep_Unload.txt`
   - `FB_MotionSequence.txt` (depends on step FBs)
   - `FB_MachineStateMachine.txt` (top-level)

4. **Import Main Program:**
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

**FB_MachineStateMachine** (Top-level)
- High-level machine control
- States: INIT, IDLE, HOMING, MANUAL, RUNNING, STOPPING, FAULTED, E_STOPPED, RESETTING
- Manages safety (E-stop handling)
- Coordinates button inputs with motion sequence
- Manages gearing re-engagement after stops/faults
- Outputs motion visualization data for HMI
- Contains embedded FB_MotionSequence and FB_AxisGearing

**FB_MotionSequence** (Orchestrator)
- Orchestrates modular motion step FBs
- 6 main motion phases with recipe-driven conditional execution
- Delegates each phase to dedicated step FB
- Collects visualization data from active step
- Recipe loading and validation

**Motion Step FBs** (Modular)
- `FB_MotionStep_LoadBlock` - 11 substeps: shift, lift, center block
- `FB_MotionStep_Studs` - 6 substeps: 8-axis parallel stud carving
- `FB_MotionStep_WindowsDoors` - 6 substeps: window/door cutting
- `FB_MotionStep_Electrical` - 6 substeps: electrical trough cutting
- `FB_MotionStep_Unload` - 5 substeps: move block to unload area

**FB_AxisMover** (Helper)
- Generic single-axis move wrapper
- Encapsulates MC_MoveAbsolute with state machine
- Provides clean Done/Busy/Error interface
- Reduces repetitive execute/done/error pattern

**FB_MultiAxisMover** (Helper)
- Coordinates up to 8 parallel axis moves
- Waits for all enabled moves to complete
- Reports first error if any occur

**FB_AxisGearing** (Array-based)
- Centralized management of 18 gearing pairs via configuration array
- Loop-based FB calls instead of 18 separate instances
- Configurable via ST_GearingPair structure
- ~150 lines reduced to ~30 lines

**FB_AxisPower**
- Centralized axis power control
- Powers all 36 axes via MC_Power arrays
- Aggregates DrivesReady status from all axes
- Reports first error axis ID

**FB_ErrorHandler**
- Centralized error collection from all step FBs
- Latches first error until reset
- Provides ST_MotionError structure with full context
- Error codes by category (power, gearing, motion steps)

**FB_ButtonManager**
- Button debouncing and edge detection (R_TRIG)
- Auto-clear after one scan (one-shot behavior)
- Priority: E-Stop > Stop > Start > Home > Manual > Reset
- E-stop is level-sensitive (active while pressed)

### Data Types

**E_MachineState** - Machine state enumeration (9 states)
**E_MotionStep** - Motion sequence phases (6 steps with substep comments)
**ST_AxisMoveCmd** - Axis move command structure (axis, position, velocity, etc.)
**ST_GearingPair** - Gearing pair configuration (master, slave, ratio)
**ST_MotionError** - Error information (axis, code, step, description)
**ST_MotionParameters** - Velocity, acceleration, deceleration, jerk, tolerance
**ST_PositionSetpoints** - All axis target positions (60+ values)
**ST_Recipe** - Complete recipe structure (ID, name, description, flags, positions, parameters)

### Global Variables

**GVL_Recipes** - Recipe library containing 10 recipes (7 active, 3 reserved):
| Recipe | Name | Features |
|--------|------|----------|
| 1 | 8ft Standard Block | Studs, Windows, Electrical |
| 2 | 10ft Studs Only | Studs only |
| 3 | 8ft Windows Only | Windows only |
| 4 | 8ft Electrical Only | Electrical only |
| 5 | 12ft Full Block | All features (reduced velocity) |
| 6 | 4ft Quick Test | All features (test speed) |
| 7 | 8ft Studs+Windows | Studs and windows only |

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
┌─────────────────────────────────────────────────────────────────────────┐
│                           PLC_PRG (Main)                                 │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────────────┐│
│  │ FB_Button    │  │ FB_Axis      │  │ FB_MachineStateMachine         ││
│  │ Manager      │  │ Power        │  │  ├─ FB_AxisGearing (array)     ││
│  │ (auto-clear) │  │ (DrivesReady)│  │  └─ FB_MotionSequence          ││
│  └──────────────┘  └──────────────┘  │       ├─ FB_MotionStep_LoadBlock│
│         │                │           │       ├─ FB_MotionStep_Studs    ││
│         ▼                ▼           │       ├─ FB_MotionStep_Windows  ││
│   Button Inputs    MC_Power x36      │       ├─ FB_MotionStep_Electrical│
│                    MC_Reset x36      │       ├─ FB_MotionStep_Unload   ││
│                                      │       └─ FB_ErrorHandler        ││
│                                      └────────────────────────────────┘│
│                                                        │                │
│   ┌────────────────────────────────────────────────────┘                │
│   │                                                                     │
│   ▼                                                                     │
│  ┌─────────────┐    ┌──────────────────┐    ┌─────────────┐            │
│  │ GVL_Recipes │    │ FB_AxisMover x N │    │ 18 Slaves   │            │
│  │ (10 recipes)│───▶│ (per step FB)    │───▶│ Geared 1:1  │            │
│  └─────────────┘    └──────────────────┘    └─────────────┘            │
└─────────────────────────────────────────────────────────────────────────┘
         │                                         │
         ▼                                         ▼
    ctrlX CORE                                Web HMI
    Data Layer ◄────────────────────────────► (Browser)
         │
         ▼
   HMI Variables:
   - MACHINE_STATE, HMI_MotionStep, HMI_ActiveAxesMask
   - HMI_StepDescription, Recipe info, Error info
```

## 🛠️ Hardware Configuration

**Controller:** Bosch ctrlX CORE
**Motion Library:** PLCopen Motion Control
**Drive System:** EtherCAT servo drives
**I/O:** Digital inputs for buttons, safety circuits
**Network:** Industrial Ethernet

**Axes (36 total: 18 masters, 18 geared slaves):**

| Axes | Function | Type |
|------|----------|------|
| 1 | Block shift left/right | Independent |
| 2-5 | Load table lift (2=master, 3-5=slaves) | Geared group |
| 6-7 | Shift center (6=master, 7=slave) | Geared pair |
| 8-9 | Unload pusher (8=master, 9=slave) | Geared pair |
| 10-13 | Unload table lift (10=master, 11-13=slaves) | Geared group |
| 14-29 | Stud carving - 8 pairs (even=master, odd=slave) | 8 geared pairs |
| 30-33 | Window/door cutting (30-31=masters, 32-33=slaves) | 2 geared pairs |
| 34 | Electrical approach | Independent |
| 35-36 | Electrical cutting (35=master, 36=slave) | Geared pair |

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

- [x] Recipe management system (10 recipes with flexible operation flags)
- [x] Centralized gearing management (FB_AxisGearing - now array-based)
- [x] Active axes visualization for HMI (bitmask + step descriptions)
- [x] Industrial-styled web HMI with real-time PLC communication
- [x] Modular motion step FBs for maintainability
- [x] Centralized error handling (FB_ErrorHandler)
- [x] Generic axis mover helper (FB_AxisMover)
- [ ] Complete 36-axis HMI visualization with gearing group highlights
- [ ] Hot wire PWM temperature control
- [ ] Advanced error recovery
- [ ] Production tracking and statistics
- [ ] Alarm logging and trending
- [ ] Automated block loading/unloading
- [ ] Integration with StrutSoft design software
- [ ] Homing sequence implementation (currently stub)
- [ ] Manual jog mode implementation (currently stub)

## 📞 Support

**Controller:** Bosch ctrlX CORE
**Language:** IEC 61131-3 Structured Text
**Development Environment:** Bosch IDE / ctrlX WORKS

---

**Project:** Guardian Shield Systems - Foam Block Carving Machine
**Company:** Integrated ControlWorks, LLC
**Last Updated:** January 2026
**Version:** 2.0 (Modular Architecture Refactor)

# Project Instructions for Claude

## Project Overview

This is the **Guardian Shield Systems** project - an automated foam block carving machine for building panel construction.

### Machine Description
- Processes foam blocks (4-16 ft long, 4 ft high, 8-24 in deep)
- 36 coordinated servo axes with absolute encoders (no homing required)
- 18 permanent electronic gearing pairs (slave axes follow masters 1:1)
- 6 hot wires controlled by PWM for temperature regulation
- Target accuracy: ±1/8 inch

### Process Flow
1. Fork truck loads raw foam block onto load table
2. Block is shifted and centered in the processing area
3. Hot wire cutting carves stud cavities (for wall framing)
4. Hot wire cutting carves window/door openings
5. Hot wire cutting carves vertical electrical conduit troughs
6. Finished block is shifted to unload table for fork truck removal

### Technology Stack
- **Controller**: Bosch ctrlX CORE
- **Language**: Structured Text (IEC 61131-3)
- **Motion Library**: MB_GearInPos, MC_MoveAbsolute, MC_Power, MC_Reset, MC_Jog, MC_Halt
- **Data Layer**: CXA_Datalayer (DL_WriteNode for global error clearing)

## Program Architecture

```
PLC_PRG (Main Program - Orchestrator)
│
├── FB_ButtonManager - Handles operator inputs with edge detection
├── FB_AxisPower - Centralized power management for all 36 axes
├── FB_AxisGearing - Manages 18 permanent gearing relationships
├── FB_AxisData - Provides axis data to HMI via data layer
│
├── FB_MachineStateMachine - Top-level state control (safety layer)
│   ├── FB_MotionSequence - Orchestrates motion steps
│   │   ├── FB_MotionStep_LoadBlock (11 substeps)
│   │   ├── FB_MotionStep_Studs (6 substeps)
│   │   ├── FB_MotionStep_WindowsDoors (6 substeps)
│   │   ├── FB_MotionStep_Electrical (6 substeps)
│   │   └── FB_MotionStep_Unload (5 substeps)
│   ├── FB_AxisManual - Manual jog control
│   └── FB_ErrorHandler - Centralized error collection
│
└── Helper FBs:
    ├── FB_AxisMover - Wraps MC_MoveAbsolute with state machine
    └── FB_MultiAxisMover - Coordinates up to 8 parallel axis moves
```

## Axis Configuration

### Master Axes (18 total - receive motion commands)
- Axis 1: Block shift to left wall (independent)
- Axis 2: Load table lift (master for 3, 4, 5)
- Axis 6: Load table pusher (master for 7)
- Axis 8: Processing/unload table pusher (master for 9)
- Axis 10: Processing/unload table lift (master for 11, 12, 13)
- Axes 14, 15, 18, 19, 22, 23, 26, 27: Stud carving stations (4 vertical + 4 horizontal pairs)
- Axis 30: Horizontal positioning - rack & pinion (master for 32)
- Axis 31: Vertical hot wire (master for 33)
- Axis 34: Unload table shift wall (independent)
- Axes 35, 36: Electrical trough cutters (independent)

### Slave Axes (18 total - follow masters via MB_GearInPos)
All gearing is permanent (1:1 ratio) and managed by FB_AxisGearing.

## State Machines

### Machine State (FB_MachineStateMachine)
`INIT → IDLE → HOMING/MANUAL/RUNNING → STOPPING/FAULTED/E_STOPPED → RESETTING → IDLE`

### Motion Sequence (FB_MotionSequence)
`WAIT_FOR_LOAD → SHIFT_TO_PROCESSING_AREA → STUDS → WINDOWS_DOORS → ELECTRICAL → SHIFT_TO_UNLOAD_AREA → SEQUENCE_COMPLETE`

## Coding Standards

### Structured Text Conventions
- Use `camelCase` for local variables
- Use `PascalCase` for function blocks, methods, and types
- Prefix enumerations with `E_` (e.g., `E_MachineState`)
- Prefix structures with `ST_` (e.g., `ST_MotionError`)
- Prefix function blocks with `FB_` (e.g., `FB_AxisMover`)
- Prefix global variable lists with `GVL_` (e.g., `GVL_Recipes`)

### Motion Control Patterns
```iec
// Single axis move pattern
targetPosAxis# := positions.axis#_Position;
executeAxis#Move := TRUE;

IF fbMoveAxis#.Done THEN
    executeAxis#Move := FALSE;
    subStep := subStep + 1;
END_IF;

// Parallel axis move (wait for all)
IF fbMoveAxis14.Done AND fbMoveAxis18.Done THEN
    executeAxis14Move := FALSE;
    executeAxis18Move := FALSE;
    subStep := subStep + 1;
END_IF;
```

## Key Data Structures

- `E_MachineState`: INIT, IDLE, HOMING, MANUAL, RUNNING, STOPPING, FAULTED, E_STOPPED, RESETTING
- `E_MotionStep`: WAIT_FOR_LOAD, SHIFT_TO_PROCESSING_AREA, STUDS, WINDOWS_DOORS, ELECTRICAL, SHIFT_TO_UNLOAD_AREA
- `E_ActiveCommand`: CMD_NONE, CMD_START, CMD_STOP, CMD_HOME, CMD_MANUAL, CMD_RESET
- `ST_MotionError`: hasError, errorAxisID, errorCode, errorStep, errorSubStep, errorDescription
- `ST_MotionParameters`: defaultVelocity, defaultAcceleration, defaultDeceleration, defaultJerk, positionTolerance
- `GVL_Recipes.RecipeLibrary[1..10]`: Contains position setpoints and motion parameters per recipe

## Error Handling

Error codes:
- 1001: Power error (FB_AxisPower)
- 1002: Gearing error (FB_AxisGearing)
- 2001-2005: Motion step errors (LoadBlock, Studs, WindowsDoors, Electrical, Unload)

FB_ErrorHandler collects errors from all subsystems with priority: Power > Gearing > Motion steps

## Important Notes

- E-stop can interrupt ANY state (highest priority)
- All axes use absolute encoders - no homing required
- Recipe is locked when entering RUNNING state
- Only master axes can be jogged manually (slaves follow via gearing)
- Global error clearing uses CXA_Datalayer `diagnosis/confirm/all-errors`

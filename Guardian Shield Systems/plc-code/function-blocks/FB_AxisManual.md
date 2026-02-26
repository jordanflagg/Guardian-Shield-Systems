# FB_AxisManual: The Operator's Hand

## The Story

There's a moment in every commissioning project that separates good machines from great ones: the first time an operator needs to manually jog an axis.

Maybe there's a foam scrap stuck under a carriage. Maybe they need to position an axis for maintenance. Maybe they just want to *feel* how the machine responds before trusting it with expensive material.

In that moment, they don't want to think about PLCopen function blocks, gearing relationships, or axis references. They want to press a button and watch the axis move. Press another button, it stops. Simple. Intuitive. Safe.

**FB_AxisManual makes that possible.** It's the bridge between human intention and machine motion, wrapped in protective logic that prevents operators from accidentally destroying something.

## What It Does

FB_AxisManual provides manual jog control for a single axis at a time:

- **Velocity-controlled jogging** via MC_Jog
- **Master axis validation** - prevents jogging slave axes (they follow their masters)
- **Direction control** - positive or negative with clear priority rules
- **Safety integration** - only works when machine is in MANUAL state
- **Clean axis switching** - stops current jog before changing axes

## The Master-Slave Protection

Here's the critical safety feature: **this machine has 18 master-slave gearing pairs.**

If you jog a slave axis directly while it's geared to a master, you create a fight between:
- The jog command trying to move the slave
- The gearing command trying to hold the slave in sync with the master

That fight destroys things. Best case: drive fault. Worst case: mechanical damage.

FB_AxisManual solves this by validating against the master axis list:

```iecst
// Validate axis selection - only master axes allowed for jogging
isValidAxis := FALSE;
FOR i := 1 TO GVL_Axes.MASTER_AXIS_COUNT DO
    IF AxisSelect = GVL_Axes.MASTER_AXES[i] THEN
        isValidAxis := TRUE;
        EXIT;
    END_IF
END_FOR

IF NOT isValidAxis THEN
    Error := TRUE;
    ErrorID := 16#8001;  // Invalid axis selection
    InvalidAxis := TRUE;
    Active := FALSE;
    RETURN;
END_IF
```

Try to jog axis 16 (a slave)? The FB refuses with `InvalidAxis := TRUE`. The HMI can show a warning: *"Axis 16 is a slave axis and cannot be jogged directly. Jog master axis 14 instead."*

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           FB_AxisManual                                  │
│                                                                          │
│  ┌───────────┐                                                          │
│  │  INPUTS   │                                                          │
│  │           │                                                          │
│  │ Enable    │───┐                                                      │
│  │AxisSelect │   │                                                      │
│  │JogPositive│   │                                                      │
│  │JogNegative│   │                                                      │
│  │JogVelocity│   │                                                      │
│  └───────────┘   │                                                      │
│                  │                                                      │
│                  ▼                                                      │
│       ┌─────────────────────────────────────────────────────────┐      │
│       │              Validation Layer                            │      │
│       │                                                          │      │
│       │   ┌─────────────────────────────────────────────────┐   │      │
│       │   │         Is axis in MASTER_AXES list?             │   │      │
│       │   │                                                   │   │      │
│       │   │   GVL_Axes.MASTER_AXES = [1,2,6,8,10,14,15,...]  │   │      │
│       │   └─────────────────────────────────────────────────┘   │      │
│       │                       │                                  │      │
│       │               YES ────┼──── NO ──▶ InvalidAxis = TRUE   │      │
│       │                       │                                  │      │
│       └───────────────────────┼──────────────────────────────────┘      │
│                               ▼                                          │
│       ┌─────────────────────────────────────────────────────────┐      │
│       │              Direction Logic                             │      │
│       │                                                          │      │
│       │   JogPositive AND NOT JogNegative ──▶ jogDirection = 1  │      │
│       │   JogNegative AND NOT JogPositive ──▶ jogDirection = -1 │      │
│       │   ELSE ──▶ jogDirection = 0 (stopped)                    │      │
│       └───────────────────────────────────────────────────────────┘      │
│                               │                                          │
│                               ▼                                          │
│       ┌─────────────────────────────────────────────────────────┐      │
│       │                     MC_Jog                               │      │
│       │                                                          │      │
│       │   JogForward  := (jogDirection = 1)                     │      │
│       │   JogBackward := (jogDirection = -1)                    │      │
│       │   Velocity    := ABS(JogVelocity)                       │      │
│       │   Acceleration := 100.0  (default)                      │      │
│       │   Deceleration := 100.0  (default)                      │      │
│       │   Jerk        := 1000.0 (default)                       │      │
│       └─────────────────────────────────────────────────────────┘      │
│                                                                          │
│  ┌───────────┐                                                          │
│  │  OUTPUTS  │                                                          │
│  │           │                                                          │
│  │ Active    │ ◀── fbJog.Active                                        │
│  │ Error     │ ◀── fbJog.Error OR validation error                     │
│  │ ErrorID   │                                                          │
│  │InvalidAxis│                                                          │
│  └───────────┘                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## The Jog Pattern: Hold to Move

MC_Jog implements a **dead-man switch** pattern:

- **Hold JogPositive** → axis moves in positive direction
- **Release JogPositive** → axis stops
- **Hold JogNegative** → axis moves in negative direction
- **Release JogNegative** → axis stops

This is fundamentally different from FB_AxisMover's "command and complete" pattern. Jogging is continuous - motion happens *while* the button is held. Release the button, and the axis decelerates to a stop.

Why this pattern? **Safety.** If the operator sees something wrong, their natural reaction is to let go. That stops the motion. No searching for a stop button, no remembering which key to press. Just let go.

## Integration with the State Machine

FB_AxisManual only works when the machine is in MANUAL state:

```iecst
// In FB_MachineStateMachine
E_MachineState.MANUAL:
    isManualMode := TRUE;

    axisManual(
        Enable := isManualMode,
        AxisSelect := PLC_PRG.HMI_JogAxis,
        JogPositive := PLC_PRG.HMI_JogEnable AND PLC_PRG.HMI_JogDirection,
        JogNegative := PLC_PRG.HMI_JogEnable AND NOT PLC_PRG.HMI_JogDirection,
        JogVelocity := PLC_PRG.HMI_JogSpeed
    );

    IF NOT manualMode THEN
        isManualMode := FALSE;
        currentState := E_MachineState.IDLE;
    END_IF
```

When the machine leaves MANUAL state, the `Enable := FALSE` causes FB_AxisManual to immediately stop any active jog. No motion carries over into other states.

## The Axis Change Logic

What happens when an operator changes which axis they're jogging?

Bad approach: Let the old axis keep moving while the new axis starts.
Good approach: Stop the old axis first, then start the new one.

```iecst
// Handle axis change - stop jog before switching
IF AxisSelect <> lastAxisSelect THEN
    fbJog(
        Axis := axisRef,
        JogForward := FALSE,
        JogBackward := FALSE,
        Velocity := 0
    );
    jogDirection := 0;
    lastAxisSelect := AxisSelect;
END_IF
```

This ensures only one axis is ever jogging at a time. Clean, predictable, safe.

## Why These Default Motion Parameters?

Look at the hardcoded values:
```iecst
fbJog(
    ...
    Acceleration := 100.0,    // mm/s^2
    Deceleration := 100.0,    // mm/s^2
    Jerk := 1000.0            // mm/s^3
);
```

These are deliberately **conservative**:
- **Acceleration/Deceleration of 100 mm/s²** - gentle enough that operators aren't surprised by sudden movement
- **Jerk of 1000 mm/s³** - smooth transitions that don't stress mechanical components

Manual jogging isn't about speed - it's about control. Operators jog slowly because they're watching, adjusting, positioning. Fast acceleration would be jarring and potentially dangerous.

## Error Code Design

The custom error code `16#8001` for invalid axis selection follows a pattern:

```iecst
ErrorID := 16#8001;  // Invalid axis selection
```

- **16#8xxx** - Custom application errors (not PLCopen standard)
- **16#8001** - Specifically "invalid axis selection"

This separates our application errors from MC_Jog's internal errors, making diagnostics clearer.

## Lessons Learned

### Bug We Fixed: Jog Not Stopping on Disable

Early versions had a bug where the axis would keep moving briefly after leaving MANUAL mode. The problem? We weren't calling MC_Jog with `JogForward := FALSE` when `Enable` went FALSE.

```iecst
// Reset outputs when disabled
IF NOT Enable THEN
    Active := FALSE;
    Error := FALSE;
    ErrorID := 0;
    InvalidAxis := FALSE;
    jogDirection := 0;

    // Stop any active jog (THIS WAS MISSING!)
    IF AxisSelect >= 1 AND AxisSelect <= 36 THEN
        axisRef := AXIF_CONFIG_INDEXES[AxisSelect];
        fbJog(
            Axis := axisRef,
            JogForward := FALSE,
            JogBackward := FALSE,
            Velocity := 0
        );
    END_IF

    RETURN;
END_IF
```

**Key insight**: When disabling an FB, you must actively stop any ongoing operations, not just stop calling them.

### Pitfall: Jogging into Limits

FB_AxisManual doesn't check software limits. If an operator jogs an axis past its limit, the drive will fault.

**Why not add limit checking?** Because the drives already have limits configured. Adding limit logic to the FB would create a second source of truth that could get out of sync. Better to let the drive protect itself.

**HMI best practice**: Display the current position and limits so operators can see where they are.

### Why Positive Takes Precedence

```iecst
IF JogPositive AND NOT JogNegative THEN
    jogDirection := 1;
ELSIF JogNegative AND NOT JogPositive THEN
    jogDirection := -1;
ELSE
    jogDirection := 0;
END_IF
```

What if both buttons are pressed? The code stops the axis (`jogDirection := 0`).

Why not let positive "win"? Because pressing both buttons is almost always an accident. The safest response to user confusion is to stop, not to pick a direction arbitrarily.

## Usage in the HMI

```
┌────────────────────────────────────────────────────────────────────┐
│                         MANUAL JOG SCREEN                           │
│                                                                     │
│   ┌─────────────────┐                                              │
│   │ Select Axis: [▼]│  ◀── HMI_JogAxis (only shows master axes)   │
│   │     Axis 14     │                                              │
│   └─────────────────┘                                              │
│                                                                     │
│   Current Position: 125.456 mm    ◀── from FB_AxisData            │
│   Current Velocity: 0.000 mm/s                                     │
│                                                                     │
│   ┌─────────────────────────┐                                      │
│   │   Jog Speed: [=====] 10 │  ◀── HMI_JogSpeed (0.1 - 50 mm/s)  │
│   └─────────────────────────┘                                      │
│                                                                     │
│   ┌─────┐         ┌─────┐                                          │
│   │  ◀  │  STOP   │  ▶  │  ◀── JogNegative / JogPositive         │
│   │  -  │         │  +  │                                          │
│   └─────┘         └─────┘                                          │
│                                                                     │
│   [Active ●]  [Error ○]  [Invalid Axis ○]                         │
└────────────────────────────────────────────────────────────────────┘
```

The HMI should:
1. Only show master axes in the dropdown (filter out slaves)
2. Display real-time position from FB_AxisData
3. Provide clear jog direction buttons
4. Show Active/Error/InvalidAxis status

## Interface Reference

### Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| Enable | BOOL | - | Enable manual mode (machine must be in MANUAL state) |
| AxisSelect | UINT | - | Selected axis number (1-36, only master axes allowed) |
| JogPositive | BOOL | - | Jog in positive direction (hold to jog) |
| JogNegative | BOOL | - | Jog in negative direction (hold to jog) |
| JogVelocity | LREAL | 10 | Jog velocity in mm/s |

### Outputs
| Name | Type | Description |
|------|------|-------------|
| Active | BOOL | Jog is currently active |
| Error | BOOL | Error occurred |
| ErrorID | ERROR_CODE | Error code from MC_Jog or 0x8001 for invalid axis |
| InvalidAxis | BOOL | TRUE if selected axis is not a valid master axis |

## The Human Element

FB_AxisManual exists because machines serve people, not the other way around.

An operator who can't manually position axes is at the mercy of automatic sequences. They can't fix problems, can't do setup, can't validate behavior. They're just pushing buttons and hoping.

Manual jog control gives operators agency. It says: *"This is your machine. You can move it. You can control it. We trust you."*

That trust, combined with the safety logic that prevents the truly dangerous mistakes, creates a machine that operators *want* to use. And a machine that operators trust is a machine that runs well.

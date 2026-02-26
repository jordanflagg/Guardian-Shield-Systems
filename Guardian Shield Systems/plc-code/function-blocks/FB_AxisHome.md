# FB_AxisHome: Finding Home

## The Story

"Homing" is one of those words that means different things to different people.

For traditional CNC machines with incremental encoders, homing is a ritual: the axis slowly creeps toward a limit switch, touches it, backs off, creeps forward again until the encoder index pulse aligns, and finally declares "I know where I am."

For this machine? **Homing is just going to zero.**

Thanks to absolute encoders, every axis knows exactly where it is the moment the drives power up. There's no search, no ritual, no uncertainty. The axis just... knows.

So "homing" becomes "return to home position" - moving all axes to position 0.0, where the machine starts its cycle.

**FB_AxisHome handles this with two modes:**
1. **Single axis homing** - Move one selected axis to zero
2. **All axes homing** - Move all 18 master axes to zero (in parallel batches)

## What It Does

FB_AxisHome provides:

- **Single axis moves** - Select an axis, press a button, it goes to zero
- **Batch homing** - Move all master axes to zero in coordinated groups
- **Real-time status** - Know which axes are already "homed" (at position zero)
- **Master axis validation** - Prevents homing slave axes directly
- **Error isolation** - Know exactly which axis failed if something goes wrong

## The "Always Reading" Pattern

Here's something subtle but important: FB_AxisHome reads **all 36 axis positions on every scan**, regardless of whether homing is active:

```iecst
// Read all axis positions and update homed status
// NOTE: Position reading is ALWAYS enabled (independent of homing mode Enable)
// This ensures AxisIsHomed status is always up-to-date for HMI display
FOR i := 1 TO 36 DO
    fbReadPos[i](
        Enable := TRUE,
        Axis := AXIF_CONFIG_INDEXES[i]
    );

    IF fbReadPos[i].Valid THEN
        currentPos := fbReadPos[i].Position;
        // Axis is "homed" if within tolerance of position 0
        AxisIsHomed[i] := ABS(currentPos) <= PositionTolerance;
    ELSE
        AxisIsHomed[i] := FALSE;
    END_IF
END_FOR
```

Why? Because the HMI always wants to know: *"Which axes are at their home position?"*

This information is valuable even when not actively homing:
- Before starting a cycle: "Are all axes in position?"
- During diagnostics: "Which axis moved?"
- After E-stop: "Where is everything?"

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                               FB_AxisHome                                    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                    Always Running: Position Monitoring                   ││
│  │                                                                          ││
│  │   ┌─────────────────────────────────────────────────────────────────┐  ││
│  │   │  FOR i := 1 TO 36 DO                                             │  ││
│  │   │      fbReadPos[i](Enable := TRUE, Axis := AXIF_CONFIG_INDEXES[i])│  ││
│  │   │      AxisIsHomed[i] := ABS(Position) <= PositionTolerance        │  ││
│  │   │  END_FOR                                                         │  ││
│  │   │                                                                   │  ││
│  │   │  AllAxesHomed := ALL(AxisIsHomed[MASTER_AXES])                   │  ││
│  │   └─────────────────────────────────────────────────────────────────┘  ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                    State Machine: Homing Operations                      ││
│  │                                                                          ││
│  │   ┌────────────────────────────────────────────────────────────────┐   ││
│  │   │ State 0: IDLE                                                   │   ││
│  │   │   │                                                             │   ││
│  │   │   ├── HomeSingle rising edge ──▶ State 1 (single axis)         │   ││
│  │   │   │                                                             │   ││
│  │   │   └── HomeAll rising edge ──▶ State 10 (batch homing)          │   ││
│  │   └────────────────────────────────────────────────────────────────┘   ││
│  │                                                                          ││
│  │   SINGLE AXIS PATH (States 1-2)                                         ││
│  │   ┌─────────────────────────────────────────────────────────────────┐  ││
│  │   │ State 1: Execute FB_AxisMover to position 0                     │  ││
│  │   │   │                                                              │  ││
│  │   │   └── Done ──▶ State 2 (wait for HomeSingle to clear)          │  ││
│  │   └─────────────────────────────────────────────────────────────────┘  ││
│  │                                                                          ││
│  │   BATCH HOMING PATH (States 10-14)                                      ││
│  │   ┌─────────────────────────────────────────────────────────────────┐  ││
│  │   │ State 10: Group 1 - Axes 1,2,6,8,10,14,15,18 (8 axes)          │  ││
│  │   │   │                                                              │  ││
│  │   │   ▼                                                              │  ││
│  │   │ State 11: Group 2 - Axes 19,22,23,26,27,30,31,34 (8 axes)      │  ││
│  │   │   │                                                              │  ││
│  │   │   ▼                                                              │  ││
│  │   │ State 12: Group 3 - Axes 35,36 (2 axes)                        │  ││
│  │   │   │                                                              │  ││
│  │   │   └── Done ──▶ State 13/14 (complete)                          │  ││
│  │   └─────────────────────────────────────────────────────────────────┘  ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ OUTPUTS                                                                │  │
│  │                                                                        │  │
│  │   Busy            - Homing operation in progress                      │  │
│  │   Done            - Homing operation completed                        │  │
│  │   Error           - Homing error occurred                             │  │
│  │   ErrorAxisID     - Which axis caused the error                       │  │
│  │   AllAxesHomed    - TRUE when all master axes at position 0          │  │
│  │   AxisIsHomed[36] - Individual axis homed status                      │  │
│  │   InvalidAxis     - Selected axis is not a master                     │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

## The Three-Group Strategy

Why not move all 18 master axes simultaneously? Two reasons:

1. **FB_MultiAxisMover only supports 8 axes** per instance
2. **Power/current limits** - moving 18 heavy axes simultaneously might exceed the drive system's capacity

So we split into three sequential groups:

```
Group 1 (8 axes):  1, 2, 6, 8, 10, 14, 15, 18
Group 2 (8 axes):  19, 22, 23, 26, 27, 30, 31, 34
Group 3 (2 axes):  35, 36
```

Each group moves in parallel, then the next group starts. Total homing time is roughly 3× single-group time, not 18× single-axis time.

### The Error Axis Mapping Challenge

When FB_MultiAxisMover reports an error, it tells you which of its 8 slots had the problem (ErrorAxisNum = 1-8). But we need to know the *actual* axis number.

Hence this mapping logic:
```iecst
IF fbMoveGroup1.Error THEN
    // Map error axis number back to actual axis
    CASE fbMoveGroup1.ErrorAxisNum OF
        1: ErrorAxisID := 1;
        2: ErrorAxisID := 2;
        3: ErrorAxisID := 6;
        4: ErrorAxisID := 8;
        5: ErrorAxisID := 10;
        6: ErrorAxisID := 14;
        7: ErrorAxisID := 15;
        8: ErrorAxisID := 18;
    END_CASE
    state := 99;  // Error state
    ...
END_IF
```

Not elegant, but necessary. The operator needs to know "Axis 14 failed" not "Slot 6 in Group 1 failed."

## Position Tolerance: The "Close Enough" Problem

```iecst
PositionTolerance : LREAL := 0.5;  // mm

AxisIsHomed[i] := ABS(currentPos) <= PositionTolerance;
```

Why 0.5mm instead of exact zero? Because:

1. **Mechanical reality** - servos don't hold exactly at the commanded position
2. **Encoder resolution** - there's always some quantization
3. **Thermal effects** - positions drift slightly with temperature

0.5mm is tight enough to ensure proper cycle operation but loose enough to avoid false "not homed" readings when the axis is essentially at zero.

This value is a VAR_INPUT, so the HMI can adjust it if needed for specific situations.

## The State Machine in Detail

### State 0: IDLE
Waiting for a command. Both `HomeSingle` and `HomeAll` are monitored for rising edges.

Before executing either, we validate:
- Is `Enable` TRUE? (Must be in HOMING mode)
- For single axis: Is the selected axis a master? (Use `MASTER_AXES` list to check)

### States 1-2: Single Axis Homing
Simple two-state sequence:
1. Execute `FB_AxisMover` to move selected axis to position 0
2. Wait for `HomeSingle` to go FALSE, then return to IDLE

### States 10-13: Batch Homing
Four-state sequence for each group:
- State 10: Start Group 1, wait for completion
- State 11: Clear Group 1, start Group 2
- State 12: Clear Group 2, start Group 3
- State 13: Clear Group 3, set Done

State 14 waits for `HomeAll` to clear before returning to IDLE.

### State 99: ERROR
All movers are stopped, and the error information is preserved. Returns to IDLE when both `HomeSingle` and `HomeAll` go FALSE.

## Integration with State Machine

```iecst
// In FB_MachineStateMachine
E_MachineState.HOMING:
    fbHome(
        Enable := TRUE,
        HomeAxis := PLC_PRG.HMI_HomeAxis,
        HomeSingle := PLC_PRG.HMI_HomeSingle,
        HomeAll := PLC_PRG.HMI_HomeAll,
        Velocity := PLC_PRG.HMI_HomeSpeed,
        Acceleration := 5.0,
        Deceleration := 5.0,
        Jerk := 10.0,
        PositionTolerance := 0.5
    );

    isHomed := fbHome.AllAxesHomed;

    IF fbHome.Error THEN
        currentState := E_MachineState.FAULTED;
    END_IF

    IF NOT homeButton THEN
        fbHome(Enable := FALSE);
        currentState := E_MachineState.IDLE;
    END_IF
```

Notice that `AllAxesHomed` is continuously updated even outside HOMING mode:

```iecst
// ALWAYS UPDATE AXIS HOMED STATUS
IF currentState <> E_MachineState.HOMING THEN
    fbHome(
        Enable := FALSE,  // Don't allow homing operations
        ...
    );
    isHomed := fbHome.AllAxesHomed;  // But still read the status!
END_IF
```

## Lessons Learned

### Bug We Fixed: Position Reading During Homing

Early versions stopped reading positions during active homing. This caused a race condition where `AxisIsHomed` would show stale data, confusing the HMI.

**The fix**: Always read positions, regardless of state. The position reading loop runs every scan, period.

### Bug We Fixed: Forgetting to Disable Movers on Exit

When leaving HOMING mode (Enable → FALSE), all movers must be explicitly disabled:

```iecst
IF NOT Enable THEN
    fbMoveSingle(Execute := FALSE, AxisRef := AXIF_CONFIG_INDEXES[1]);
    fbMoveGroup1(Execute := FALSE);
    fbMoveGroup2(Execute := FALSE);
    fbMoveGroup3(Execute := FALSE);
    state := 0;
    ...
END_IF
```

Without this, a mover might continue executing its previous command when re-enabled.

### Pitfall: Axis Reference in Error State

In state 99 (ERROR), we clear the single-axis mover with a dummy axis reference:
```iecst
fbMoveSingle(Execute := FALSE, AxisRef := AXIF_CONFIG_INDEXES[1]);
```

Why axis 1? Because we need *some* valid reference. The FB requires it even for Execute := FALSE. Using the last `selectedAxis` would be cleaner but risks issues if it's zero.

This is a PLCopen quirk we worked around rather than fought.

## HMI Integration

```
┌────────────────────────────────────────────────────────────────────────────┐
│                           HOMING SCREEN                                     │
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │  AXIS HOMED STATUS                                                   │  │
│   │                                                                      │  │
│   │   1[●]  2[●]  6[○]  8[●]  10[●]  14[●]  15[●]  18[○]               │  │
│   │  19[●] 22[●] 23[●] 26[●]  27[●]  30[●]  31[●]  34[●]               │  │
│   │  35[●] 36[●]                                                        │  │
│   │                                                                      │  │
│   │  ● = At home (position 0)    ○ = Not at home                        │  │
│   └─────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │  SINGLE AXIS HOMING                                                  │  │
│   │                                                                      │  │
│   │  Select Axis: [ Axis 6 ▼]      [HOME SELECTED]                      │  │
│   │                                                                      │  │
│   │  Status: Busy [○]  Done [○]  Error [○]                              │  │
│   └─────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │  BATCH HOMING                                                        │  │
│   │                                                                      │  │
│   │  [HOME ALL AXES]     Progress: Group 2 of 3                         │  │
│   │                                                                      │  │
│   │  All Axes Homed: [○]                                                │  │
│   └─────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │  HOMING PARAMETERS                                                   │  │
│   │                                                                      │  │
│   │  Velocity: [====] 10 mm/s    Tolerance: [===] 0.5 mm                │  │
│   └─────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────┘
```

The `homeAllPhase` output (0-3) can drive a progress indicator, showing operators which group is currently moving.

## Interface Reference

### Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| Enable | BOOL | - | Enable homing mode |
| HomeAxis | UINT | - | Axis to home (1-36, must be master) |
| HomeSingle | BOOL | - | Rising edge: home selected axis |
| HomeAll | BOOL | - | Rising edge: home all master axes |
| Velocity | LREAL | 10.0 | Homing velocity (mm/s) |
| Acceleration | LREAL | 5.0 | Acceleration (mm/s²) |
| Deceleration | LREAL | 5.0 | Deceleration (mm/s²) |
| Jerk | LREAL | 10.0 | Jerk limit (mm/s³) |
| PositionTolerance | LREAL | 0.5 | Tolerance for "at home" check (mm) |

### Outputs
| Name | Type | Description |
|------|------|-------------|
| Busy | BOOL | Homing operation in progress |
| Done | BOOL | Homing operation completed |
| Error | BOOL | Homing error occurred |
| ErrorAxisID | UINT | Axis that caused error |
| AllAxesHomed | BOOL | TRUE when all master axes are at position 0 |
| AxisIsHomed | ARRAY[1..36] OF BOOL | Individual axis homed status |
| InvalidAxis | BOOL | Selected axis is not a master axis |

## The Philosophy

Homing might seem like a simple feature, but it touches something fundamental: **the machine's sense of where it is in the world.**

With incremental encoders, a machine that loses power becomes lost. It must "find itself" through a homing ritual before it can do anything useful.

With absolute encoders, that anxiety disappears. The machine always knows where it is. "Homing" becomes not "find home" but "go home" - a much simpler operation.

FB_AxisHome reflects this shift. It's not searching for a reference. It's not creeping toward limit switches. It's confidently commanding moves to a known position, with full knowledge of where every axis currently sits.

That confidence - born from absolute encoders - permeates the whole system and makes everything simpler.

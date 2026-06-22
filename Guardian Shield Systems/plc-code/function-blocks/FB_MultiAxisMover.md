# FB_MultiAxisMover: The Parallel Motion Conductor

## The Story

Imagine directing an orchestra where every musician must start and end their notes at precisely the same moment. That's the challenge of coordinated multi-axis motion.

In a CNC machine, many operations need multiple axes to move simultaneously:
- A gantry with X and Y moving together
- Four lift cylinders raising a table
- Eight stud-cutting axes positioning at once

Moving them one by one would be painfully slow. Moving them simultaneously requires coordination - starting together, tracking progress, detecting any failures, and knowing when *all* of them are done.

**FB_MultiAxisMover is that conductor.** It takes up to 8 FB_AxisMover instances, starts them together, monitors their progress, and signals completion only when the last one finishes.

## What It Does

FB_MultiAxisMover provides:

- **Parallel execution** - Up to 8 axes move simultaneously
- **Unified completion** - `Done` goes TRUE only when ALL enabled axes are complete
- **Error aggregation** - Reports the first axis that fails
- **Selective enabling** - Enable only the axes you need for each operation
- **Active mask** - Real-time bitmask showing which axes are still moving

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            FB_MultiAxisMover                                 │
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                         INPUT ARRAYS                                 │   │
│   │                                                                      │   │
│   │   Enable1, Axis1, Position1     Enable5, Axis5, Position5           │   │
│   │   Enable2, Axis2, Position2     Enable6, Axis6, Position6           │   │
│   │   Enable3, Axis3, Position3     Enable7, Axis7, Position7           │   │
│   │   Enable4, Axis4, Position4     Enable8, Axis8, Position8           │   │
│   │                                                                      │   │
│   │   Velocity, Acceleration, Deceleration, Jerk (shared by all)        │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                              │                                               │
│                              ▼                                               │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                       State Machine                                  │   │
│   │                                                                      │   │
│   │   State 0: IDLE                                                      │   │
│   │       │                                                              │   │
│   │       │ Execute rising edge                                         │   │
│   │       ▼                                                              │   │
│   │   State 1: MOVING                                                    │   │
│   │       │                                                              │   │
│   │       │  ┌──────────────────────────────────────────────────────┐  │   │
│   │       │  │ FB_AxisMover[1]  FB_AxisMover[2]  ...  FB_AxisMover[8]│  │   │
│   │       │  │    (if Enable1)     (if Enable2)       (if Enable8)   │  │   │
│   │       │  └──────────────────────────────────────────────────────┘  │   │
│   │       │                                                              │   │
│   │       │  Check all movers each scan:                                │   │
│   │       │  - anyError → State 3                                       │   │
│   │       │  - allDone AND NOT anyBusy → State 2                        │   │
│   │       │                                                              │   │
│   │       ▼                                                              │   │
│   │   State 2: DONE ◀──────────────────────────────────────────────────│   │
│   │       │                                                              │   │
│   │       └── Execute FALSE → State 0                                   │   │
│   │                                                                      │   │
│   │   State 3: ERROR                                                     │   │
│   │       │                                                              │   │
│   │       └── Execute FALSE → State 0                                   │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                              │                                               │
│                              ▼                                               │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                          OUTPUTS                                     │   │
│   │                                                                      │   │
│   │   Done           - All enabled moves completed                      │   │
│   │   Busy           - At least one move in progress                    │   │
│   │   Error          - At least one move failed                         │   │
│   │   ErrorAxisNum   - Which slot (1-8) had first error                │   │
│   │   ErrorID        - Error code from failed axis                      │   │
│   │   ActiveAxesMask - Bitmask of currently moving axes                │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

## The Completion Logic

Here's the critical insight: "done" means different things for different axes:

- **Enabled axis**: Must report Done = TRUE
- **Disabled axis**: Is already "done" by default (nothing to do)

So the check is:
```iecst
FOR i := 1 TO 8 DO
    IF enables[i] THEN
        IF NOT mover[i].Done THEN
            allDone := FALSE;
        END_IF
    END_IF
END_FOR
```

Only enabled axes count toward completion. An FB_MultiAxisMover with Enable1=TRUE, Enable2=TRUE, and Enable3-8=FALSE will complete when axes 1 and 2 are done - it doesn't wait for non-existent moves.

## The Active Axes Bitmask

```iecst
FOR i := 1 TO 8 DO
    IF enables[i] THEN
        IF mover[i].Active THEN
            activeMask := activeMask OR SHL(BYTE#1, i-1);
            anyBusy := TRUE;
        END_IF
        ...
    END_IF
END_FOR

ActiveAxesMask := activeMask;
```

This creates a bitmask where each bit represents one axis:
- Bit 0 (value 1): Axis 1 active
- Bit 1 (value 2): Axis 2 active
- Bit 2 (value 4): Axis 3 active
- ... and so on

So `ActiveAxesMask = 5` (binary 00000101) means axes 1 and 3 are moving, but 2 is not.

This is perfect for HMI visualization - light up indicators for each moving axis in real-time.

## Why Shared Motion Parameters?

Notice all axes share the same velocity, acceleration, deceleration, and jerk:

```iecst
VAR_INPUT
    Velocity : LREAL;
    Acceleration : LREAL;
    Deceleration : LREAL;
    Jerk : LREAL;
END_VAR
```

Why not individual parameters per axis?

In this machine, parallel moves are typically **coordinated motions** - axes that should move as a unit. The load table lifts with four cylinders; they should all move at the same speed. The stud cutters position together; they should all accelerate the same way.

Different speeds would cause:
- Mechanical stress as fast axes pull against slow ones
- Synchronization errors where one axis reaches position before others
- Confusing visual motion that operators might interpret as a problem

Shared parameters ensure the group moves as a cohesive unit.

## Usage Patterns

### Pattern 1: Homing Groups
FB_AxisHome uses FB_MultiAxisMover to home 8 axes at once:

```iecst
fbMoveGroup1(
    Execute := TRUE,
    Velocity := Velocity,
    Acceleration := Acceleration,
    Deceleration := Deceleration,
    Jerk := Jerk,
    Enable1 := TRUE, Axis1 := AXIF_CONFIG_INDEXES[1],  Position1 := 0.0,
    Enable2 := TRUE, Axis2 := AXIF_CONFIG_INDEXES[2],  Position2 := 0.0,
    Enable3 := TRUE, Axis3 := AXIF_CONFIG_INDEXES[6],  Position3 := 0.0,
    ...
);
```

### Pattern 2: Home All (non-kinematic masters)
`FB_AxisHome` uses one `FB_MultiAxisMover` (`fbMoveNonKin`) to send the 6 non-kinematic
master axes (1, 2, 6, 8, 10, 34) to position 0 simultaneously during a Home-All.

```iecst
fbMoveNonKin(
    Execute := TRUE,
    Enable1 := TRUE, Axis1 := AXIF_CONFIG_INDEXES[GVL_Axes.NON_KIN_MASTER_AXES[1]], Position1 := 0.0,
    // ... slots 2..6 for the remaining non-kin masters ...
);
```

(Historical note: earlier versions had `FB_MotionStep_Studs/_WindowsDoors/_Electrical` that
moved cutting axes in parallel. Those were removed in v3.0 — all cutting is now G-code driven.)

### Pattern 3: Selective Enabling
Not all operations need all 8 slots:

```iecst
fbMoveGroup3(
    Execute := TRUE,
    Enable1 := TRUE, Axis1 := AXIF_CONFIG_INDEXES[35], Position1 := 0.0,
    Enable2 := TRUE, Axis2 := AXIF_CONFIG_INDEXES[36], Position2 := 0.0,
    Enable3 := FALSE,  // Not used
    Enable4 := FALSE,
    Enable5 := FALSE,
    Enable6 := FALSE,
    Enable7 := FALSE,
    Enable8 := FALSE
);
```

## Error Handling Philosophy

When an error occurs, FB_MultiAxisMover:

1. **Records the first error** - ErrorAxisNum tells you which slot (1-8)
2. **Captures the error code** - ErrorID from that axis's FB_AxisMover
3. **Transitions to ERROR state** - Stops monitoring other axes

It does NOT:
- Stop the other axes (they continue to their done state)
- Try multiple resets
- Mask subsequent errors

Why this approach? Because **diagnosis requires clarity.** When something fails, you want to know:
- Which axis failed first
- What the error code was
- What state the other axes were in

Trying to be "smart" about error recovery often obscures the root cause. Better to report clearly and let higher-level code decide what to do.

## The Copy-To-Array Pattern

```iecst
// Copy enables to array for loop processing
enables[1] := Enable1;
enables[2] := Enable2;
enables[3] := Enable3;
...
```

Structured Text doesn't let you index VAR_INPUT directly like `Enable[i]`. So we copy to a local array for loop processing.

This is a common pattern when you have numbered inputs that need uniform processing. It's a bit verbose but keeps the loop logic clean.

## Lessons Learned

### Bug We Fixed: Type Declaration Error

The original code had:
```iecst
state : UNIT := 0;  // TYPO! Should be UINT
```

`UNIT` isn't a valid type - this was a typo for `UINT`. The compiler caught it, but it's a reminder that similar-looking identifiers can cause subtle issues.

### Bug We Fixed: Idle Movers Re-Reporting Stale Errors (Phantom Faults)

This FB stops calling its child `mover[1..8]` in its own IDLE (state 0) and ERROR (state 3) states. But `FB_AxisMover` only clears its latched ERROR on `Execute := FALSE`. So a child mover that errored on one run stayed stuck in ERROR, and the **next** `Execute` rising edge re-reported the **same stale `ErrorID`** — a phantom fault — even though the drive was fine. For Home-All, that meant a one-time axis fault could "stick" and re-trip every subsequent Home.

**The fix:** hold every child mover at `Execute := FALSE` while idle, so each gets a clean falling edge and is ready for a fresh rising edge next time:

```iecst
0: // IDLE
    Done := FALSE; Busy := FALSE; Error := FALSE; ActiveAxesMask := 0;

    FOR i := 1 TO 8 DO
        mover[i](Execute := FALSE);   // ← flush, or stale errors re-fire next run
    END_FOR

    IF executeRising THEN
        state := 1;
        Busy := TRUE;
    END_IF
```

Same root cause as the `FB_MotionStep_Unload` phantom fault — see `FB_AxisMover.md → The Phantom Fault`. The rule: **a latched FB that stops being called is not the same as a reset FB.**

### Pitfall: Edge vs Level Triggering

FB_MultiAxisMover uses **edge triggering** for Execute:
```iecst
executeRising := Execute AND NOT executePrev;
executePrev := Execute;
```

This is different from FB_AxisMover's level triggering. Why?

For single-axis moves, you often want to hold Execute TRUE while waiting for completion. For multi-axis coordination, you want to trigger once and let the FB manage the group.

Both patterns are valid; just be aware which one you're using.

### Pitfall: Checking Done While Busy

```iecst
ELSIF allDone AND NOT anyBusy THEN
    state := 2;
```

Why both checks? Because an axis can report `Done = TRUE` while still being `Active = TRUE` for a brief moment during state transitions. Checking `NOT anyBusy` ensures the motion has truly stopped before declaring the group done.

## Interface Reference

### Inputs
| Name | Type | Description |
|------|------|-------------|
| Execute | BOOL | Rising edge starts all moves |
| Velocity | LREAL | Move velocity (shared) |
| Acceleration | LREAL | Acceleration (shared) |
| Deceleration | LREAL | Deceleration (shared) |
| Jerk | LREAL | Jerk (shared) |
| Enable1-8 | BOOL | Enable each axis slot |
| Axis1-8 | AXIS_REF | Axis reference for each slot |
| Position1-8 | LREAL | Target position for each slot |

### Outputs
| Name | Type | Description |
|------|------|-------------|
| Done | BOOL | All enabled moves completed |
| Busy | BOOL | At least one move in progress |
| Error | BOOL | At least one move failed |
| ErrorAxisNum | UINT | Which slot (1-8) had first error |
| ErrorID | ERROR_CODE | Error code from failed axis |
| ActiveAxesMask | BYTE | Bitmask of currently moving axes |

## The Bigger Picture

FB_MultiAxisMover exists because **real machines don't move one axis at a time.**

A load table doesn't lift corner by corner - all four cylinders move together. Stud cutters don't position one at a time - they all reach their spots simultaneously. The unload sequence doesn't creep axis by axis - it flows as a coordinated dance.

Without FB_MultiAxisMover, achieving this coordination would mean:
- Duplicating state machine logic everywhere
- Tracking multiple Done/Error flags manually
- Writing error aggregation code repeatedly
- Inventing ad-hoc solutions for "wait for all"

With FB_MultiAxisMover, you get a tested, consistent tool for parallel motion. Set up the axes, trigger Execute, wait for Done. The complexity is hidden behind a clean interface.

That's the power of good abstraction: it makes the hard things feel easy, and the easy things feel inevitable.

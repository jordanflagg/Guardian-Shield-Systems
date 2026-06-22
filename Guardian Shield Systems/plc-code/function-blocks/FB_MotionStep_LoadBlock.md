# FB_MotionStep_LoadBlock: The Material Handler

## The Story

Every manufacturing cycle begins the same way: raw material must become work-in-progress.

For this machine, that means taking a foam block from the load table and positioning it precisely in the processing center. It sounds simple, but the choreography involves 5 different axes (plus their gantry slaves) working in sequence — lifting, shifting, and placing.

**FB_MotionStep_LoadBlock handles this critical first step.** It's the handshake between human (placing the block) and machine (processing it).

## What It Does

FB_MotionStep_LoadBlock runs **12 substeps (0–11)**:

| # | Action | Axis (slaves) |
|---|--------|---------------|
| 0 | Shift block against the left reference wall | 1 |
| 1 | Return the shift mechanism to home | 1 |
| 2 | Raise the load table (lift block off it) | 2 (3,4,5) |
| 3 | Shift the block toward center | 6 (7) |
| 4 | Lower the load table | 2 |
| 5 | Return the center-shift mechanism | 6 |
| 6 | Raise the unload table to receive the block | 10 (11,12,13) |
| 7 | Center the block with the pusher | 8 (9) |
| 8 | Engage suction cups *(TODO — proceeds immediately until I/O exists)* | — |
| 9 | Return the pusher to home | 8 |
| 10 | Lower the unload table (block now held by suction) | 10 |
| 11 | Complete — block centered, ready for cutting | — |

## The Physical Sequence

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      LOAD BLOCK - PHYSICAL SEQUENCE                          │
│                                                                              │
│   SUBSTEPS 0-1: SHIFT TO WALL, RETURN PUSHER                                │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │       ◄───────── Axis 1                                             │   │
│   │       ┌─────────────────────────────────────┐                       │   │
│   │       │░░░░░░░░░░░░░ Foam block ░░░░░░░░░░░│                       │   │
│   │       └─────────────────────────────────────┘                       │   │
│   │       ▲                                     ▲                        │   │
│   │   Load Table                            Wall (reference)            │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   SUBSTEPS 2-5: LIFT AND TRANSFER TO CENTER                                 │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                              Axis 6 shifts ────────▶                │   │
│   │                    ┌──────────────────────────┐                     │   │
│   │         ▲          │░░░░░░░░░░░░░░░░░░░░░░░░░│                     │   │
│   │  Axis 2 │ lifts    └──────────────────────────┘                     │   │
│   │   ══════╧══════════════════                                        │   │
│   │   Load Table (raised)                                               │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   SUBSTEPS 6-10: RECEIVE, HOLD, AND CLEAR                                   │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                              Suction cups  ▼ ▼ ▼                     │   │
│   │                    ┌──────────────────────────┐                     │   │
│   │                    │░░░░░░░░░░░░░░░░░░░░░░░░░│                     │   │
│   │        Axis 8      └──────────────────────────┘                     │   │
│   │        centers ──▶           ▲ Axis 10 raises to receive            │   │
│   │   Ready for cutting operations                                      │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         FB_MotionStep_LoadBlock                              │
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                      AXIS MOVERS                                     │   │
│   │   moverAxis1  : FB_AxisMover   ─── Shift to wall / pusher           │   │
│   │   moverAxis2  : FB_AxisMover   ─── Load table lift (master 3,4,5)   │   │
│   │   moverAxis6  : FB_AxisMover   ─── Center shift (master 7)          │   │
│   │   moverAxis8  : FB_AxisMover   ─── Pusher (master 9)                │   │
│   │   moverAxis10 : FB_AxisMover   ─── Unload table lift (master 11-13) │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                    SUBSTEP STATE MACHINE                             │   │
│   │   subStep : UINT (0-11)  + stepStarted + localError                 │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │   OUTPUTS: Done, Busy, CurrentSubStep, ActiveAxesMask,              │   │
│   │            StepDescription                                          │   │
│   │   (No Error/ErrorAxisID outputs — faults go to GVL_Faults directly) │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

> This FB has **no** base handler. The shared "ceremony" (`FB_MotionStepBase`) was removed in
> v3.0; each step now inlines its own reset block. The first thing the FB does on disable is the
> mover-flush that prevents phantom faults (see below).

## The Substep Pattern

Every motion substep has the same shape — describe it, light the axis mask, command the mover,
then branch on **Error vs Done**:

```iecst
3: // Axis 6 shifts block toward center - slave 7 follows
    StepDescription := 'Shifting block to center';
    ActiveAxesMask := FC_BuildAxisMask(6, 0, 0, 0, 0, 0, 0, 0);

    moverAxis6(Execute := TRUE, AxisRef := Axis_6, Position := Positions.axis6_ShiftPosition,
        Velocity := MotionParams.defaultVelocity, Acceleration := MotionParams.defaultAcceleration,
        Deceleration := MotionParams.defaultDeceleration, Jerk := MotionParams.defaultJerk);

    IF moverAxis6.Error THEN
        // Report straight to the shared fault queue, then HOLD (localError) until the
        // supervisor disables us. No Error output to thread upward.
        FC_ReportFault('FB_MotionStep_LoadBlock', 6, moverAxis6.ErrorID,
                       'Axis 6 shift failed', E_MotionStep.SHIFT_TO_PROCESSING_AREA, subStep);
        localError := TRUE;
    ELSIF moverAxis6.Done THEN
        moverAxis6(Execute := FALSE);   // clear this mover for reuse
        subStep := 4;                   // advance
    END_IF
```

When `localError` is set, the FB parks (`Busy := FALSE; RETURN`) and waits for `Enable := FALSE`.
`FB_FaultMonitor` will have tripped the machine to FAULTED within a scan or two.

## The reset block — where phantom faults are prevented

```iecst
IF NOT Enable THEN
    // Flush EVERY mover so none is left latched in DONE/ERROR. Without this, a mover
    // stuck in ERROR from an earlier fault re-fires its stale ErrorID on the next enable —
    // a phantom fault with no real drive error. See FB_AxisMover.md → The Phantom Fault.
    moverAxis1(Execute := FALSE, AxisRef := Axis_1);
    moverAxis2(Execute := FALSE, AxisRef := Axis_2);
    moverAxis6(Execute := FALSE, AxisRef := Axis_6);
    moverAxis8(Execute := FALSE, AxisRef := Axis_8);
    moverAxis10(Execute := FALSE, AxisRef := Axis_10);

    Done := FALSE; Busy := FALSE;
    ActiveAxesMask := 0; CurrentSubStep := 0; StepDescription := '';
    subStep := 0; stepStarted := FALSE; localError := FALSE;
    RETURN;
END_IF
```

## Where positions come from

Positions and motion parameters are passed in by `FB_MotionSequence` from `GVL_Machine`
(there is **no** recipe library anymore):

```iecst
stepLoadBlock(Enable := TRUE,
              Positions    := GVL_Machine.Positions,
              MotionParams := GVL_Machine.MotionParams);
```

So `Positions.axis6_ShiftPosition`, `Positions.axis2_RaisePosition`, etc. all resolve to fields
of `GVL_Machine.Positions`. Change the machine geometry there, not in code.

## Why Sequential Moves?

Why not move axes 2 and 6 together — lift while shifting? Several reasons:

1. **Mechanical interference** — some positions must clear before others can start
2. **Power limits** — moving fewer axes at once reduces peak current
3. **Debuggability** — you can see exactly which axis is doing what, one substep at a time

The performance cost is trivial: loading takes seconds; cutting takes minutes.

## Lessons Learned

### The reset-block mover flush (the important one)
Originally the `IF NOT Enable` block reset the substep bookkeeping but didn't call the movers
with `Execute := FALSE`. That left any errored mover latched, and it re-reported its stale
`ErrorID` the next cycle — the "Axis N … failed" phantom fault. The flush above is the fix.
Full write-up: `FB_AxisMover.md → The Phantom Fault` and `FAULT_TROUBLESHOOTING.md`.

### Report the *right* axis number
Each substep must pass its own axis to `FC_ReportFault`. A copy-paste that reports axis 2 on an
axis-6 move sends a maintainer to the wrong cylinder. Worth a careful read every time.

### Individual movers, not FB_MultiAxisMover
Every substep here moves a single axis in sequence, so individual `FB_AxisMover` instances are
clearer than a parallel `FB_MultiAxisMover`. The multi-mover earns its keep when axes must move
*together* (see `FB_AxisHome`'s Home-All).

## Interface Reference

### Inputs
| Name | Type | Description |
|------|------|-------------|
| Enable | BOOL | TRUE to run this step |
| Positions | ST_PositionSetpoints | Position setpoints (from `GVL_Machine.Positions`) |
| MotionParams | ST_MotionParameters | Velocity / accel / decel / jerk (from `GVL_Machine.MotionParams`) |

### Outputs
| Name | Type | Description |
|------|------|-------------|
| Done | BOOL | Step completed |
| Busy | BOOL | Step in progress |
| CurrentSubStep | UINT | Current substep (0–11) |
| ActiveAxesMask | LWORD | Bitmask of moving axes |
| StepDescription | STRING[80] | Human-readable description |

> Faults are reported via `FC_ReportFault(...)`, not through output pins.

## The Philosophy

Loading a block isn't glamorous. It doesn't carve beautiful geometry. But without it, nothing
else happens. FB_MotionStep_LoadBlock treats this mundane operation with the same care as the
cutting: clean substeps, honest fault reporting, clear visualization. Reliable material handling
is the foundation of reliable production.

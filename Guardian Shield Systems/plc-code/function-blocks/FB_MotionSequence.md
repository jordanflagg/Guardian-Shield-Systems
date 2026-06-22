# FB_MotionSequence: The Choreographer

## The Story

Think of a ballet. The choreographer doesn't dance — they orchestrate. They know when the lead should enter, when the corps should move, when the set should change. They see the whole performance and ensure each part happens in the right order.

**FB_MotionSequence is the choreographer for foam processing.** It doesn't move axes directly — it knows which motion step should execute and when to hand off to the next one: load the block, cut it (all wire cutting is G-code driven), unload the finished piece.

It's the layer that turns a handful of independent motion steps into one coherent production cycle.

## What It Does

FB_MotionSequence orchestrates the motion flow:

- **Step sequencing** — progresses through the four motion phases in order
- **Gating the start** — won't begin a cycle until both a block is loaded *and* the Python pipeline has staged G-code for it
- **Hand-off** — enables exactly one step FB at a time, disables it cleanly before moving on
- **Visualization** — passes each step's substep / active-axes / description up to the HMI
- **Reset** — on a hard reset, disables every step FB and parks at `WAIT_FOR_LOAD`

It does **not** own error handling. Each step FB reports faults directly to `GVL_Faults`
via `FC_ReportFault`; `FB_FaultMonitor` catches them. There are no error outputs to wire.

## The Motion Sequence (v3.0)

```
┌─────────────────────────────────────────────────────────────────────┐
│                       MOTION SEQUENCE FLOW                           │
│                                                                      │
│   ┌───────────────────────────────────────────────────────────┐     │
│   │                     WAIT_FOR_LOAD                          │     │
│   │   Wait until BlockLoaded = TRUE  AND  FilesReady = TRUE.   │     │
│   │   (block physically on the table AND Python has staged     │     │
│   │    G-code for THIS block)                                  │     │
│   └───────────────────────────────────────────────────────────┘     │
│                              │                                       │
│                              ▼                                       │
│   ┌───────────────────────────────────────────────────────────┐     │
│   │                 SHIFT_TO_PROCESSING_AREA                   │     │
│   │   FB_MotionStep_LoadBlock — 12 substeps, axes 1,2,6,8,10   │     │
│   │   Move the raw block from the load table to center.        │     │
│   └───────────────────────────────────────────────────────────┘     │
│                              │                                       │
│                              ▼                                       │
│   ┌───────────────────────────────────────────────────────────┐     │
│   │                         CUTTING                            │     │
│   │   FB_MotionStep_Cutting — G-code driven. Sets bBusy, waits │     │
│   │   for the Python dispatcher to run all wire groups. The    │     │
│   │   PLC does NOT command cutting axes here; the ctrlX G-code │     │
│   │   runtime + wire kinematics do. (Studs, windows/doors, and │     │
│   │   electrical troughs are all just wire scripts now.)       │     │
│   └───────────────────────────────────────────────────────────┘     │
│                              │                                       │
│                              ▼                                       │
│   ┌───────────────────────────────────────────────────────────┐     │
│   │                  SHIFT_TO_UNLOAD_AREA                      │     │
│   │   FB_MotionStep_Unload — 5 substeps, axes 8,10             │     │
│   │   Lift finished block, shift to unload table, set down.    │     │
│   └───────────────────────────────────────────────────────────┘     │
│                              │                                       │
│                              ▼                                       │
│   SequenceComplete := TRUE  →  loop back to WAIT_FOR_LOAD            │
└─────────────────────────────────────────────────────────────────────┘
```

> **Gone in v3.0:** the separate `STUDS`, `WINDOWS_DOORS`, and `ELECTRICAL` motion steps and
> their `FB_MotionStep_*` FBs. All cutting — studs, window/door openings, electrical troughs —
> is now produced by per-wire G-code scripts driven through the single `CUTTING` step. If you
> see those old step names anywhere, they no longer exist.

## Where positions and cutting paths come from

There is **no recipe system** anymore (the old `GVL_Recipes.RecipeLibrary[1..10]` was removed).
The two step FBs that move PLC axes pull straight from `GVL_Machine`:

```iecst
stepLoadBlock(
    Enable       := TRUE,
    Positions    := GVL_Machine.Positions,      // load/unload target positions
    MotionParams := GVL_Machine.MotionParams    // velocity / accel / decel / jerk
);
```

The cutting path is **not** in `GVL_Machine` at all — it's staged by the Python pipeline into
`GVL_GCode` (G-code files on the ctrlX filesystem). The `CUTTING` step just hands control to
that pipeline and waits. See `GVL_GCode.txt` for the full handshake.

## Start gating (the WAIT_FOR_LOAD logic)

A cycle needs two independent green lights before it moves a single axis:

```iecst
IF BlockLoaded AND FilesReady THEN
    motionStep := E_MotionStep.SHIFT_TO_PROCESSING_AREA;   // go
ELSIF BlockLoaded AND NOT FilesReady THEN
    StepDescription := 'Waiting for G-code upload';        // block is here, cuts aren't
ELSE
    StepDescription := 'Waiting for block to load';        // nothing loaded yet
END_IF
```

This is why pressing START with a block present but no G-code uploaded just sits there with a
"waiting for G-code" message instead of faulting — it's not an error, it's a missing input.

## Clean hand-off between steps

The pattern for every step is: enable it, mirror its visualization, and **disable it the moment
it reports Done** before advancing. Disabling is what lets the step reset itself (and flush its
movers — see `FB_AxisMover.md → The Phantom Fault`) so it's clean for next cycle.

```iecst
E_MotionStep.SHIFT_TO_PROCESSING_AREA:
    stepLoadBlock(Enable := TRUE, Positions := GVL_Machine.Positions,
                  MotionParams := GVL_Machine.MotionParams);

    CurrentSubStep  := stepLoadBlock.CurrentSubStep;
    ActiveAxesMask  := stepLoadBlock.ActiveAxesMask;
    StepDescription := stepLoadBlock.StepDescription;

    IF stepLoadBlock.Done THEN
        stepLoadBlock(Enable := FALSE);          // clean up BEFORE transitioning
        motionStep := E_MotionStep.CUTTING;
    END_IF
```

## Reset / disable handling

Two different "stop" inputs, two different behaviors:

```iecst
IF ResetSequence THEN
    // Hard reset (supervisor is in RESETTING): force every step FB off and park.
    stepLoadBlock(Enable := FALSE);
    stepCutting(Enable := FALSE);
    stepUnload(Enable := FALSE);
    motionStep := E_MotionStep.WAIT_FOR_LOAD;
    SequenceComplete := FALSE;
    CurrentStep := motionStep;
    StepDescription := 'Waiting for block to load';
    RETURN;
END_IF

IF NOT Enable THEN
    // Plain disable (e.g. paused): freeze in place, keep motionStep so we can resume.
    CurrentStep := motionStep;
    RETURN;
END_IF
```

The distinction matters for resume-after-stop: a plain disable keeps `motionStep` where it was
so the supervisor can pick the cycle back up; a `ResetSequence` wipes it back to the start.

## Interface Reference

### Inputs
| Name | Type | Description |
|------|------|-------------|
| Enable | BOOL | TRUE when the machine is in RUNNING state |
| ResetSequence | BOOL | TRUE only when the supervisor wants a hard reset (RESETTING) |
| BlockLoaded | BOOL | TRUE when the next foam block is physically in place |
| FilesReady | BOOL | TRUE when the Python pipeline has staged G-code for the block |

### Outputs
| Name | Type | Description |
|------|------|-------------|
| SequenceComplete | BOOL | Full cycle completed (one-scan-ish pulse as it loops) |
| CurrentStep | E_MotionStep | Current motion phase |
| CurrentSubStep | UINT | Current substep within the active step |
| ActiveAxesMask | LWORD | Bitmask of currently moving axes |
| StepDescription | STRING[80] | Human-readable description for the HMI |

> No `Error` / `*ErrorAxisID` outputs and no recipe outputs — those belonged to the pre-v3.0
> architecture. Faults flow through `GVL_Faults` / `FB_FaultMonitor` instead.

## Lessons Learned

### Always disable a step before transitioning
If a completed step is left enabled, it's still sitting in its Done state when the sequence loops
back — and (pre-fix) its movers were never flushed. Disabling before advancing is what gives each
step FB the clean reset that prevents phantom faults. See `FAULT_TROUBLESHOOTING.md`.

### Why a CASE statement instead of a FOR loop over steps
The steps have different FB types and different inputs (the cutting step takes no positions), and
the explicit `CASE` lets you set a breakpoint on exactly one phase. Readability beats cleverness
here.

## The Philosophy

FB_MotionSequence is a **thin orchestration layer**. It doesn't know how to carve a stud or route
an electrical trough — that lives in G-code and the wire kinematics. It knows *when* each phase
happens and *what order* they go in. The choreographer doesn't need to know the steps to the
dance; they need to know when each dancer should perform.

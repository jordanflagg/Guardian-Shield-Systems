# FB_MotionStepBase — REMOVED (v3.0)

> ⚠️ **This function block no longer exists.** There is no `FB_MotionStepBase.txt` in the
> project. This file is kept only as a signpost so old links don't dead-end. The narrative
> below it (in version control history) describes an architecture that was retired.

## What happened

`FB_MotionStepBase` used to factor out the common enable/disable "ceremony" that every
motion-step FB shared. In v3.0 the motion-step lineup was simplified down to three FBs
(`FB_MotionStep_LoadBlock`, `FB_MotionStep_Cutting`, `FB_MotionStep_Unload`), and the shared
boilerplate was small enough that each step now just inlines it directly. The base handler
added an indirection that wasn't paying for itself.

## The pattern that replaced it

Every motion-step FB now opens with its own explicit reset block. This is the current,
canonical shape — copy it when you write a new step:

```iecst
IF NOT Enable THEN
    // Flush every mover so none is left latched in DONE/ERROR (prevents phantom faults —
    // see FB_AxisMover.md → The Phantom Fault).
    moverAxis8(Execute := FALSE, AxisRef := Axis_8);
    moverAxis10(Execute := FALSE, AxisRef := Axis_10);

    Done := FALSE; Busy := FALSE;
    ActiveAxesMask := 0; CurrentSubStep := 0; StepDescription := '';
    subStep := 0; stepStarted := FALSE; localError := FALSE;
    RETURN;
END_IF

IF NOT stepStarted THEN
    stepStarted := TRUE;
    Busy := TRUE;
    subStep := 0;
END_IF

CurrentSubStep := subStep;

// Hold the state machine in place once a fault has been reported.
IF localError THEN
    Busy := FALSE;
    ActiveAxesMask := 0;
    RETURN;
END_IF

CASE subStep OF
    0: // ... first move ...
    1: // ... next move ...
END_CASE
```

## Also note

Errors are **not** returned through `Done`/`Error`/`ErrorAxisID` outputs anymore. Each step
calls `FC_ReportFault(...)` directly into the shared `GVL_Faults` queue, which `FB_FaultMonitor`
watches. There is no error wiring to thread up through `FB_MotionSequence`.

See: `FB_MotionStep_Unload.md`, `FB_MotionStep_LoadBlock.md`, `FB_AxisMover.md`,
and `FAULT_TROUBLESHOOTING.md`.

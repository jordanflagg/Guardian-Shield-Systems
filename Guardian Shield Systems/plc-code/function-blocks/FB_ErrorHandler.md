# FB_ErrorHandler: The Watchful Guardian

## The Story

When something goes wrong in a 36-axis machine, you don't have time to hunt through logs. You need answers *now*:

- **What** happened?
- **Where** did it happen?
- **When** did it happen (during which operation)?

Imagine being a doctor in an emergency room. You don't want each nurse reporting problems independently using different formats. You want one triage system that collects all issues, prioritizes them, and gives you the critical information in a consistent format.

**FB_ErrorHandler is that triage system.** It collects errors from all subsystems - power, gearing, and every motion step - and presents them through a single, consistent interface.

## What It Does

FB_ErrorHandler provides centralized error management:

- **Error collection** - Monitors all error sources in one place
- **First-error latching** - Captures the initial problem before cascading errors obscure it
- **Context preservation** - Records which step and substep were executing when failure occurred
- **Human-readable descriptions** - Translates error codes into operator-friendly messages
- **Error counting** - Tracks total errors for maintenance statistics

## The First-Error Philosophy

When a machine fails, errors often cascade:

1. Axis 14 motor overheats (root cause)
2. Axis 14 reports position error (symptom)
3. Gearing to axis 16 fails (cascade)
4. Motion step reports timeout (cascade)
5. State machine detects fault (cascade)

If you report all of these, the operator sees 5 errors and has no idea where to start. If you report only the first one, they know: *"Check axis 14 motor temperature."*

```iecst
// Only latch first error
IF NOT errorLatched THEN
    IF PowerError THEN
        errorLatched := TRUE;
        // Record all details...
    ELSIF GearingError THEN
        // Only reached if no power error
        ...
    END_IF
END_IF
```

The priority order is:
1. **Power errors** - Most fundamental; everything depends on power
2. **Gearing errors** - Required for motion; check before motion errors
3. **Load block errors** - First motion step
4. **Studs errors** - Second motion step
5. **Windows/doors errors** - Third motion step
6. **Electrical errors** - Fourth motion step
7. **Unload errors** - Final motion step

This order reflects the machine's physical sequence and system hierarchy.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            FB_ErrorHandler                                   │
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                        ERROR INPUTS                                  │   │
│   │                                                                      │   │
│   │   POWER               GEARING             MOTION STEPS              │   │
│   │   ┌─────────────┐    ┌─────────────┐    ┌─────────────────────┐    │   │
│   │   │ PowerError  │    │GearingError │    │LoadBlockError       │    │   │
│   │   │ PowerError- │    │GearingError-│    │LoadBlockErrorAxisID │    │   │
│   │   │  AxisID     │    │  AxisID     │    │                     │    │   │
│   │   └─────────────┘    └─────────────┘    │StudsError           │    │   │
│   │                                          │StudsErrorAxisID     │    │   │
│   │                                          │                     │    │   │
│   │                                          │WindowsDoorsError    │    │   │
│   │                                          │WindowsDoorsErrorAxis│    │   │
│   │                                          │                     │    │   │
│   │                                          │ElectricalError      │    │   │
│   │                                          │ElectricalErrorAxisID│    │   │
│   │                                          │                     │    │   │
│   │                                          │UnloadError          │    │   │
│   │                                          │UnloadErrorAxisID    │    │   │
│   │                                          └─────────────────────┘    │   │
│   │                                                                      │   │
│   │   CONTEXT                                                           │   │
│   │   ┌─────────────────────────────────┐                              │   │
│   │   │ CurrentStep : E_MotionStep      │                              │   │
│   │   │ CurrentSubStep : UINT           │                              │   │
│   │   └─────────────────────────────────┘                              │   │
│   │                                                                      │   │
│   │   CONTROL                                                           │   │
│   │   ┌─────────────┐                                                   │   │
│   │   │   Reset     │ ─── Clear all errors                             │   │
│   │   └─────────────┘                                                   │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                              │                                               │
│                              ▼                                               │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                    PRIORITY-BASED LATCHING                           │   │
│   │                                                                      │   │
│   │   IF NOT errorLatched THEN                                          │   │
│   │       IF PowerError THEN                                            │   │
│   │           // Latch power error (highest priority)                   │   │
│   │       ELSIF GearingError THEN                                       │   │
│   │           // Latch gearing error                                    │   │
│   │       ELSIF LoadBlockError THEN                                     │   │
│   │           // Latch load block error                                 │   │
│   │       ... (in sequence order)                                       │   │
│   │       END_IF                                                        │   │
│   │   END_IF                                                            │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                              │                                               │
│                              ▼                                               │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                          OUTPUTS                                     │   │
│   │                                                                      │   │
│   │   HasError : BOOL              ─── TRUE if any error is active      │   │
│   │   ErrorCount : UINT            ─── Total errors since reset         │   │
│   │                                                                      │   │
│   │   ErrorInfo : ST_MotionError   ─── Structured error details         │   │
│   │   ├── hasError                 ─── Duplicate of HasError            │   │
│   │   ├── errorAxisID              ─── Which axis failed                │   │
│   │   ├── errorCode                ─── Numeric error code               │   │
│   │   ├── errorStep                ─── Which motion step                │   │
│   │   ├── errorSubStep             ─── Which substep within step        │   │
│   │   └── errorDescription         ─── Human-readable message           │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Error Codes

The error codes follow a structured scheme:

| Code | Category | Description |
|------|----------|-------------|
| 1001 | Power | Drive power error |
| 1002 | Gearing | Axis gearing error |
| 2001 | Motion | Load block motion error |
| 2002 | Motion | Stud carving motion error |
| 2003 | Motion | Window/door motion error |
| 2004 | Motion | Electrical trough motion error |
| 2005 | Motion | Unload motion error |

The scheme:
- **1xxx** - Infrastructure errors (power, gearing)
- **2xxx** - Motion step errors

This allows easy categorization: any code starting with 1 is infrastructure; starting with 2 is motion.

## The Reset Mechanism

```iecst
IF Reset THEN
    HasError := FALSE;
    errorLatched := FALSE;
    internalErrorCount := 0;

    ErrorInfo.hasError := FALSE;
    ErrorInfo.errorAxisID := 0;
    ErrorInfo.errorCode := 0;
    ErrorInfo.errorStep := E_MotionStep.WAIT_FOR_LOAD;
    ErrorInfo.errorSubStep := 0;
    ErrorInfo.errorDescription := '';

    RETURN;
END_IF
```

Reset is **complete** - it clears everything:
- The error flag
- The latch
- The error count
- All fields in ErrorInfo

The state machine triggers reset when entering RESETTING state:
```iecst
errorHandler(
    Reset := (currentState = E_MachineState.RESETTING),
    ...
);
```

This ensures errors are cleared as part of the recovery process, not arbitrarily.

## The ST_MotionError Structure

The ErrorInfo output uses a structured type:

```iecst
TYPE ST_MotionError :
STRUCT
    hasError : BOOL;
    errorAxisID : UINT;
    errorCode : DWORD;
    errorStep : E_MotionStep;
    errorSubStep : UINT;
    errorDescription : STRING[80];
END_STRUCT
END_TYPE
```

This structure gives the HMI everything it needs for a comprehensive error display:

```
┌────────────────────────────────────────────────────────────────────────────┐
│                          FAULT DISPLAY                                      │
│                                                                             │
│   ╔════════════════════════════════════════════════════════════════════╗   │
│   ║  MACHINE FAULT - STUDS CARVING MOTION ERROR                         ║   │
│   ╠════════════════════════════════════════════════════════════════════╣   │
│   ║                                                                     ║   │
│   ║  Error Code: 2002                                                  ║   │
│   ║  Axis: 18                                                          ║   │
│   ║  Step: STUDS (3 of 6)                                              ║   │
│   ║  SubStep: 2 (Vertical Cut)                                         ║   │
│   ║                                                                     ║   │
│   ║  Description: Stud carving motion error                            ║   │
│   ║                                                                     ║   │
│   ║  Action: Check axis 18 for mechanical obstruction or drive fault.  ║   │
│   ║          Press RESET after clearing the fault.                     ║   │
│   ║                                                                     ║   │
│   ╚════════════════════════════════════════════════════════════════════╝   │
│                                                                             │
│   [RESET]                                            Errors Today: 3       │
└────────────────────────────────────────────────────────────────────────────┘
```

## Why Latching Matters

Consider this sequence without latching:

1. Scan 1: Axis 18 errors → `HasError = TRUE`, AxisID = 18
2. Scan 2: FB_MotionStep_Studs detects error, disables, error clears
3. Scan 3: Gearing breaks (cascade) → `HasError = TRUE`, AxisID = 24
4. Operator sees: "Axis 24 gearing error"

The root cause (axis 18) is lost. The operator wastes time checking axis 24.

With latching:

1. Scan 1: Axis 18 errors → latch, AxisID = 18
2. Scan 2: FB_MotionStep_Studs disables - error cleared but latch holds
3. Scan 3: Gearing breaks → latch prevents overwrite
4. Operator sees: "Axis 18 stud carving error"

The root cause is preserved until explicitly reset.

## Integration with State Machine

```iecst
// In FB_MachineStateMachine

// Pass all error sources
errorHandler(
    Reset := (currentState = E_MachineState.RESETTING),

    LoadBlockError := motionSequence.LoadBlockError,
    LoadBlockErrorAxisID := motionSequence.LoadBlockErrorAxisID,
    StudsError := motionSequence.StudsError,
    StudsErrorAxisID := motionSequence.StudsErrorAxisID,
    WindowsDoorsError := motionSequence.WindowsDoorsError,
    WindowsDoorsErrorAxisID := motionSequence.WindowsDoorsErrorAxisID,
    ElectricalError := motionSequence.ElectricalError,
    ElectricalErrorAxisID := motionSequence.ElectricalErrorAxisID,
    UnloadError := motionSequence.UnloadError,
    UnloadErrorAxisID := motionSequence.UnloadErrorAxisID,

    GearingError := axisGearing.Error,
    GearingErrorAxisID := axisGearing.ErrorAxisID,

    CurrentStep := motionSequence.CurrentStep,
    CurrentSubStep := motionSequence.CurrentSubStep
);

// Use the outputs
hasError := errorHandler.HasError;
errorInfo := errorHandler.ErrorInfo;
errorCount := errorHandler.ErrorCount;

// React to errors
IF errorHandler.HasError THEN
    currentState := E_MachineState.FAULTED;
END_IF
```

The state machine becomes the *consumer* of error information rather than the *manager* of it.

## Lessons Learned

### Bug We Fixed: Error Count Overflow

Early versions used `INT` for the error count:
```iecst
internalErrorCount : INT := 0;
```

After 32,767 errors, it overflows to negative. For a production machine running 24/7, that could happen in weeks.

**The fix**: Use `UINT` or larger, and consider whether a production machine should have *that many* errors without maintenance intervention.

### Pitfall: Not Including Context

Early versions only captured AxisID and error code. When reviewing logs, we couldn't tell *what the machine was trying to do* when it failed.

**The fix**: Include CurrentStep and CurrentSubStep:
```iecst
ErrorInfo.errorStep := CurrentStep;
ErrorInfo.errorSubStep := CurrentSubStep;
```

Now errors read: "Failed during STUDS, substep 2" instead of just "Axis 18 error."

### Why ELSEIF Chain Instead of Priority Array?

An elegant solution might use an array of error sources with priorities:
```iecst
// THIS WOULD BE CLEANER BUT...
FOR i := 1 TO NUM_ERROR_SOURCES DO
    IF errorSources[i].active THEN
        // Latch it
        EXIT;
    END_IF
END_FOR
```

But Structured Text's limitations with structured arrays and the desire for explicit error messages led to the ELSEIF chain. It's verbose but clear:
- You can see exactly what each error maps to
- Error descriptions are right where the error is detected
- Adding a new error source is straightforward

## Interface Reference

### Inputs
| Name | Type | Description |
|------|------|-------------|
| Reset | BOOL | Reset all errors |
| LoadBlockError | BOOL | Load block step error |
| LoadBlockErrorAxisID | UINT | Load block error axis |
| StudsError | BOOL | Studs step error |
| StudsErrorAxisID | UINT | Studs error axis |
| WindowsDoorsError | BOOL | Windows/doors step error |
| WindowsDoorsErrorAxisID | UINT | Windows/doors error axis |
| ElectricalError | BOOL | Electrical step error |
| ElectricalErrorAxisID | UINT | Electrical error axis |
| UnloadError | BOOL | Unload step error |
| UnloadErrorAxisID | UINT | Unload error axis |
| GearingError | BOOL | Gearing error |
| GearingErrorAxisID | UINT | Gearing error axis |
| PowerError | BOOL | Power error |
| PowerErrorAxisID | UINT | Power error axis |
| CurrentStep | E_MotionStep | Current motion step (context) |
| CurrentSubStep | UINT | Current substep (context) |

### Outputs
| Name | Type | Description |
|------|------|-------------|
| HasError | BOOL | TRUE if any error is active |
| ErrorInfo | ST_MotionError | Detailed error information structure |
| ErrorCount | UINT | Total errors since last reset |

## The Philosophy

Errors are information, not just problems.

A well-designed error handling system tells a story:
- What went wrong
- Where it went wrong
- What the machine was doing
- What should be done about it

FB_ErrorHandler transforms raw error signals into actionable intelligence. Instead of "ERROR!" it says "Axis 18 failed during stud carving, substep 2. Check for mechanical obstruction."

That's the difference between a machine that frustrates operators and one they can actually troubleshoot.

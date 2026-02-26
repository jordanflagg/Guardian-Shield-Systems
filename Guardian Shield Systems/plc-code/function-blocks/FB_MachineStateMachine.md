# FB_MachineStateMachine: The Brain of the Beast

## The Story

Every machine has a heartbeat. A rhythm. A sense of what it's doing right now and what it should do next.

For a simple machine, that rhythm might live in a relay ladder - energize this, de-energize that, done. But a 36-axis CNC foam cutter with multiple operating modes, gearing relationships, coordinated motion sequences, and strict safety requirements? That needs a brain.

**FB_MachineStateMachine is that brain.** It's the central nervous system that knows:
- What state the machine is in (IDLE, RUNNING, FAULTED, etc.)
- What inputs are commanding (Start, Stop, E-Stop)
- What subsystems need to be active (gearing, motion, manual jog)
- What should happen when things go wrong

Every other function block in the system is a specialist. This one is the generalist that coordinates them all.

## The States

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        MACHINE STATE DIAGRAM                                 │
│                                                                              │
│                              ┌──────────┐                                   │
│                              │   INIT   │                                   │
│                              │          │                                   │
│                              └────┬─────┘                                   │
│                                   │ (automatic)                             │
│                                   ▼                                         │
│   ┌──────────────────────────────────────────────────────────────────┐     │
│   │                           IDLE                                    │     │
│   │                                                                   │     │
│   │    - Recipe can be changed                                       │     │
│   │    - Waiting for operator command                                │     │
│   │    - All motion stopped                                          │     │
│   └──────────┬───────────────┬───────────────┬───────────────────────┘     │
│              │               │               │                              │
│        homeButton      manualMode      startButton                         │
│              │               │               │                              │
│              ▼               ▼               ▼                              │
│   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                     │
│   │    HOMING    │  │    MANUAL    │  │   RUNNING    │                     │
│   │              │  │              │  │              │                     │
│   │ - FB_AxisHome│  │- FB_AxisManua│  │- FB_AxisGear │                     │
│   │   active     │  │  active      │  │- FB_MotionSeq│                     │
│   │ - Move to 0  │  │- Jog control │  │  active      │                     │
│   └──────┬───────┘  └──────┬───────┘  └──────┬───────┘                     │
│          │                 │                 │                              │
│    NOT homeButton    NOT manualMode    stopButton                          │
│          │                 │                 │                              │
│          │                 │                 ▼                              │
│          │                 │         ┌──────────────┐                      │
│          │                 │         │   STOPPING   │                      │
│          │                 │         │              │                      │
│          └────────┬────────┘         │ - Halt axes  │                      │
│                   │                  │ - Disengage  │                      │
│                   │                  │   gearing    │                      │
│                   │                  └──────┬───────┘                      │
│                   │                         │                              │
│                   ▼                         ▼                              │
│   ┌────────────────────────────────────────────────────────────────────┐   │
│   │                            IDLE                                     │   │
│   └────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   ═══════════════════ ERROR PATHS ═══════════════════════════════════════   │
│                                                                              │
│   ANY STATE (except E_STOPPED)                                              │
│        │                                                                     │
│        │ eStopActive                                                        │
│        ▼                                                                     │
│   ┌──────────────┐                                                          │
│   │  E_STOPPED   │─────────────────────────────────────────┐               │
│   │              │                                          │               │
│   │ - MC_Halt all│     NOT eStopActive AND resetButton     │               │
│   │ - Maximum    │◀────────────────────────────────────────┘               │
│   │   priority   │                                                          │
│   └──────────────┘                                                          │
│                                                                              │
│   RUNNING ──(error detected)──▶ FAULTED                                    │
│                                     │                                       │
│   HOMING ──(error detected)──▶ FAULTED                                     │
│                                     │                                       │
│                              resetButton                                    │
│                                     │                                       │
│                                     ▼                                       │
│   ┌──────────────┐         ┌──────────────┐                                │
│   │   RESETTING  │◀────────│   FAULTED    │                                │
│   │              │         │              │                                │
│   │ - Clear flags│         │ - Gearing off│                                │
│   │ - Reset done │         │ - Waiting for│                                │
│   │   → IDLE     │         │   reset      │                                │
│   └──────────────┘         └──────────────┘                                │
└─────────────────────────────────────────────────────────────────────────────┘
```

## The E-Stop Override

Notice this at the top of the main logic:
```iecst
// Check for E-stop - can interrupt any state except E_STOPPED itself
IF eStopActive AND (currentState <> E_MachineState.E_STOPPED) THEN
    currentState := E_MachineState.E_STOPPED;
END_IF
```

E-Stop is the **supreme authority**. It doesn't matter if you're in IDLE, RUNNING, HOMING, or MANUAL - when E-Stop goes active, everything transitions immediately to E_STOPPED.

This is checked *before* the state machine CASE statement, ensuring E-Stop can never be blocked by state logic.

## The RUNNING State: Where the Magic Happens

RUNNING is the most complex state because it coordinates multiple subsystems:

```iecst
E_MachineState.RUNNING:
    isRunning := TRUE;
    recipeLocked := TRUE;

    // 1. Engage gearing first (if needed)
    IF gearingNeeded THEN
        axisGearing(Execute := TRUE);

        IF axisGearing.Done THEN
            gearingNeeded := FALSE;
        ELSIF axisGearing.Error THEN
            currentState := E_MachineState.FAULTED;
        END_IF
    ELSE
        // 2. Gearing active - run motion sequence
        motionSequence(
            Enable := TRUE,
            RecipeID := activeRecipeID
        );

        // 3. Check for completion
        IF motionSequence.SequenceComplete THEN
            // Could auto-stop or continue for next block
        END_IF
    END_IF

    // 4. Check for errors (from error handler)
    IF errorHandler.HasError THEN
        currentState := E_MachineState.FAULTED;
    END_IF

    // 5. Check for stop button
    IF stopButton THEN
        currentState := E_MachineState.STOPPING;
    END_IF
```

The sequence is:
1. **Gearing first** - Can't run motion without gearing
2. **Then motion** - Only when gearing is confirmed
3. **Monitor completion** - Know when cycle finishes
4. **Monitor errors** - Catch problems from any subsystem
5. **Check for stop** - Operator can always interrupt

## The Recipe Lock

```iecst
E_MachineState.IDLE:
    recipeLocked := FALSE;  // Can change recipe in IDLE
    activeRecipeID := selectedRecipe;  // Track HMI selection

E_MachineState.RUNNING:
    recipeLocked := TRUE;  // Cannot change during run
```

Changing recipes mid-cycle would be catastrophic - axes would suddenly try to go to different positions. The lock prevents HMI recipe changes while running.

The pattern is:
- **IDLE**: Recipe follows HMI selection
- **RUNNING**: Recipe is frozen at whatever was selected when Start was pressed

## The Error Handler Integration

All errors flow through FB_ErrorHandler:

```iecst
errorHandler(
    // Reset on entering RESETTING state
    Reset := (currentState = E_MachineState.RESETTING),

    // Motion step errors
    LoadBlockError := motionSequence.LoadBlockError,
    LoadBlockErrorAxisID := motionSequence.LoadBlockErrorAxisID,
    StudsError := motionSequence.StudsError,
    // ... more motion errors ...

    // Gearing errors
    GearingError := axisGearing.Error,
    GearingErrorAxisID := axisGearing.ErrorAxisID,

    // Context
    CurrentStep := motionSequence.CurrentStep,
    CurrentSubStep := motionSequence.CurrentSubStep
);

hasError := errorHandler.HasError;
errorInfo := errorHandler.ErrorInfo;
```

This centralization means:
- One place to check for any error: `hasError`
- One structure with all error details: `errorInfo`
- One reset mechanism: entering RESETTING state

## The Always-Running Position Monitor

A subtle but important pattern:

```iecst
// ALWAYS UPDATE AXIS HOMED STATUS
IF currentState <> E_MachineState.HOMING THEN
    fbHome(
        Enable := FALSE,  // Don't allow homing operations
        HomeAxis := 0,
        HomeSingle := FALSE,
        HomeAll := FALSE,
        ...
    );
    isHomed := fbHome.AllAxesHomed;
END_IF
```

Even when not in HOMING mode, we call FB_AxisHome with Enable=FALSE. Why?

Because FB_AxisHome's position reading runs regardless of enable state. This keeps `AxisIsHomed` status current for HMI display at all times. The operator can see which axes are at home position even while running production.

## The MC_Halt Array

In E_STOPPED state, we halt all axes:

```iecst
E_MachineState.E_STOPPED:
    FOR i := MOTIF_CONFIG.MIN_AXIS_INDEX TO MOTIF_CONFIG.MAX_AXIS_INDEX DO
        fbHalt[i](
            Execute := eStopActive,
            Deceleration := 1,
            Jerk := 1,
            Axis := AXIF_CONFIG_INDEXES[i]
        );
    END_FOR
```

Note the aggressive deceleration: `Deceleration := 1`. This means "stop as fast as possible." E-Stop isn't about smooth motion - it's about stopping NOW.

The halt continues as long as `eStopActive` is TRUE, ensuring axes stay stopped even if something tries to command them.

## Output Propagation

The state machine exposes motion sequence visualization:

```iecst
// Copy motion sequence visualization outputs
motionStepOut := motionSequence.CurrentStep;
motionSubStep := motionSequence.CurrentSubStep;
activeAxesMask := motionSequence.ActiveAxesMask;
stepDescription := motionSequence.StepDescription;
```

This allows the HMI to display:
- Which step is executing (STUDS, WINDOWS_DOORS, etc.)
- Which substep within that step
- Which axes are currently moving
- A human-readable description

Without writing any HMI-specific logic in the motion sequence.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        FB_MachineStateMachine                                │
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                          INPUTS                                      │   │
│   │                                                                      │   │
│   │   startButton  stopButton  homeButton  manualMode                   │   │
│   │   eStopActive  resetButton  selectedRecipe                          │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                              │                                               │
│                              ▼                                               │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                     STATE MACHINE                                    │   │
│   │                                                                      │   │
│   │   currentState : E_MachineState                                     │   │
│   │                                                                      │   │
│   │   CASE currentState OF                                              │   │
│   │       INIT: ...                                                     │   │
│   │       IDLE: ...                                                     │   │
│   │       HOMING: ...    ◀── Uses fbHome : FB_AxisHome                 │   │
│   │       MANUAL: ...    ◀── Uses axisManual : FB_AxisManual           │   │
│   │       RUNNING: ...   ◀── Uses axisGearing : FB_AxisGearing         │   │
│   │                          Uses motionSequence : FB_MotionSequence   │   │
│   │       STOPPING: ...                                                 │   │
│   │       FAULTED: ...                                                  │   │
│   │       E_STOPPED: ... ◀── Uses fbHalt[] : ARRAY OF MC_Halt          │   │
│   │       RESETTING: ...                                                │   │
│   │   END_CASE                                                          │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                              │                                               │
│                              ▼                                               │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                  CENTRALIZED ERROR HANDLER                           │   │
│   │                                                                      │   │
│   │   errorHandler : FB_ErrorHandler                                    │   │
│   │                                                                      │   │
│   │   Collects from: motionSequence, axisGearing, (future: axisPower)  │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                              │                                               │
│                              ▼                                               │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                          OUTPUTS                                     │   │
│   │                                                                      │   │
│   │   currentStateOut    isRunning    isFaulted    isManualMode        │   │
│   │   isHomed           activeRecipeID  recipeLocked                    │   │
│   │                                                                      │   │
│   │   motionStepOut     motionSubStep   activeAxesMask                 │   │
│   │   stepDescription                                                   │   │
│   │                                                                      │   │
│   │   hasError          errorInfo       errorCount                      │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Lessons Learned

### Bug We Fixed: State Getting Stuck in STOPPING

Early versions had STOPPING immediately transition to IDLE:
```iecst
E_MachineState.STOPPING:
    isRunning := FALSE;
    currentState := E_MachineState.IDLE;  // Instant transition
```

This didn't give axes time to actually stop. The fix was to set up the stop conditions and let it complete:

```iecst
E_MachineState.STOPPING:
    isRunning := FALSE;
    gearingNeeded := TRUE;
    axisGearing(Execute := FALSE);
    // TODO: Wait for axes to reach zero velocity
    currentState := E_MachineState.IDLE;
```

The TODO comment indicates future work to properly wait for motion to stop.

### Pitfall: Button Edge vs Level

Notice `homeButton` and `manualMode` are level-sensitive - you stay in HOMING/MANUAL as long as they're TRUE. But `startButton` triggers a transition and then we don't check it again (START doesn't "hold" RUNNING).

This matches operator expectations:
- Hold the Home button to stay in homing mode
- Toggle Manual mode on/off
- Press Start once to begin; press Stop to end

### Why gearingNeeded Flag?

Rather than checking gearing status directly, we use a flag:
```iecst
IF gearingNeeded THEN
    // Engage gearing
    IF axisGearing.Done THEN
        gearingNeeded := FALSE;
    END_IF
ELSE
    // Run motion
END_IF
```

This separates "I need to engage gearing" from "gearing is engaged." The flag is set TRUE when leaving RUNNING/E_STOPPED/FAULTED, ensuring gearing is re-established before motion resumes.

## Interface Reference

### Inputs
| Name | Type | Description |
|------|------|-------------|
| startButton | BOOL | Start machine cycle |
| stopButton | BOOL | Stop machine cycle |
| homeButton | BOOL | Enter/stay in homing mode |
| manualMode | BOOL | Enter/stay in manual mode |
| eStopActive | BOOL | E-Stop is pressed |
| resetButton | BOOL | Reset from fault/E-stop |
| selectedRecipe | UINT | Recipe selection from HMI (1-10) |

### Outputs
| Name | Type | Description |
|------|------|-------------|
| currentStateOut | E_MachineState | Current state for HMI |
| isRunning | BOOL | Machine is executing cycle |
| isFaulted | BOOL | Machine has fault |
| isManualMode | BOOL | Machine is in manual mode |
| isHomed | BOOL | All master axes at position 0 |
| activeRecipeID | UINT | Currently active recipe |
| recipeLocked | BOOL | TRUE when recipe cannot be changed |
| motionStepOut | E_MotionStep | Current motion step |
| motionSubStep | UINT | Current substep |
| activeAxesMask | LWORD | Bitmask of moving axes |
| stepDescription | STRING[80] | Human-readable step description |
| hasError | BOOL | Any error active |
| errorInfo | ST_MotionError | Detailed error information |
| errorCount | UINT | Total errors since reset |

## The Philosophy

A state machine might seem like bureaucracy - extra code between intent and action. But for a complex machine, it's essential.

Without it:
- Button presses could conflict
- Modes could overlap
- Errors could be ignored
- Safety interlocks could be bypassed

With it:
- Every state has clear entry and exit conditions
- Transitions are explicit and auditable
- The machine "knows" what it's doing
- The HMI can show exactly what's happening

FB_MachineStateMachine is the machine's consciousness - its awareness of self and situation. It transforms 36 independent axes into a coherent system with purpose.

That's the difference between a collection of motors and a *machine*.

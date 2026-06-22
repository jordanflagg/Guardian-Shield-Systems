# FB_MachineStateMachine: The Brain of the Beast

## The Story

Every machine has a heartbeat — a sense of what it's doing right now and what it should do next.

For a simple machine that rhythm might live in a relay or two. But a 36-axis CNC foam cutter with multiple operating modes, always-enabled wire kinematics, a G-code cutting handshake, pause/resume, and strict safety requirements? That needs a brain.

**FB_MachineStateMachine is that brain.** Every other FB is a specialist; this one is the generalist that coordinates them and decides what happens when things go wrong. It knows:
- What state the machine is in (IDLE, RUNNING, FAULTED, …)
- What the operator is commanding (Start, Stop, Home, Manual, Reset, E-Stop)
- Whether it's safe to run (`DrivesReady`, `HasFault`)
- How to pause a cut and pick it back up

## The States

```
┌─────────────────────────────────────────────────────────────────────┐
│                       MACHINE STATE DIAGRAM                         │
│                                                                     │
│                         ┌──────────┐                                │
│                         │   INIT   │ (one scan, then IDLE)          │
│                         └────┬─────┘                                │
│                              ▼                                      │
│   ┌──────────────────────────────────────────────────────────┐     │
│   │                          IDLE                             │     │
│   │   Waiting for a command. Drives may be on or off.         │     │
│   │   START needs DrivesReady + (FilesReady or a paused cycle) │     │
│   └──────┬───────────────┬────────────────┬───────────────────┘     │
│     homeButton      manualMode        startButton                   │
│          ▼               ▼                 ▼                         │
│   ┌────────────┐  ┌────────────┐  ┌────────────────┐                │
│   │  HOMING    │  │   MANUAL   │  │    RUNNING     │                │
│   │ FB_AxisHome│  │FB_AxisManua│  │ FB_MotionSeq   │                │
│   └─────┬──────┘  └─────┬──────┘  └───────┬────────┘                │
│         │stop/done      │stop/toggle      │ stopButton              │
│         ▼               ▼                 ▼                         │
│       IDLE            IDLE          ┌────────────┐                  │
│                                     │  STOPPING  │ (pause, not kill) │
│                                     └─────┬──────┘                  │
│                                           ▼                         │
│                                         IDLE  (cyclePaused = TRUE)   │
│                                                                     │
│   ════════════════════ SAFETY / FAULT PATHS ═══════════════════════ │
│                                                                     │
│   ANY state ──eStopActive──▶ E_STOPPED  (MC_Halt all axes)          │
│   ANY state ──HasFault─────▶ FAULTED    (except E_STOPPED/RESETTING) │
│                                                                     │
│   E_STOPPED ──(estop released + reset)──▶ RESETTING                 │
│   FAULTED   ──(reset)───────────────────▶ RESETTING                 │
│   RESETTING ──(HasFault goes FALSE)─────▶ IDLE                      │
└─────────────────────────────────────────────────────────────────────┘
```

> Gone in v3.0: the `gearingNeeded` flag / `FB_AxisGearing` (gantry slaving is configured in the
> Bosch ctrlX web UI now) and the recipe lock (`recipeLocked` / `selectedRecipe`). No recipes,
> no gearing engagement step.

## Two priority overrides, checked before the CASE

The state machine evaluates two interrupts *before* its main `CASE`, so neither can be blocked by
state logic:

```iecst
// 1) E-STOP — supreme authority. Interrupts everything except E_STOPPED itself.
IF eStopActive AND (currentState <> E_MachineState.E_STOPPED) THEN
    IF currentState = RUNNING AND motionSequence.CurrentStep = CUTTING THEN
        interruptKinematics := TRUE;          // yank the wire kins
        GVL_GCode.bAbortRequested := TRUE;    // tell Python to abandon the cut
        GVL_GCode.bBusy := FALSE;
        motionSequence(Enable := FALSE, ...);
    END_IF
    currentState := E_MachineState.E_STOPPED;
END_IF

// 2) FAULT — from FB_FaultMonitor. Interrupts any state except
//    FAULTED / E_STOPPED / RESETTING (so a reset can finish clearing the queue).
IF HasFault AND currentState NOT IN (FAULTED, E_STOPPED, RESETTING) THEN
    IF currentState = RUNNING AND motionSequence.CurrentStep = CUTTING THEN
        interruptKinematics := TRUE;
        GVL_GCode.bAbortRequested := TRUE;
        GVL_GCode.bBusy := FALSE;
    END_IF
    currentState := E_MachineState.FAULTED;
END_IF
```

Note the fault source: this FB does **not** detect faults itself. `FB_FaultMonitor` (which runs
first in `PLC_PRG`) latches `HasFault`; the state machine just *reacts* to it. See
`FAULT_TROUBLESHOOTING.md` for the full fault pipeline.

## RUNNING: drive the cycle, remember where you are

RUNNING simply runs `FB_MotionSequence` and continuously records a resume point so a Stop can be
undone:

```iecst
E_MachineState.RUNNING:
    isRunning := TRUE;
    motionSequence(Enable := TRUE, ResetSequence := FALSE,
                   BlockLoaded := BlockLoaded, FilesReady := FilesReady);

    resumeStep        := motionSequence.CurrentStep;     // for pause/resume
    resumeSubStep     := motionSequence.CurrentSubStep;
    resumeDescription := motionSequence.StepDescription;
    motionStepOut     := motionSequence.CurrentStep;     // for HMI
    activeAxesMask    := motionSequence.ActiveAxesMask;
    stepDescription   := motionSequence.StepDescription;

    IF stopButton THEN
        currentState := E_MachineState.STOPPING;
    END_IF
```

## STOPPING is a *pause*, not a kill

Pressing Stop doesn't abandon the block — it parks the cycle so START can resume it:

```iecst
E_MachineState.STOPPING:
    IF motionSequence.CurrentStep = CUTTING THEN
        interruptKinematics := TRUE;          // hold the wire kins
        kinematicsPaused    := TRUE;
        GVL_GCode.bPauseRequested := TRUE;    // planned pause: preserve the active cut
    END_IF
    cyclePaused := TRUE;
    currentState := E_MachineState.IDLE;
```

Back in IDLE, pressing START checks for a paused cut first and resumes it (pulsing
`continueKinematics` for the wire kins) instead of starting a fresh cycle:

```iecst
ELSIF startButton THEN
    IF NOT DrivesReady THEN  ...not ready...
    ELSIF kinematicsPaused THEN
        continueKinematics := TRUE;           // resume interrupted wire kins
        kinematicsPaused := FALSE; cyclePaused := FALSE;
        currentState := RUNNING;
    ELSIF cyclePaused THEN
        cyclePaused := FALSE;
        currentState := RUNNING;
    ELSIF FilesReady THEN
        currentState := RUNNING;              // fresh cycle
    ELSE  ...upload G-code first...
    END_IF
```

`interruptKinematics` / `continueKinematics` are outputs consumed by `FB_KinematicEnable` (called
*after* this FB in `PLC_PRG`, so the same-scan pulses are visible).

## E_STOPPED: stop NOW

```iecst
E_MachineState.E_STOPPED:
    isFaulted := TRUE;
    GVL_GCode.bAbortRequested := TRUE;
    FOR i := MIN..MAX DO
        fbHalt[i](Execute := eStopActive, Deceleration := 1, Jerk := 1,
                  Axis := AXIF_CONFIG_INDEXES[i]);
    END_FOR
    IF NOT eStopActive AND resetButton THEN
        currentState := E_MachineState.RESETTING;
    END_IF
```

Note `Deceleration := 1` — "stop as fast as the mechanics allow." E-Stop isn't about smooth
motion, it's about stopping immediately. Recovery requires releasing the E-Stop *and* pressing Reset.

## RESETTING: hand off to FB_FaultMonitor, then wait

The state machine doesn't clear faults — it asks for a reset and waits for `FB_FaultMonitor` to
finish its recovery sequence and drop `HasFault`:

```iecst
E_MachineState.RESETTING:
    interruptKinematics := FALSE; continueKinematics := FALSE;
    kinematicsPaused := FALSE; cyclePaused := FALSE;
    GVL_GCode.bAbortRequested := TRUE;
    motionSequence(Enable := FALSE, ResetSequence := TRUE, ...);  // hard-reset the sequence
    GVL_GCode.bBusy := FALSE; GVL_GCode.bError := FALSE;

    IF NOT HasFault THEN                       // FB_FaultMonitor finished recovery
        currentState := E_MachineState.IDLE;
    END_IF
```

This is why RESETTING must persist at least one scan: `FB_FaultMonitor` runs *before* this FB and
reads the machine state that this FB writes *after* it runs, so the request needs a full scan to
be seen and acted on.

## The always-running homed-status read

Even outside HOMING, the FB calls `fbHome(Enable := FALSE, …)` every scan. `FB_AxisHome` reads
master-axis positions regardless of enable, so `isHomed` / `AxisIsHomed[]` stay live for the HMI
at all times — the operator can see which axes are at position 0 even during production.

## Interface Reference

### Inputs
| Name | Type | Description |
|------|------|-------------|
| startButton / stopButton / homeButton | BOOL | Operator commands (edge-pulsed by FB_ButtonManager) |
| manualMode | BOOL | Enter/exit MANUAL jog mode |
| eStopActive | BOOL | E-Stop pressed (level-sensitive) |
| resetButton | BOOL | Reset from FAULTED / E_STOPPED |
| DrivesReady | BOOL | From FB_AxisPower — gate for RUNNING/HOMING/MANUAL |
| BlockLoaded | BOOL | Foam block physically present |
| FilesReady | BOOL | Python pipeline has staged G-code |
| HasFault | BOOL | From FB_FaultMonitor — any active fault |

### Selected Outputs
| Name | Type | Description |
|------|------|-------------|
| currentStateOut | E_MachineState | Current state (to HMI + PLC_PRG) |
| isRunning / isFaulted / isManualMode / isHomed | BOOL | Status flags |
| motionStepOut / motionSubStep / activeAxesMask / stepDescription | — | Motion visualization |
| interruptKinematics / continueKinematics | BOOL | Consumed by FB_KinematicEnable |
| cyclePausedOut | BOOL | TRUE when a cut is paused mid-cycle |
| jog* / home* feedback | — | Pass-through from FB_AxisManual / FB_AxisHome |

> No recipe outputs and no `ST_MotionError` / `errorInfo` / `errorCount` — fault detail lives in
> `GVL_Faults` / `FB_FaultMonitor.ActiveFault` now.

## Lessons Learned

### Order of operations with FB_FaultMonitor
Because `FB_FaultMonitor` runs first but reads a machine state written last, RESETTING has to hold
for a scan rather than transition instantly. Getting this wrong made resets either never complete
or clear the fault before recovery actually ran. The current code waits on `NOT HasFault`.

### Stop = pause, by design
Operators expect Stop to be recoverable, not a teardown. Modeling Stop as a *pause* (`cyclePaused`
/ `kinematicsPaused` + a resume on the next Start) is what makes "oops, continue" possible without
re-staging G-code. A true teardown only happens on fault, E-Stop, or reset.

## The Philosophy

A state machine can look like bureaucracy — extra code between intent and action. But for a
machine this complex it's what turns 36 independent axes into a system with purpose: every state
has clear entry/exit conditions, safety overrides can never be blocked, and the HMI can always
show exactly what's happening and why. That's the difference between a pile of motors and a
*machine*.

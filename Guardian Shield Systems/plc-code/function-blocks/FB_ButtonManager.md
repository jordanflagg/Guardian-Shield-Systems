# FB_ButtonManager: The Input Interpreter

## The Story

Buttons lie.

Not maliciously - but mechanically. When you press a button, the contact doesn't make a clean transition from open to closed. It bounces. For a few milliseconds, the signal rapidly toggles between on and off.

To a fast PLC scanning at millisecond rates, that one button press looks like 5, 10, maybe 20 presses. Without proper handling, pressing "Start" might start the machine, stop it, start it again, and stop it - all from one physical press.

**FB_ButtonManager is the interpreter between messy human input and clean machine commands.** It detects edges, debounces, and prioritizes - transforming raw electrical signals into a single clean one-scan command pulse per press.

## What It Does

FB_ButtonManager provides:

- **Edge detection** - Detects button press moments (rising edges)
- **Debouncing** - Ignores rapid signal bounces via R_TRIG
- **Priority handling** - E-Stop > Stop > Start > Home > Manual > Reset
- **One-scan command pulses** - Each press emits its output TRUE for exactly one scan
- **Clean state management** - Only one command active at a time

## The One-Scan Pulse Model

> **Behavior change (v3.0):** these outputs are **one-scan pulses**, not latches. Each command
> output goes TRUE for exactly one scan on the button's rising edge, then returns to FALSE. The
> state machine owns all mode persistence and latching now — the button manager just announces
> "a press happened this scan." (E-Stop is the exception — see below.)

Every scan the outputs are cleared, then the selected command's output is pulsed TRUE and
`activeCommand` is immediately reset to `CMD_NONE`, so it lasts a single scan:

```iecst
btn_Start_Out := FALSE; btn_Stop_Out := FALSE; ... ;   // clear every scan

CASE activeCommand OF
    E_ActiveCommand.CMD_START:
        btn_Start_Out := TRUE;
        activeCommand := E_ActiveCommand.CMD_NONE;       // self-clearing → one-scan pulse
    ...
END_CASE
```

Why pulses instead of latches? Because the supervisor (`FB_MachineStateMachine`) is the single
source of truth for "what mode are we in." A momentary START *request* maps cleanly to a state
transition; the state machine then holds RUNNING on its own. Keeping the button output latched too
would create two competing notions of "are we started," which is exactly the kind of ambiguity
that causes double-transitions. One press → one pulse → one transition.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           FB_ButtonManager                                   │
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                        RAW INPUTS                                    │   │
│   │                                                                      │   │
│   │   btn_Start_In   btn_Stop_In    btn_Home_In                         │   │
│   │   btn_Manual_In  btn_Reset_In   btn_EStop_In                        │   │
│   │   ClearCommand                                                       │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                              │                                               │
│                              ▼                                               │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                      EDGE DETECTION                                  │   │
│   │                                                                      │   │
│   │   trig_Start : R_TRIG ──▶ Rising edge of Start                     │   │
│   │   trig_Stop  : R_TRIG ──▶ Rising edge of Stop                      │   │
│   │   trig_Home  : R_TRIG ──▶ Rising edge of Home                      │   │
│   │   trig_Manual: R_TRIG ──▶ Rising edge of Manual                    │   │
│   │   trig_Reset : R_TRIG ──▶ Rising edge of Reset                     │   │
│   │                                                                      │   │
│   │   (E-Stop is level-sensitive, not edge-triggered)                   │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                              │                                               │
│                              ▼                                               │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                    PRIORITY EVALUATION                               │   │
│   │                                                                      │   │
│   │   IF btn_EStop_In THEN                                              │   │
│   │       activeCommand := CMD_NONE  (E-Stop overrides all)             │   │
│   │                                                                      │   │
│   │   ELSIF trig_Stop.Q THEN                                            │   │
│   │       activeCommand := CMD_STOP                                     │   │
│   │                                                                      │   │
│   │   ELSIF trig_Start.Q THEN                                           │   │
│   │       activeCommand := CMD_START                                    │   │
│   │                                                                      │   │
│   │   ELSIF trig_Home.Q THEN                                            │   │
│   │       activeCommand := CMD_HOME                                     │   │
│   │                                                                      │   │
│   │   ELSIF trig_Manual.Q THEN                                          │   │
│   │       activeCommand := CMD_MANUAL                                   │   │
│   │                                                                      │   │
│   │   ELSIF trig_Reset.Q THEN                                           │   │
│   │       activeCommand := CMD_RESET                                    │   │
│   │   END_IF                                                            │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                              │                                               │
│                              ▼                                               │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                    OUTPUT GENERATION                                 │   │
│   │                                                                      │   │
│   │   CASE activeCommand OF                                             │   │
│   │       CMD_START:                                                    │   │
│   │           btn_Start_Out := TRUE; (others FALSE)                    │   │
│   │       CMD_STOP:                                                     │   │
│   │           btn_Stop_Out := TRUE; (others FALSE)                     │   │
│   │       ...                                                           │   │
│   │   END_CASE                                                          │   │
│   │                                                                      │   │
│   │   btn_EStop_Out := btn_EStop_In  (pass-through)                    │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                              │                                               │
│                              ▼                                               │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                        OUTPUTS                                       │   │
│   │                                                                      │   │
│   │   btn_Start_Out  btn_Stop_Out   btn_Home_Out                        │   │
│   │   btn_Manual_Out btn_Reset_Out  btn_EStop_Out                       │   │
│   │   activeCommand : E_ActiveCommand                                   │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

## The Priority Chain

```iecst
// Priority: E-Stop > Stop > Start > Home > Manual > Reset

IF btn_EStop_In THEN
    // E-stop overrides everything
    activeCommand := E_ActiveCommand.CMD_NONE;

ELSIF trig_Stop.Q THEN
    // Stop has priority over start
    activeCommand := E_ActiveCommand.CMD_STOP;

ELSIF trig_Start.Q THEN
    activeCommand := E_ActiveCommand.CMD_START;
// ... etc
```

Why this order?

1. **E-Stop** - Safety first, always. Nothing else matters when E-Stop is active.
2. **Stop** - If operator presses Stop and Start simultaneously, we stop. Safe default.
3. **Start** - Running the machine requires deliberate action.
4. **Home** - Preparation operation, lower priority than production.
5. **Manual** - Diagnostic/setup mode.
6. **Reset** - Recovery operation, lowest priority.

## E-Stop: The Special Case

E-Stop is NOT edge-triggered:

```iecst
// E-stop passes through directly (level-sensitive, not edge)
btn_EStop_Out := btn_EStop_In;
```

Why? Because E-Stop is a **state**, not a **command**:
- Other buttons: "Please do this action now"
- E-Stop: "This emergency condition currently exists"

E-Stop needs to be active the entire time the button is pressed (and locked). Releasing it should immediately clear the output.

Also note that E-Stop sets `activeCommand := CMD_NONE`, not `CMD_ESTOP`. The command system is about *requests*; E-Stop is an *override*.

## The Explicit Output Pattern

```iecst
CASE activeCommand OF

    E_ActiveCommand.CMD_START:
        btn_Start_Out := TRUE;
        btn_Stop_Out := FALSE;
        btn_Home_Out := FALSE;
        btn_Manual_Out := FALSE;
        btn_Reset_Out := FALSE;  // ← Explicitly FALSE

    // ... similar for other commands
```

Every output is explicitly set in every case. No relying on "it was FALSE before so it stays FALSE."

This verbosity prevents bugs where adding a new command forgets to clear an old output.

## The ClearCommand Input

```iecst
IF ClearCommand THEN
    activeCommand := E_ActiveCommand.CMD_NONE;
END_IF
```

This allows the state machine to explicitly clear the command when it's been processed:

```iecst
// In state machine
E_MachineState.RUNNING:
    // Start command has been acknowledged
    // Clear it so we don't retrigger
    buttonManager(ClearCommand := TRUE);
```

Though in practice, the latching behavior means commands usually clear themselves when the next button is pressed.

## R_TRIG: The Debounce Hero

```iecst
trig_Start(CLK := btn_Start_In);
trig_Stop(CLK := btn_Stop_In);
// ... etc

// Later
ELSIF trig_Start.Q THEN
    activeCommand := E_ActiveCommand.CMD_START;
```

`R_TRIG` (Rising Trigger) only outputs TRUE for one scan on the rising edge. Even if the button bounces 10 times, only the first rising edge registers.

This is simpler than explicit debounce timers and works well for momentary buttons.

## Lessons Learned

### Bug We Fixed: Reset Staying TRUE

Early versions had a bug where `btn_Reset_Out` stayed TRUE even after entering other modes. The problem was incomplete CASE handling:

```iecst
// WRONG - didn't clear Reset for all cases
CASE activeCommand OF
    CMD_START: btn_Start_Out := TRUE; // Reset still TRUE from before!
```

**The fix**: Every case explicitly sets every output:
```iecst
CMD_START:
    btn_Start_Out := TRUE;
    btn_Stop_Out := FALSE;
    btn_Home_Out := FALSE;
    btn_Manual_Out := FALSE;
    btn_Reset_Out := FALSE;  // EXPLICIT
```

### Pitfall: Edge Detection Order

R_TRIG must be called BEFORE checking .Q:

```iecst
// CORRECT ORDER
trig_Start(CLK := btn_Start_In);  // Update first
IF trig_Start.Q THEN              // Then check
```

Checking Q before calling the FB uses stale data.

### Why No Debounce Timer?

Hardware buttons often need debounce timers (10-50ms). But:
1. HMI touchscreen buttons don't bounce the same way
2. R_TRIG provides edge detection which inherently ignores repeated toggles
3. Physical button panels often have hardware debouncing

If needed, a timer can be added:
```iecst
IF btn_Start_In AND NOT debounceTimer.Q THEN
    debounceTimer(IN := TRUE, PT := T#20MS);
    IF debounceTimer.Q THEN
        // Accept the press
    END_IF
ELSE
    debounceTimer(IN := FALSE);
END_IF
```

But R_TRIG alone handles most cases.

## Interface Reference

### Inputs
| Name | Type | Description |
|------|------|-------------|
| btn_Start_In | BOOL | Start button raw input |
| btn_Stop_In | BOOL | Stop button raw input |
| btn_Home_In | BOOL | Home button raw input |
| btn_Manual_In | BOOL | Manual mode button raw input |
| btn_Reset_In | BOOL | Reset button raw input |
| btn_EStop_In | BOOL | E-Stop raw input |
| ClearCommand | BOOL | External clear (optional) |

### Outputs
| Name | Type | Description |
|------|------|-------------|
| btn_Start_Out | BOOL | Debounced Start command |
| btn_Stop_Out | BOOL | Debounced Stop command |
| btn_Home_Out | BOOL | Debounced Home command |
| btn_Manual_Out | BOOL | Debounced Manual command |
| btn_Reset_Out | BOOL | Debounced Reset command |
| btn_EStop_Out | BOOL | E-Stop state (pass-through) |
| activeCommand | E_ActiveCommand | Currently active command enum |

## The Philosophy

Between the operator's finger and the machine's response lies a translation layer. That finger press must become:
- A clean edge, not a bouncy mess
- A prioritized command, not a collision of signals
- A single one-scan pulse the state machine can act on exactly once

FB_ButtonManager performs that translation. It respects human intent while protecting against human imprecision. It prioritizes safety over convenience. It provides clear state to the state machine.

Good UI isn't just about what users see - it's about how their actions become system behavior. FB_ButtonManager is the invisible handshake that makes "press Start" actually start the machine.

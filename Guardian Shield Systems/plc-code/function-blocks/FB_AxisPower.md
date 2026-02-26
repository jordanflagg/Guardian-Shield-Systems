# FB_AxisPower: The Master Switch

## The Story

Imagine you're responsible for turning on and off the power to an entire city. Not just one house at a time - the whole city, all at once. And if there's a problem anywhere, you need to know exactly which block has the issue.

Now multiply that complexity by the stakes: these aren't light bulbs, they're servo drives controlling precise motion. A power fault on axis 23 could mean a ruined product, or worse, equipment damage.

**FB_AxisPower is the master switch for 36 servo drives**. It handles two critical responsibilities:
1. Powering all drives on and off as a coordinated unit
2. Resetting faults across the entire system - from the PLC to the drives themselves

This isn't glamorous work, but it's foundational. Without solid power management, nothing else moves.

## What It Does

FB_AxisPower provides centralized control over all 36 axes:

- **Power control** - Enable/disable all servo drives simultaneously
- **Fault reset** - Clear errors at multiple levels (CXA Datalayer + individual MC_Reset)
- **Status monitoring** - Know when all drives are ready
- **Error identification** - Find which axis has a problem

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           FB_AxisPower                                   │
│                                                                          │
│  ┌─────────┐                                                            │
│  │ INPUTS  │                                                            │
│  │         │                                                            │
│  │ PowerOn │───────────────────────────────┐                           │
│  │ Reset   │─────────────────┐             │                           │
│  └─────────┘                 │             │                           │
│                              │             │                           │
│                              ▼             ▼                           │
│                    ┌─────────────────────────────────────────────┐     │
│                    │         Reset State Machine                  │     │
│                    │                                              │     │
│                    │  0: IDLE                                     │     │
│                    │  1: Clear all errors (CXA_Datalayer)        │     │
│                    │  2: Execute MC_Reset on all axes            │     │
│                    │  3: Wait for all axis resets                │     │
│                    │                                              │     │
│                    │  ┌─────────────────────────────────────┐    │     │
│                    │  │ CXA_Datalayer.DL_WriteNode          │    │     │
│                    │  │ 'diagnosis/confirm/all-errors'       │    │     │
│                    │  └─────────────────────────────────────┘    │     │
│                    └─────────────────────────────────────────────┘     │
│                                                                          │
│     ┌─────────────────────────────────────────────────────────────┐    │
│     │              Power Control Loop (36 axes)                    │    │
│     │                                                              │    │
│     │   FOR i := 1 TO 36 DO                                       │    │
│     │       fbPower[i](Enable := PowerOn, Axis := AXIF[i]);       │    │
│     │       fbReset[i](Execute := Reset, Axis := AXIF[i]);        │    │
│     │   END_FOR                                                    │    │
│     └─────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │                    Status Aggregation                              │ │
│  │                                                                    │ │
│  │   • DrivesReady = PowerOn AND (all Status TRUE) AND (no errors)  │ │
│  │   • ErrorAxisID = first axis with fbPower[i].Error               │ │
│  │   • AllResetDone = all fbReset[i].Done                            │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  ┌─────────┐                                                            │
│  │ OUTPUTS │                                                            │
│  │         │                                                            │
│  │ Drives- │                                                            │
│  │  Ready  │                                                            │
│  │ AllReset│                                                            │
│  │  Done   │                                                            │
│  │ Error-  │                                                            │
│  │ AxisID  │                                                            │
│  └─────────┘                                                            │
└─────────────────────────────────────────────────────────────────────────┘
```

## The Two-Layer Reset: A Deep Dive

Here's where it gets interesting. This machine uses a Bosch Rexroth ctrlX CORE controller, which has a sophisticated error management system. Errors can exist at multiple levels:

1. **System-level errors** in the ctrlX CORE's diagnostic system
2. **Axis-level errors** in individual drive controllers

A single MC_Reset won't clear system-level errors. You need to hit the CXA Datalayer first.

### The Reset State Machine

```
        ┌─────────┐
        │  IDLE   │◀──────────────────────────────────────┐
        │(state 0)│                                        │
        └────┬────┘                                        │
             │ Reset rising edge                          │
             ▼                                             │
    ┌─────────────────┐                                   │
    │ CLEARING ERRORS │                                   │
    │    (state 1)    │                                   │
    │                 │                                   │
    │ DL_WriteNode to │                                   │
    │ 'diagnosis/     │                                   │
    │ confirm/all-    │                                   │
    │ errors'         │                                   │
    └────────┬────────┘                                   │
             │ Done or Error                              │
             ▼                                             │
    ┌─────────────────┐                                   │
    │ EXECUTE RESETS  │                                   │
    │    (state 2)    │                                   │
    │                 │                                   │
    │ MC_Reset on all │                                   │
    │ 36 axes         │                                   │
    └────────┬────────┘                                   │
             │                                             │
             ▼                                             │
    ┌─────────────────┐                                   │
    │ WAIT FOR RESETS │                                   │
    │    (state 3)    │                                   │
    │                 │                                   │ Reset = FALSE
    │ Check all       │───────────────────────────────────┘
    │ fbReset[i].Done │
    │                 │
    │ AllResetDone =  │
    │   TRUE when all │
    │   complete      │
    └─────────────────┘
```

### Why CXA Datalayer First?

The CXA_Datalayer is Rexroth's data bus for the ctrlX CORE. When you write to `'diagnosis/confirm/all-errors'`, you're telling the controller: *"I acknowledge all current errors - clear them from the diagnostic system."*

This is like resetting the master alarm before resetting individual breakers. The order matters.

```iecst
1: // Clear all errors via Datalayer
    fbPLC_Reset(
        Execute := TRUE,
        NodeName := 'diagnosis/confirm/all-errors'
    );

    IF fbPLC_Reset.Done OR fbPLC_Reset.Error THEN
        fbPLC_Reset(Execute := FALSE);
        resetState := 2;  // Now do axis resets
    END_IF
```

## The Power Control Philosophy

### Why Array-Based Design?

Notice the declaration:
```iecst
fbPower : ARRAY[MOTIF_CONFIG.MIN_AXIS_INDEX..MOTIF_CONFIG.MAX_AXIS_INDEX] OF MC_Power;
fbReset : ARRAY[MOTIF_CONFIG.MIN_AXIS_INDEX..MOTIF_CONFIG.MAX_AXIS_INDEX] OF MC_Reset;
```

Using arrays with configuration constants means:
1. **Scalability** - Change `MAX_AXIS_INDEX` and the code adapts
2. **Consistency** - Same indexing as the axis references
3. **Maintainability** - No hardcoded "36" scattered through the code

### The DrivesReady Calculation

```iecst
DrivesReady := PowerOn AND allReady AND (firstError = 0);
```

This single line encapsulates the meaning of "ready":
- Power must be commanded ON (`PowerOn`)
- All drives must report status TRUE (`allReady`)
- No drive can have an error (`firstError = 0`)

All three conditions. No shortcuts. No "mostly ready."

## How It Fits Into the Machine

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     FB_MachineStateMachine                               │
│                                                                          │
│   ┌─────────────────────────────────────────────────────────────────┐  │
│   │                         State Logic                              │  │
│   │                                                                  │  │
│   │   INIT ──▶ IDLE ──▶ RUNNING ──▶ STOPPING                       │  │
│   │              │                      │                            │  │
│   │              │         ┌────────────┴──────────────┐            │  │
│   │              │         │                           │            │  │
│   │              │         ▼                           ▼            │  │
│   │              │      FAULTED ◀───────────────── E_STOPPED       │  │
│   │              │         │                                        │  │
│   │              │         │ resetButton                            │  │
│   │              │         ▼                                        │  │
│   │              └────▶ RESETTING                                   │  │
│   └─────────────────────────────────────────────────────────────────┘  │
│                              │                                          │
│                              │ Uses                                     │
│                              ▼                                          │
│   ┌─────────────────────────────────────────────────────────────────┐  │
│   │                      FB_AxisPower                                │  │
│   │                                                                  │  │
│   │   PowerOn ◀── (controlled by state machine)                     │  │
│   │   Reset ◀── (resetButton while FAULTED/E_STOPPED)              │  │
│   │                                                                  │  │
│   │   DrivesReady ──▶ (gate for RUNNING state)                     │  │
│   │   ErrorAxisID ──▶ (fault display)                              │  │
│   └─────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

The machine state machine uses FB_AxisPower as its power subsystem. It doesn't care about the details of MC_Power or CXA_Datalayer - it just says "power on" or "reset," and FB_AxisPower handles the rest.

## The Edge Detection Pattern

Notice the rising edge trigger for reset:
```iecst
rtrigReset(CLK := Reset);

IF Reset THEN
    CASE resetState OF
        0: // Idle - start reset sequence on rising edge
            IF rtrigReset.Q THEN
                AllResetDone := FALSE;
                resetState := 1;
            END_IF
```

Why edge-triggered for reset but level-triggered for power?

- **Power**: Should stay on as long as commanded - level makes sense
- **Reset**: Is an action, not a state - you "do" a reset once, not continuously

This matches human mental models. An operator holds the power switch but *presses* the reset button.

## Lessons Learned

### Bug We Fixed: Reset Not Completing

Early versions had a bug where `AllResetDone` would never become TRUE. The problem? We were checking `fbReset[i].Done` before the FBs had time to execute.

**Root cause**: State 2 was setting Execute TRUE and immediately transitioning to state 3, which checked Done before the first scan completed.

**The fix**: State 2 now only sets up the resets, then state 3 continues calling them with Execute TRUE while waiting:

```iecst
3: // Wait for all axis resets to complete
    // Keep calling MC_Reset with Execute TRUE
    FOR i := MOTIF_CONFIG.MIN_AXIS_INDEX TO MOTIF_CONFIG.MAX_AXIS_INDEX DO
        fbReset[i](
            Execute := TRUE,  // Still executing!
            Axis := AXIF_CONFIG_INDEXES[i]
        );
    END_FOR

    // Check if all resets are done
    allReset := TRUE;
    FOR i := MOTIF_CONFIG.MIN_AXIS_INDEX TO MOTIF_CONFIG.MAX_AXIS_INDEX DO
        IF NOT fbReset[i].Done THEN
            allReset := FALSE;
            EXIT;
        END_IF
    END_FOR
```

### Pitfall: Forgetting to Clear Reset Execute

When Reset goes FALSE, you must clear all the MC_Reset Execute flags:

```iecst
ELSE
    // Reset not active - clear state and MC_Reset execute flags
    resetState := 0;
    fbPLC_Reset(Execute := FALSE);
    FOR i := MOTIF_CONFIG.MIN_AXIS_INDEX TO MOTIF_CONFIG.MAX_AXIS_INDEX DO
        fbReset[i](Execute := FALSE, Axis := AXIF_CONFIG_INDEXES[i]);
    END_FOR
END_IF
```

Without this cleanup, the reset would retrigger immediately on the next rising edge.

### Why Check firstError = 0?

```iecst
DrivesReady := PowerOn AND allReady AND (firstError = 0);
```

You might think `allReady` implies no errors. Not quite:
- A drive might report Status = TRUE but also have Error = TRUE
- Some errors are warnings that don't prevent operation
- The hardware behavior isn't always intuitive

Explicitly checking for zero errors removes ambiguity. Belt and suspenders.

## Best Practices

### 1. Single Instance
Only one FB_AxisPower should exist in the system. Multiple instances would create conflicting power commands.

### 2. Call Every Scan
Even when Reset is FALSE, the power loop needs to run to maintain `DrivesReady` status:
```iecst
// Power all axes (runs regardless of reset state)
FOR i := MOTIF_CONFIG.MIN_AXIS_INDEX TO MOTIF_CONFIG.MAX_AXIS_INDEX DO
    fbPower[i](Enable := PowerOn, Axis := AXIF_CONFIG_INDEXES[i]);
END_FOR
```

### 3. Use ErrorAxisID for Diagnostics
When `DrivesReady` is FALSE and `ErrorAxisID > 0`, you know exactly which axis to investigate first.

### 4. Complete Reset Sequence
Don't shortcut the reset. Even if `AllResetDone` becomes TRUE quickly, let the full sequence complete. Some drives need time to stabilize.

## Interface Reference

### Inputs
| Name | Type | Description |
|------|------|-------------|
| PowerOn | BOOL | Enable power to all drives |
| Reset | BOOL | Reset drive faults (rising edge triggers) |

### Outputs
| Name | Type | Description |
|------|------|-------------|
| DrivesReady | BOOL | TRUE when all drives are powered and error-free |
| AllResetDone | BOOL | TRUE when all resets have completed |
| ErrorAxisID | UINT | First axis with an error (0 = none) |

## The Responsibility

FB_AxisPower carries significant responsibility. It's the gatekeeper between the control system and 36 servo drives. Get it wrong and:
- Drives don't power up → machine won't run
- Resets don't complete → operators get frustrated
- Errors get missed → faults cascade

Get it right, and it's invisible. Operators press Start, drives come alive, production runs. That's the goal of infrastructure code - reliability so absolute that people forget it exists.

This FB isn't exciting. It doesn't do the fancy carving or coordinated motion. But without it, nothing else works. It's the foundation that everything else stands on.

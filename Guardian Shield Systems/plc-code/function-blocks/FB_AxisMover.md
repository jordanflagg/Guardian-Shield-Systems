# FB_AxisMover: The Heart of Motion

## The Story

Imagine you're a conductor. Every time you want a violin to play a note, you have to:
1. Raise your baton
2. Point at the violinist
3. Wait for them to start playing
4. Watch for them to finish
5. Check if they made a mistake
6. Lower your baton

Now imagine doing this 50 times in a concert. Exhausting, right?

That's exactly what happens in PLC motion control without a good wrapper. The raw `MC_MoveAbsolute` function block from PLCopen requires you to manage all these details every single time you want to move an axis. With 36 axes in this machine, that's a recipe for copy-paste disasters and bugs that only appear at 3 AM during production.

**FB_AxisMover is our solution**: a single, elegant wrapper that turns "execute a move" from a 20-line ceremony into a clean one-liner with consistent behavior everywhere.

## What It Does

FB_AxisMover wraps the PLCopen `MC_MoveAbsolute` function block with a state machine that handles:

- **Starting moves** when you set `Execute := TRUE`
- **Waiting for completion** and signaling `Done`
- **Error detection** and reporting
- **Clean reset** when you set `Execute := FALSE`
- **Retriggering** for the next move

It's like having a reliable assistant who knows exactly how to talk to the motors, so you can focus on *where* things need to go, not *how* to make them move.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                       FB_AxisMover                               │
│                                                                  │
│   ┌──────────┐     ┌───────────────────┐     ┌──────────┐      │
│   │  INPUTS  │────▶│   State Machine    │────▶│ OUTPUTS  │      │
│   │          │     │                    │     │          │      │
│   │ Execute  │     │  0: IDLE           │     │ Done     │      │
│   │ AxisRef  │     │  1: MOVING         │     │ Busy     │      │
│   │ Position │     │  2: DONE           │     │ Error    │      │
│   │ Velocity │     │  3: ERROR          │     │ ErrorID  │      │
│   │ Accel    │     │                    │     │ Active   │      │
│   │ Decel    │     │  ┌──────────────┐  │     │          │      │
│   │ Jerk     │     │  │MC_MoveAbsolute│ │     │          │      │
│   │          │     │  │   (PLCopen)   │  │     │          │      │
│   └──────────┘     │  └──────────────┘  │     └──────────┘      │
│                    └───────────────────┘                         │
└─────────────────────────────────────────────────────────────────┘
```

## The State Machine

Here's the beautiful part - a simple 4-state machine that handles everything:

```
        ┌─────────┐
        │  IDLE   │◀───────────────────────┐
        │ (state 0)│                        │
        └────┬────┘                        │
             │ Execute = TRUE              │ Execute = FALSE
             ▼                             │
        ┌─────────┐                        │
        │ MOVING  │                        │
        │(state 1)│                        │
        └────┬────┘                        │
             │                             │
    ┌────────┴────────┐                    │
    │                 │                    │
    ▼                 ▼                    │
┌─────────┐     ┌─────────┐               │
│  DONE   │     │  ERROR  │               │
│(state 2)│     │(state 3)│───────────────┘
└────┬────┘     └────┬────┘
     │               │
     └───────────────┘
```

### State 0: IDLE
The FB is waiting patiently. All outputs are cleared. The moment `Execute` goes TRUE, it springs into action.

### State 1: MOVING
The FB is actively commanding `MC_MoveAbsolute`. It monitors for either `Done` or `Error` from the underlying motion block.

### State 2: DONE
Success! The axis reached its target. The FB signals `Done := TRUE` and waits for `Execute` to go FALSE before returning to IDLE for the next command.

### State 3: ERROR
Something went wrong. The FB captures the `ErrorID` and waits for `Execute` to go FALSE. Fault clearing happens via `FB_AxisPower` - this FB just reports the problem.

## Why This Design?

### Level-Triggered, Not Edge-Triggered

Notice how the FB uses **level triggering**: it starts moving when `Execute` is TRUE, not on the rising edge. This is deliberate:

```
// Level-triggered: start move when Execute is TRUE
IF Execute THEN
    state := 1;
```

Why? Because in a motion sequence, you often want to:
1. Set up the move parameters
2. Set `Execute := TRUE`
3. Let the FB handle everything
4. Wait for `Done`
5. Set `Execute := FALSE`
6. Move to the next step

With edge triggering, you'd need to pulse the Execute signal, which adds complexity and timing sensitivity. Level triggering is simpler and more robust.

### Why Wrap MC_MoveAbsolute?

The raw `MC_MoveAbsolute` has some quirks:
- You need to call it *every scan* while it's running
- You need to track its state yourself
- Error handling is manual
- Retriggering requires careful management of the Execute flag

Our wrapper encapsulates all of this. The caller just needs to:
```
moverAxis1(Execute := TRUE, AxisRef := Axis_1, Position := 100.0, ...);
IF moverAxis1.Done THEN
    // Move complete!
END_IF
```

### The "Active" Output

Notice the `Active` output - it's TRUE when the FB is actively commanding motion. This is different from `Busy`:

- **Busy**: The FB has accepted a command and hasn't finished yet
- **Active**: The FB is currently sending commands to the motor

This distinction matters for diagnostics. You can see at a glance which FBs are talking to hardware right now.

## How It Fits Into the Architecture

FB_AxisMover is a **Layer 1** component - the foundation that everything else builds on:

```
┌─────────────────────────────────────────────────────────────────────┐
│ Layer 5: FB_MachineStateMachine                                     │
├─────────────────────────────────────────────────────────────────────┤
│ Layer 4: FB_MotionSequence                                          │
├─────────────────────────────────────────────────────────────────────┤
│ Layer 3: FB_MotionStep_LoadBlock, FB_MotionStep_Studs, etc.         │
├─────────────────────────────────────────────────────────────────────┤
│ Layer 2: FB_MultiAxisMover, FB_AxisGearing, FB_AxisHome             │
├─────────────────────────────────────────────────────────────────────┤
│ Layer 1: FB_AxisMover, FB_AxisData, FB_AxisManual ◀── YOU ARE HERE  │
├─────────────────────────────────────────────────────────────────────┤
│ Layer 0: PLCopen MC_MoveAbsolute, MC_Power, etc.                    │
└─────────────────────────────────────────────────────────────────────┘
```

Higher-level FBs like `FB_MultiAxisMover` create arrays of `FB_AxisMover` instances. Motion step FBs instantiate individual movers for each axis they control.

## Usage Example

Here's how FB_MotionStep_LoadBlock uses FB_AxisMover:

```iecst
VAR
    moverAxis1 : FB_AxisMover;
END_VAR

// Substep 0: Shift block to left wall
CASE subStep OF
    0:
        moverAxis1(
            Execute := TRUE,
            AxisRef := Axis_1,
            Position := Positions.axis1_ShiftPosition,
            Velocity := MotionParams.defaultVelocity,
            Acceleration := MotionParams.defaultAcceleration,
            Deceleration := MotionParams.defaultDeceleration,
            Jerk := MotionParams.defaultJerk
        );

        IF moverAxis1.Error THEN
            Error := TRUE;
            ErrorAxisID := 1;
        ELSIF moverAxis1.Done THEN
            moverAxis1(Execute := FALSE);  // Clear for next use
            subStep := 1;
        END_IF
END_CASE
```

Clean. Simple. The motion step focuses on *what* to do, not *how* to do it.

## Lessons Learned

### Bug We Fixed: Forgetting to Clear Execute

Early on, we had a bug where moves would immediately restart after completion. The problem? We forgot to set `Execute := FALSE` before transitioning to the next substep.

**The fix**: Make it a habit to always clear Execute when transitioning:
```iecst
ELSIF moverAxis1.Done THEN
    moverAxis1(Execute := FALSE);  // ALWAYS do this!
    subStep := 1;
END_IF
```

### Pitfall: Calling with Wrong Axis Reference

Structured Text doesn't stop you from passing the wrong axis reference. We've caught bugs where code was moving Axis_2 instead of Axis_1 because of copy-paste errors.

**Best practice**: Use descriptive variable names:
```iecst
moverAxis6 : FB_AxisMover;  // Name matches the axis it controls
```

### Why No Timeout?

You might notice there's no timeout in FB_AxisMover. That's intentional. Timeouts are application-specific - a 10-second move is normal for some axes but a disaster for others.

Higher-level FBs (like the motion steps) can implement timeouts if needed. FB_AxisMover stays simple and focused on its one job: wrapping MC_MoveAbsolute cleanly.

## Best Practices

1. **One FB instance per axis per motion step** - Don't try to reuse the same FB_AxisMover for multiple axes

2. **Always check Error before Done** - Errors take precedence:
   ```iecst
   IF mover.Error THEN
       // Handle error
   ELSIF mover.Done THEN
       // Success path
   END_IF
   ```

3. **Clear Execute before transitioning** - Makes the FB ready for its next command

4. **Name instances descriptively** - `moverAxis14` is better than `mover1`

5. **Let FB_AxisPower handle fault clearing** - FB_AxisMover just reports errors, it doesn't clear them

## Interface Reference

### Inputs
| Name | Type | Description |
|------|------|-------------|
| Execute | BOOL | TRUE to command move, FALSE to stop |
| AxisRef | AXIS_REF | Axis reference to move |
| Position | LREAL | Target position (mm) |
| Velocity | LREAL | Move velocity (mm/s) |
| Acceleration | LREAL | Acceleration (mm/s²) |
| Deceleration | LREAL | Deceleration (mm/s²) |
| Jerk | LREAL | Jerk limit (mm/s³) |

### Outputs
| Name | Type | Description |
|------|------|-------------|
| Done | BOOL | Move completed successfully |
| Busy | BOOL | Move in progress |
| Error | BOOL | Move failed |
| ErrorID | ERROR_CODE | Error code from MC_MoveAbsolute |
| Active | BOOL | FB is actively commanding motion |

## The Philosophy

FB_AxisMover embodies a core principle: **do one thing well**. It doesn't try to handle gearing, or power management, or error recovery. It wraps a single PLCopen function block with a clean interface and consistent behavior.

This simplicity is its strength. When debugging at 3 AM, you know exactly what FB_AxisMover does. When you see it in code, you understand the intent immediately. When you need to move an axis, you reach for this tool with confidence.

That's the goal of good engineering: making the complex simple, and the simple reliable.

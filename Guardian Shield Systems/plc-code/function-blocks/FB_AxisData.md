# FB_AxisData: The Eyes of the Machine

## The Story

Picture this: you're a surgeon performing an operation, but you can only see your patient through a tiny window that shows one thing at a time. Want to check the heart rate? Flip a switch. Blood pressure? Another switch. Oxygen levels? Yet another.

That's what an HMI operator faces when monitoring a 36-axis CNC machine without good data access. They need to see *any* axis, *any time*, with real-time position and velocity data.

**FB_AxisData is that universal window** - it's a smart data reader that can be pointed at any axis and immediately starts streaming live position and velocity information. No configuration needed. Just tell it which axis you want to see.

## What It Does

FB_AxisData provides a clean interface for reading real-time axis information:

- **Position** (mm) - Where the axis is right now
- **Velocity** (mm/s) - How fast it's moving
- **Axis validity check** - Confirms the selected axis (1-36) exists

It's designed to be called directly from PLC_PRG and is **completely independent of machine state**. Whether the machine is running, stopped, faulted, or in manual mode - FB_AxisData keeps providing current data.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        FB_AxisData                               │
│                                                                  │
│   ┌──────────┐     ┌───────────────────┐     ┌──────────┐      │
│   │  INPUTS  │     │   PLCopen FBs      │     │ OUTPUTS  │      │
│   │          │     │                    │     │          │      │
│   │AxisSelect│────▶│ MC_ReadActual-    │────▶│ Position │      │
│   │ (1-36)   │     │    Position        │     │ Velocity │      │
│   │          │     │                    │     │AxisValid │      │
│   │          │     │ MC_ReadActual-    │     │          │      │
│   │          │     │    Velocity        │     │          │      │
│   └──────────┘     └───────────────────┘     └──────────┘      │
│                           ▲                                      │
│                           │                                      │
│                    ┌──────┴──────┐                              │
│                    │ AXIF_CONFIG │                              │
│                    │   INDEXES   │                              │
│                    │ (axis refs) │                              │
│                    └─────────────┘                              │
└─────────────────────────────────────────────────────────────────┘
```

## The Clever Part: Axis Switching

Here's where it gets interesting. The PLCopen function blocks `MC_ReadActualPosition` and `MC_ReadActualVelocity` are designed for **continuous reading** - you set `Enable := TRUE` and they stream data every scan.

But what happens when you change which axis you're looking at? You can't just point the FB at a new axis mid-stream. You need to:

1. **Disable** the current reading (Enable := FALSE)
2. **Wait one scan** for the FB to release the old axis
3. **Re-enable** with the new axis reference

The code handles this elegantly:

```iecst
// Detect axis change - need to cycle Enable to switch axis reference
IF AxisSelect <> lastAxisSelect THEN
    // Disable the FBs first (will re-enable next scan)
    axisChanging := TRUE;
    axisRef := AXIF_CONFIG_INDEXES[AxisSelect];
    lastAxisSelect := AxisSelect;

    // Call with Enable FALSE to release the old axis
    fbReadPosition(Axis := axisRef, Enable := FALSE);
    fbReadVelocity(Axis := axisRef, Enable := FALSE);

    RETURN;  // Wait one scan before re-enabling
END_IF

// Clear the changing flag after one scan
axisChanging := FALSE;
```

This **one-scan delay** is invisible to the user but crucial for proper operation. Without it, you'd get stale data or errors when switching axes rapidly.

## Why This Design Matters

### Independence from Machine State

Look at the comment in the header:
> *Independent of machine state - always provides current axis data*

This is a deliberate architectural decision. The HMI needs data regardless of what the machine is doing:

- **Machine running?** Show position/velocity
- **Machine stopped?** Show position/velocity
- **Machine faulted?** Show position/velocity
- **E-stop active?** Show position/velocity

FB_AxisData doesn't care about states. It just reads data. This separation of concerns keeps the code clean and the HMI responsive.

### The `{attribute 'no_assign'}` Declaration

Notice the attribute at the top:
```iecst
{attribute 'no_assign'}
FUNCTION_BLOCK FB_AxisData
```

This prevents accidental assignment of the FB instance, which would break the internal state. It's a defensive programming technique that catches bugs at compile time.

### Future Expansion

Check out those commented fields:
```iecst
// Future expansion:
// InPosition    : BOOL;        // TRUE when axis is at commanded position
// IsMoving      : BOOL;        // TRUE when axis is in motion
// HasError      : BOOL;        // TRUE if axis has an error
// ErrorCode     : DWORD;       // Axis error code
// Torque        : LREAL;       // Current torque (%)
```

The interface is designed to grow. When the HMI needs more data, the structure is ready. This is **forward-thinking design** - building in extensibility without over-engineering the current implementation.

## How It Fits Into the System

```
┌─────────────────────────────────────────────────────────────────┐
│                          PLC_PRG                                 │
│                                                                  │
│   ┌──────────────────────────────────────────────────────────┐  │
│   │ HMI Interface Variables                                   │  │
│   │                                                           │  │
│   │  HMI_AxisSelect ──────┬──────▶ HMI_AxisPosition          │  │
│   │                       │        HMI_AxisVelocity           │  │
│   │                       │                                   │  │
│   │                       ▼                                   │  │
│   │               ┌──────────────┐                           │  │
│   │               │ FB_AxisData  │                           │  │
│   │               │              │                           │  │
│   │               │ (Called every│                           │  │
│   │               │  PLC scan)   │                           │  │
│   │               └──────────────┘                           │  │
│   └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│   ┌──────────────────────────────────────────────────────────┐  │
│   │ Machine State Machine (separate from axis data)           │  │
│   └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

The HMI sends `HMI_AxisSelect` (which axis to monitor), and receives back `HMI_AxisPosition` and `HMI_AxisVelocity`. Simple, clean, decoupled.

## Usage Example

In PLC_PRG:
```iecst
VAR
    fbAxisData : FB_AxisData;
    HMI_AxisSelect : UINT := 1;      // HMI writes this
    HMI_AxisPosition : LREAL;         // HMI reads this
    HMI_AxisVelocity : LREAL;         // HMI reads this
END_VAR

// Called every scan
fbAxisData(AxisSelect := HMI_AxisSelect);

IF fbAxisData.AxisValid THEN
    HMI_AxisPosition := fbAxisData.Position;
    HMI_AxisVelocity := fbAxisData.Velocity;
ELSE
    HMI_AxisPosition := 0.0;
    HMI_AxisVelocity := 0.0;
END_IF
```

The HMI operator changes `HMI_AxisSelect` from 1 to 36, and the display instantly shows that axis's data.

## Lessons Learned

### Bug We Fixed: The Enable Cycling Problem

Early versions didn't have the axis-switching logic. When you changed axes, you'd sometimes see the *old* axis's data for a few scans, or worse, get a brief error.

**The root cause**: PLCopen FBs hold a reference to the axis. Changing the axis input while Enable is TRUE creates undefined behavior.

**The fix**: Always disable before switching, wait one scan, then re-enable. The `axisChanging` flag and `RETURN` statement handle this cleanly.

### Pitfall: Reading Too Many Axes

Don't create 36 instances of FB_AxisData thinking "I'll read them all at once." Each instance creates two PLCopen FB calls per scan. That's:
- 36 axes × 2 FBs × scan time = significant CPU load

**Best practice**: Use one FB_AxisData instance that can be pointed at any axis. The HMI only shows one axis at a time anyway.

### Why LREAL Instead of REAL?

Position and velocity are `LREAL` (64-bit double) rather than `REAL` (32-bit float). Why?

For a 36-axis machine with millimeter precision across potentially meters of travel, floating-point precision matters. A 32-bit float starts losing precision around 7 significant digits. With positions like `12345.678` mm, you're already pushing limits.

`LREAL` gives us 15-16 significant digits - plenty of headroom for precise positioning.

## The Design Philosophy

FB_AxisData exemplifies several good engineering principles:

### Single Responsibility
It does one thing: read axis data. It doesn't move axes, doesn't check limits, doesn't manage state. Just reads data.

### Graceful Degradation
Invalid axis selection? Return zeros and set `AxisValid := FALSE`. No crashes, no errors propagating up the stack.

### Transparency
The outputs directly reflect the hardware state. No caching, no interpolation, no "helpful" modifications. What you read is what the axis is doing right now.

### Extensibility Without Modification
Those commented output fields show the path for future features without changing existing interfaces. When torque monitoring is needed, add it without breaking existing HMI code.

## Interface Reference

### Inputs
| Name | Type | Description |
|------|------|-------------|
| AxisSelect | UINT | Selected axis number (1-36) |

### Outputs
| Name | Type | Description |
|------|------|-------------|
| Position | LREAL | Current position (mm) |
| Velocity | LREAL | Current velocity (mm/s) |
| AxisValid | BOOL | TRUE if axis selection is valid (1-36) |

## The Human Factor

This FB exists because humans need information. A machine operator watching a 36-axis CNC doesn't think in terms of PLCopen function blocks and axis references. They think: *"Show me axis 14. What's its position? Is it moving?"*

FB_AxisData bridges that gap. It translates human questions into PLC data access, handling all the technical details so the operator can focus on the machine, not the software.

That's what good infrastructure code does - it disappears into the background, making everything else work smoothly while staying out of the way.

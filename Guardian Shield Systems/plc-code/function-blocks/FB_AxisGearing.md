# FB_AxisGearing: The Synchronized Dance

## The Story

Picture a team of synchronized swimmers. The lead swimmer sets the pace, and everyone else matches their movements exactly. They don't need individual cues - they watch the lead and follow.

That's **electronic gearing** in motion control. A master axis moves, and slave axes follow automatically, maintaining a precise ratio relationship. Move the master 10mm, and the slave moves 10mm (for a 1:1 ratio). No separate commands, no coordination logic, no timing worries.

This machine has **18 gearing pairs** - 18 master axes each with one or more slaves that follow their every move. FB_AxisGearing manages all of them, establishing the relationships when the machine starts and maintaining them throughout operation.

## What It Does

FB_AxisGearing manages all electronic gearing in the system:

- **Engagement** - Establishes 1:1 gearing between masters and slaves
- **Disengagement** - Cleanly releases gearing when commanded
- **Status monitoring** - Tracks which pairs are in sync
- **Error detection** - Reports which slave failed if gearing can't be established

## The Gearing Map

Here's the complete relationship map for this machine:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           GEARING RELATIONSHIPS                              │
│                           (18 pairs total)                                   │
│                                                                              │
│   LOAD TABLE LIFT (3 pairs)                                                 │
│   ┌─────────┐                                                               │
│   │ Master 2│──▶ Slave 3                                                   │
│   │         │──▶ Slave 4                                                   │
│   │         │──▶ Slave 5                                                   │
│   └─────────┘                                                               │
│                                                                              │
│   SHIFT CENTER (1 pair)          PUSHER (1 pair)                           │
│   ┌─────────┐                    ┌─────────┐                               │
│   │ Master 6│──▶ Slave 7        │ Master 8│──▶ Slave 9                    │
│   └─────────┘                    └─────────┘                               │
│                                                                              │
│   UNLOAD TABLE LIFT (3 pairs)                                               │
│   ┌──────────┐                                                              │
│   │Master 10 │──▶ Slave 11                                                 │
│   │          │──▶ Slave 12                                                 │
│   │          │──▶ Slave 13                                                 │
│   └──────────┘                                                              │
│                                                                              │
│   STUD CARVING (8 pairs)                                                    │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐                  │
│   │Master 14 │  │Master 15 │  │Master 18 │  │Master 19 │                  │
│   │    │     │  │    │     │  │    │     │  │    │     │                  │
│   │    ▼     │  │    ▼     │  │    ▼     │  │    ▼     │                  │
│   │ Slave 16 │  │ Slave 17 │  │ Slave 20 │  │ Slave 21 │                  │
│   └──────────┘  └──────────┘  └──────────┘  └──────────┘                  │
│                                                                              │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐                  │
│   │Master 22 │  │Master 23 │  │Master 26 │  │Master 27 │                  │
│   │    │     │  │    │     │  │    │     │  │    │     │                  │
│   │    ▼     │  │    ▼     │  │    ▼     │  │    ▼     │                  │
│   │ Slave 24 │  │ Slave 25 │  │ Slave 28 │  │ Slave 29 │                  │
│   └──────────┘  └──────────┘  └──────────┘  └──────────┘                  │
│                                                                              │
│   WINDOW/DOOR HOT WIRE (2 pairs)                                            │
│   ┌──────────┐  ┌──────────┐                                               │
│   │Master 30 │  │Master 31 │                                               │
│   │    │     │  │    │     │                                               │
│   │    ▼     │  │    ▼     │                                               │
│   │ Slave 32 │  │ Slave 33 │                                               │
│   └──────────┘  └──────────┘                                               │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Why We Need Gearing

Without gearing, moving the load table lift would require:
1. Command Axis 2 to move to 100mm
2. Simultaneously command Axis 3 to move to 100mm
3. Simultaneously command Axis 4 to move to 100mm
4. Simultaneously command Axis 5 to move to 100mm
5. Hope they all start at exactly the same time
6. Handle errors if any one falls behind

With gearing:
1. Command Axis 2 to move to 100mm
2. Axes 3, 4, 5 follow automatically

The drive system handles the synchronization at the servo loop level - far faster and more precise than PLC-level coordination could ever achieve.

## The VAR_IN_OUT Challenge

Here's a technical wrinkle that shapes the entire FB design. The PLCopen `MB_GearInPos` function block requires axis references as **VAR_IN_OUT**:

```iecst
MB_GearInPos(
    Execute := TRUE,
    Master := axisRef_2,    // VAR_IN_OUT - can't be array element
    Slave := axisRef_3,     // VAR_IN_OUT - can't be array element
    ...
);
```

In Structured Text, you can't pass an array element to a VAR_IN_OUT parameter. So we can't do:
```iecst
// THIS DOESN'T WORK
FOR i := 1 TO 18 DO
    fbGear[i](Master := AXIS_REF[masterAxis[i]], Slave := AXIS_REF[slaveAxis[i]]);
END_FOR
```

Instead, we need **18 explicit gearing FB instances**, each with hardcoded axis references:

```iecst
VAR
    fbGear_2_3 : MB_GearInPos;
    fbGear_2_4 : MB_GearInPos;
    fbGear_2_5 : MB_GearInPos;
    fbGear_6_7 : MB_GearInPos;
    // ... 14 more
END_VAR
```

This is verbose but necessary. The naming convention `fbGear_{master}_{slave}` makes relationships clear.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            FB_AxisGearing                                    │
│                                                                              │
│   ┌─────────┐                                                               │
│   │ Execute │──────┐                                                        │
│   └─────────┘      │                                                        │
│                    │                                                        │
│                    ▼                                                        │
│   ┌────────────────────────────────────────────────────────────────────┐   │
│   │                     Edge Detection                                  │   │
│   │   executeRising := Execute AND NOT executePrev                     │   │
│   └────────────────────────────────────────────────────────────────────┘   │
│                    │                                                        │
│          ┌────────┴────────┐                                               │
│          │                 │                                               │
│          ▼                 ▼                                               │
│   Execute = FALSE    Execute = TRUE                                        │
│          │                 │                                               │
│          ▼                 ▼                                               │
│   ┌────────────┐   ┌────────────────────────────────────────────────┐     │
│   │ DISENGAGE  │   │ ENGAGE - Call all 18 MB_GearInPos with 1:1     │     │
│   │            │   │                                                 │     │
│   │ All FBs:   │   │ fbGear_2_3(Execute:=TRUE, Master:=Axis2, ...)  │     │
│   │ Execute:=  │   │ fbGear_2_4(Execute:=TRUE, Master:=Axis2, ...)  │     │
│   │   FALSE    │   │ ...                                             │     │
│   │            │   │ fbGear_31_33(Execute:=TRUE, Master:=Axis31,...) │     │
│   └────────────┘   └────────────────────────────────────────────────┘     │
│                                   │                                        │
│                                   ▼                                        │
│   ┌────────────────────────────────────────────────────────────────────┐   │
│   │                    Status Collection                                │   │
│   │                                                                     │   │
│   │   pairInSync[1] := fbGear_2_3.InSync                               │   │
│   │   pairError[1]  := fbGear_2_3.Error                                │   │
│   │   ...                                                               │   │
│   │   pairInSync[18] := fbGear_31_33.InSync                            │   │
│   │   pairError[18]  := fbGear_31_33.Error                             │   │
│   └────────────────────────────────────────────────────────────────────┘   │
│                                   │                                        │
│                                   ▼                                        │
│   ┌────────────────────────────────────────────────────────────────────┐   │
│   │                   Status Aggregation Loop                           │   │
│   │                                                                     │   │
│   │   FOR i := 1 TO 18 DO                                              │   │
│   │       IF pairError[i] AND NOT Error THEN                           │   │
│   │           Error := TRUE                                            │   │
│   │           ErrorAxisID := SLAVE_AXIS_MAP[i]                         │   │
│   │       END_IF                                                       │   │
│   │       IF pairInSync[i] THEN                                        │   │
│   │           ActivePairCount := ActivePairCount + 1                   │   │
│   │       ELSE                                                         │   │
│   │           Done := FALSE                                            │   │
│   │       END_IF                                                       │   │
│   │   END_FOR                                                          │   │
│   └────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   ┌──────────────────────────────────────────────────────────────────────┐ │
│   │ OUTPUTS                                                               │ │
│   │                                                                       │ │
│   │   Done            - All 18 pairs in sync                             │ │
│   │   Busy            - Gearing engagement in progress                   │ │
│   │   Error           - At least one pair failed                         │ │
│   │   ErrorAxisID     - Which SLAVE axis had error (for diagnosis)      │ │
│   │   ActivePairCount - How many pairs are currently in sync            │ │
│   └──────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

## The Slave Axis Map

When a gearing pair fails, we report the **slave** axis, not the master:

```iecst
SLAVE_AXIS_MAP : ARRAY[1..18] OF UINT := [
    3,   // Pair 1:  2->3
    4,   // Pair 2:  2->4
    5,   // Pair 3:  2->5
    ...
];

// In error handling
ErrorAxisID := SLAVE_AXIS_MAP[i];
```

Why report the slave? Because gearing errors typically happen on the slave side:
- Slave not powered
- Slave position too far from expected sync point
- Slave drive fault

The master was commanding motion fine; it's the slave that couldn't keep up. Reporting the slave points operators directly at the problem.

## When Gearing Needs Re-engagement

Gearing gets disrupted by:

1. **MC_Halt** - Stopping motion breaks the gearing relationship
2. **E-Stop** - Emergency halt disconnects gearing
3. **Power cycle** - Gearing state isn't persistent
4. **Fault recovery** - After clearing drive faults

The state machine handles this with a `gearingNeeded` flag:

```iecst
// In FB_MachineStateMachine
E_MachineState.RUNNING:
    IF gearingNeeded THEN
        axisGearing(Execute := TRUE);

        IF axisGearing.Done THEN
            gearingNeeded := FALSE;  // Ready to run motion
        ELSIF axisGearing.Error THEN
            currentState := E_MachineState.FAULTED;
        END_IF
    ELSE
        // Gearing active - run motion sequence
        motionSequence(Enable := TRUE, ...);
    END_IF

E_MachineState.STOPPING:
E_MachineState.FAULTED:
E_MachineState.E_STOPPED:
    gearingNeeded := TRUE;  // Will need to re-engage
    axisGearing(Execute := FALSE);
```

## The 1:1 Ratio

All gearing pairs use 1:1 ratio:
```iecst
fbGear_2_3(
    Execute := gearingActive,
    Master := AXIF_CONFIG_INDEXES[2],
    Slave := AXIF_CONFIG_INDEXES[3],
    RatioNumerator := 1,
    RatioDenominator := 1
);
```

Why 1:1? Because on this machine, slaves are physically identical to their masters - same motor, same leadscrew, same mechanical advantage. Move the master 50mm, the slave should move 50mm.

Different ratios would be used for applications like:
- Gearboxes (motor turns 3 times for 1 output turn → 3:1)
- Rack-and-pinion where dimensions differ
- Differential mechanisms

For this machine's parallel lift cylinders and synchronized hot wire guides, 1:1 is correct.

## Lessons Learned

### Bug We Fixed: Gearing Not Disengaging

Early versions didn't call the gearing FBs when `Execute = FALSE`. This left gearing active even when we thought it was off.

**The fix**: Explicitly call all FBs with `Execute := FALSE` when disengaging:

```iecst
IF NOT Execute THEN
    // Must explicitly disengage each pair
    fbGear_2_3(Execute := FALSE, Master := AXIF_CONFIG_INDEXES[2], Slave := AXIF_CONFIG_INDEXES[3]);
    fbGear_2_4(Execute := FALSE, Master := AXIF_CONFIG_INDEXES[2], Slave := AXIF_CONFIG_INDEXES[4]);
    ...
END_IF
```

### Pitfall: Engaging on Moving Axes

Never try to engage gearing while axes are moving. `MB_GearInPos` will error if the slave can't catch up to the expected position.

**Best practice**: Home all axes first, ensure they're stationary, then engage gearing.

### Why ActivePairCount?

During commissioning, `ActivePairCount` is invaluable. You can watch it climb from 0 to 18 as gearing establishes, seeing exactly how many pairs are synced at any moment.

If it stalls at 15, you know 3 pairs haven't synced yet - check those slaves.

## Interface Reference

### Inputs
| Name | Type | Description |
|------|------|-------------|
| Execute | BOOL | TRUE to engage gearing, FALSE to disengage |

### Outputs
| Name | Type | Description |
|------|------|-------------|
| Done | BOOL | All gearing successfully engaged |
| Busy | BOOL | Gearing engagement in progress |
| Error | BOOL | One or more gearing operations failed |
| ErrorAxisID | UINT | Which slave axis had the error (0 = none) |
| ActivePairCount | UINT | Number of gearing pairs currently active |

## The Beauty of Gearing

Electronic gearing is one of those features that seems simple but enables incredible things.

Without it, synchronized multi-axis motion requires:
- Interpolation calculations
- Position command distribution
- Error correction across axes
- Timing coordination at millisecond precision

With it, you command one axis and get perfect synchronization on others - handled in hardware at microsecond loop rates.

FB_AxisGearing manages the housekeeping: establishing relationships, monitoring status, handling errors. It turns 18 master-slave relationships into a single command: "Engage gearing" / "Disengage gearing."

Simple interface. Complex capability. That's the goal.

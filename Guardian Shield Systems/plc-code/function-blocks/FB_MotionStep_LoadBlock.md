# FB_MotionStep_LoadBlock: The Material Handler

## The Story

Every manufacturing cycle begins the same way: raw material must become work-in-progress.

For this machine, that means taking a 4x8 foot foam block from the load table and positioning it precisely in the processing center. It sounds simple, but the choreography involves 5 different axes working in sequence, lifting, shifting, and placing with millimeter precision.

**FB_MotionStep_LoadBlock handles this critical first step.** It's the handshake between human (placing the block) and machine (processing it).

## What It Does

FB_MotionStep_LoadBlock executes 11 substeps:

1. **Shift to wall** (Axis 1) - Align block against reference
2. **Raise load table** (Axis 2 → slaves 3,4,5) - Lift block
3. **Shift to center** (Axis 6 → slave 7) - Move toward processing area
4. **Lower load table** (Axis 2) - Clear the transfer path
5. **Return shift mechanism** (Axis 6) - Reset for next cycle
6. **Raise unload table** (Axis 10 → slaves 11,12,13) - Prepare to receive
7. **Center block** (Axis 8 → slave 9) - Final positioning
8. **Engage suction** - (TODO: waiting for I/O integration)
9. **Return pusher** (Axis 8) - Clear the work area
10. **Lower unload table** (Axis 10) - Block now held by suction
11. **Complete** - Ready for carving

## The Physical Sequence

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      LOAD BLOCK - PHYSICAL SEQUENCE                          │
│                                                                              │
│   STEP 0: SHIFT TO WALL                                                     │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                                                                      │   │
│   │       ◄───────── Axis 1                                             │   │
│   │       ┌─────────────────────────────────────┐                       │   │
│   │       │░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│◄── Foam block         │   │
│   │       └─────────────────────────────────────┘                       │   │
│   │       ▲                                     ▲                        │   │
│   │   Load Table                            Wall (reference)            │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   STEPS 1-4: LIFT AND TRANSFER                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                              Axis 6 shifts                          │   │
│   │                              ────────▶                              │   │
│   │                    ┌──────────────────────────┐                     │   │
│   │         ▲          │░░░░░░░░░░░░░░░░░░░░░░░░░│                     │   │
│   │  Axis 2 │          └──────────────────────────┘                     │   │
│   │   lifts │                                                           │   │
│   │         │                                                           │   │
│   │   ══════╧══════════════════                                        │   │
│   │   Load Table (raised)                                               │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   STEPS 5-10: RECEIVE AND HOLD                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                                                                      │   │
│   │                              Suction cups                           │   │
│   │                                  ▼ ▼ ▼                              │   │
│   │                    ┌──────────────────────────┐                     │   │
│   │                    │░░░░░░░░░░░░░░░░░░░░░░░░░│                     │   │
│   │        Axis 8      └──────────────────────────┘                     │   │
│   │        centers ──▶           ▲                                      │   │
│   │                        Axis 10 raises                               │   │
│   │                        to receive                                   │   │
│   │                                                                      │   │
│   │   Ready for carving operations                                      │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         FB_MotionStep_LoadBlock                              │
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                         BASE HANDLER                                 │   │
│   │                                                                      │   │
│   │   base : FB_MotionStepBase                                          │   │
│   │   ├── Enable handling                                               │   │
│   │   ├── Substep reset signaling                                       │   │
│   │   └── Run gating                                                    │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                              │                                               │
│                              ▼                                               │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                      AXIS MOVERS                                     │   │
│   │                                                                      │   │
│   │   moverAxis1  : FB_AxisMover   ─── Shift mechanism                  │   │
│   │   moverAxis2  : FB_AxisMover   ─── Load table lift (master)         │   │
│   │   moverAxis6  : FB_AxisMover   ─── Center shift (master)            │   │
│   │   moverAxis8  : FB_AxisMover   ─── Pusher (master)                  │   │
│   │   moverAxis10 : FB_AxisMover   ─── Unload table lift (master)       │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                              │                                               │
│                              ▼                                               │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                    SUBSTEP STATE MACHINE                             │   │
│   │                                                                      │   │
│   │   subStep : UINT (0-10)                                             │   │
│   │                                                                      │   │
│   │    0: Axis 1 shift      4: Axis 6 return     8: Axis 8 return      │   │
│   │    1: Axis 2 raise      5: Axis 10 raise     9: Axis 10 lower      │   │
│   │    2: Axis 6 shift      6: Axis 8 center    10: COMPLETE           │   │
│   │    3: Axis 2 lower      7: Suction engage                           │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                              │                                               │
│                              ▼                                               │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                         OUTPUTS                                      │   │
│   │                                                                      │   │
│   │   Done            ─── Step complete                                 │   │
│   │   Busy            ─── Step in progress                              │   │
│   │   Error           ─── Motion failed                                 │   │
│   │   ErrorAxisID     ─── Which axis failed                             │   │
│   │   CurrentSubStep  ─── For HMI display                               │   │
│   │   ActiveAxesMask  ─── Which axes are moving                         │   │
│   │   StepDescription ─── Human-readable status                         │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

## The Substep Pattern

Each substep follows a consistent pattern:

```iecst
2: // Axis 6 shifts block toward center - slave 7 follows
    StepDescription := 'Shifting block to center';
    ActiveAxesMask := FC_BuildAxisMask(6, 0, 0, 0, 0, 0, 0, 0);

    moverAxis6(
        Execute := TRUE,
        AxisRef := Axis_6,
        Position := Positions.axis6_ShiftPosition,
        Velocity := MotionParams.defaultVelocity,
        Acceleration := MotionParams.defaultAcceleration,
        Deceleration := MotionParams.defaultDeceleration,
        Jerk := MotionParams.defaultJerk
    );

    IF moverAxis6.Error THEN
        Error := TRUE;
        ErrorAxisID := 6;
    ELSIF moverAxis6.Done THEN
        moverAxis6(Execute := FALSE);  // Clean up
        subStep := 3;                   // Advance
    END_IF
```

The structure:
1. **Set description** - What we're doing right now
2. **Set active mask** - Which axis is moving
3. **Execute mover** - Command the motion
4. **Check error** - Report if something failed
5. **Check done** - Advance when complete

## The FC_BuildAxisMask Utility

```iecst
ActiveAxesMask := FC_BuildAxisMask(6, 0, 0, 0, 0, 0, 0, 0);
```

This helper function creates a 64-bit mask with the specified axis bits set. Pass the axis numbers you're using; zeros are ignored.

For axis 6, this produces a mask with bit 6 set (value 64). The HMI can then light up an indicator for axis 6.

When multiple axes move together (which doesn't happen in this step since all moves are sequential), you'd pass multiple numbers:
```iecst
ActiveAxesMask := FC_BuildAxisMask(2, 3, 4, 5, 0, 0, 0, 0);  // Table lift
```

## Recipe-Driven Positions

All positions come from the recipe:

```iecst
Position := Positions.axis6_ShiftPosition
Position := Positions.axis2_RaisePosition
Position := Positions.axis8_HomePosition
```

These are loaded by FB_MotionSequence from the active recipe:
```iecst
positions := GVL_Recipes.RecipeLibrary[RecipeID].positions;
```

Different recipes can have different shift distances, lift heights, or center positions - all without code changes.

## The Suction Cup TODO

```iecst
7: // Wait for suction cups to enable
    StepDescription := 'Engaging suction cups';
    ActiveAxesMask := 0;

    // TODO: Add suction cup I/O when available
    // For now, proceed immediately
    subStep := 8;
```

This placeholder exists because the I/O for suction cup control isn't integrated yet. The structure is there - when the hardware is ready, we'll add:

```iecst
7: // Wait for suction cups to enable
    StepDescription := 'Engaging suction cups';
    ActiveAxesMask := 0;

    // Enable suction
    DO_SuctionCupsEnable := TRUE;

    // Wait for vacuum confirmation
    IF DI_VacuumConfirmed THEN
        subStep := 8;
    ELSIF vacuumTimeout THEN
        Error := TRUE;
        ErrorAxisID := 0;  // Not an axis error
        StepDescription := 'Suction cup vacuum not achieved';
    END_IF
```

The clean placeholder makes integration straightforward.

## Why Sequential Moves?

You might wonder: why not move axes 2 and 6 together? The block could lift while shifting.

Several reasons:
1. **Mechanical interference** - Some positions must clear before others can start
2. **Power limits** - Moving fewer axes at once reduces peak current
3. **Safety** - Sequential moves are easier to understand and troubleshoot
4. **Debugging** - You can see exactly which axis is doing what

The performance cost is minor compared to the carving operations. Loading takes seconds; carving takes minutes.

## Lessons Learned

### Bug We Fixed: Wrong Axis in Error Report

Early code had copy-paste errors:
```iecst
IF moverAxis6.Error THEN
    Error := TRUE;
    ErrorAxisID := 2;  // WRONG! Should be 6
END_IF
```

**The fix**: Careful review and testing. Each substep must report its own axis number.

### Pitfall: Forgetting to Clear Execute

If you forget `moverAxis6(Execute := FALSE)` before transitioning, the mover stays in a Done state. When reused later, it might not trigger properly.

**Best practice**: Always clear Execute when transitioning:
```iecst
ELSIF moverAxis6.Done THEN
    moverAxis6(Execute := FALSE);  // ALWAYS do this
    subStep := 3;
END_IF
```

### Why Individual Movers Instead of FB_MultiAxisMover?

This step uses individual FB_AxisMover instances because:
1. Each substep moves only one axis
2. Sequential execution means no need for parallel coordination
3. Simpler code, easier debugging

FB_MultiAxisMover shines when multiple axes must move together. For sequential single-axis moves, individual movers are cleaner.

## Interface Reference

### Inputs
| Name | Type | Description |
|------|------|-------------|
| Enable | BOOL | TRUE to run this step |
| Positions | ST_PositionSetpoints | Position setpoints from recipe |
| MotionParams | ST_MotionParameters | Motion parameters from recipe |

### Outputs
| Name | Type | Description |
|------|------|-------------|
| Done | BOOL | Step completed |
| Busy | BOOL | Step in progress |
| Error | BOOL | Step failed |
| ErrorAxisID | UINT | Which axis caused error |
| CurrentSubStep | UINT | Current substep (0-10) |
| ActiveAxesMask | LWORD | Bitmask of moving axes |
| StepDescription | STRING[80] | Human-readable description |

## The Philosophy

Loading a block isn't glamorous. It doesn't carve beautiful patterns or create impressive geometry. But without it, nothing else happens.

FB_MotionStep_LoadBlock treats this mundane operation with the same care as the carving operations. Clean substeps, proper error handling, clear visualization. Because in manufacturing, the boring parts matter just as much as the exciting ones.

Reliable material handling is the foundation of reliable production.

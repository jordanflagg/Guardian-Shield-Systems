# FB_MotionStep_WindowsDoors: The Opening Carvers

## The Story

Buildings have windows. Buildings have doors. And ICF blocks need precisely cut openings to accommodate them.

Unlike studs (which are repetitive structural patterns), window and door openings vary by design. One block might have a 36" window; another might have a 32" door. The cutting system needs to adapt.

**FB_MotionStep_WindowsDoors controls the hot wire system** that cuts these custom openings - a horizontal positioning axis and a vertical cutting axis working together to trace rectangular cutout patterns.

## What It Does

FB_MotionStep_WindowsDoors executes 6 substeps:

1. **Horizontal position** (Axis 30 → slave 32) - Move to starting X position
2. **Vertical down** (Axis 31 → slave 33) - Descend to cutting depth
3. **Horizontal cut** (Axis 30) - Cut across to ending X position
4. **Vertical up** (Axis 31) - Retract from foam
5. **Return home** (Axes 30, 31 parallel) - Clear the work area
6. **Complete** - Ready for next operation

## The Cutting Geometry

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     WINDOW/DOOR CUTTING GEOMETRY                             │
│                                                                              │
│   Axis 30 (Horizontal)     ◄────────────────────────────────────▶          │
│   with slave 32                                                              │
│                                                                              │
│   Axis 31 (Vertical)                                                        │
│   with slave 33        ▲                                                    │
│                        │                                                    │
│   ┌────────────────────┼────────────────────────────────────────────────┐   │
│   │                    │                                                 │   │
│   │                    │                                                 │   │
│   │    ╔═══════════════╪════════════════════════════╗                  │   │
│   │    ║               │   HOT WIRE CUTTING PATH    ║                  │   │
│   │    ║               │                            ║                  │   │
│   │    ║    1. Start ──┼─▶ Position horizontally    ║                  │   │
│   │    ║               │                            ║                  │   │
│   │    ║    2. ────────┼─▼ Descend vertically       ║                  │   │
│   │    ║               │                            ║                  │   │
│   │    ║    3. ────────┼──────────────▶ Cut across  ║                  │   │
│   │    ║               │                            ║                  │   │
│   │    ║    4. ────────┼─▲ Retract vertically       ║                  │   │
│   │    ║               │                            ║                  │   │
│   │    ╚═══════════════╧════════════════════════════╝                  │   │
│   │                                                                     │   │
│   │                         FOAM BLOCK                                  │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   The hot wire creates a rectangular opening by:                            │
│   - Starting at one side                                                    │
│   - Plunging down to depth                                                  │
│   - Cutting horizontally across                                             │
│   - Retracting up (piece falls away)                                       │
└─────────────────────────────────────────────────────────────────────────────┘
```

## The Gearing Relationship

Unlike studs (which have 8 independent pairs), windows/doors use just 2 master-slave pairs:

```
Master 30 (Horizontal) ──▶ Slave 32
Master 31 (Vertical)   ──▶ Slave 33
```

This creates a **hot wire frame** where:
- Axis 30 moves the left attachment point
- Axis 32 (slaved to 30) moves the right attachment point identically
- Axis 31 moves the top attachment
- Axis 33 (slaved to 31) moves the bottom attachment

The wire stays taut and parallel as the frame moves, creating clean cuts.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       FB_MotionStep_WindowsDoors                             │
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                         BASE HANDLER                                 │   │
│   │   base : FB_MotionStepBase                                          │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                        AXIS MOVERS                                   │   │
│   │                                                                      │   │
│   │   moverAxis30 : FB_AxisMover   ─── Horizontal master (slave 32)    │   │
│   │   moverAxis31 : FB_AxisMover   ─── Vertical master (slave 33)      │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                     STATUS TRACKING                                  │   │
│   │                                                                      │   │
│   │   status30, status31 : ST_MoverStatus                               │   │
│   │   (Used for parallel move in substep 4)                             │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                    SUBSTEP MACHINE                                   │   │
│   │                                                                      │   │
│   │   0: Axis 30 to Position 1    (horizontal positioning)             │   │
│   │   1: Axis 31 to Position 1    (vertical descent - into foam)       │   │
│   │   2: Axis 30 to Position 2    (horizontal cutting)                 │   │
│   │   3: Axis 31 to Position 2    (vertical retract - out of foam)     │   │
│   │   4: Axes 30,31 to Home      (parallel return)                     │   │
│   │   5: COMPLETE                                                       │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

## The Sequential Substeps

Most substeps move one axis at a time:

```iecst
0: // Axis 30 (horizontal) moves to position 1 - slave 32 follows
    StepDescription := 'Window/door - horizontal position';
    ActiveAxesMask := FC_BuildAxisMask(30, 0, 0, 0, 0, 0, 0, 0);

    moverAxis30(
        Execute := TRUE,
        AxisRef := Axis_30,
        Position := Positions.axis30_TargetPosition_1,
        ...
    );

    IF moverAxis30.Error THEN
        Error := TRUE;
        ErrorAxisID := 30;
    ELSIF moverAxis30.Done THEN
        moverAxis30(Execute := FALSE);
        subStep := 1;
    END_IF
```

The single-axis pattern keeps the sequence predictable and debuggable.

## The Parallel Return

Substep 4 moves both axes home simultaneously:

```iecst
4: // Both axes 30,31 return home (parallel move)
    StepDescription := 'Window/door - returning home';
    ActiveAxesMask := FC_BuildAxisMask(30, 31, 0, 0, 0, 0, 0, 0);

    moverAxis30(Execute := TRUE, Position := Positions.axis30_HomePosition, ...);
    moverAxis31(Execute := TRUE, Position := Positions.axis31_HomePosition, ...);

    // Check for errors
    tempErrorAxis := FC_FindFirstErrorAxis(
        status30, status31,
        emptyStatus, emptyStatus, emptyStatus, emptyStatus, emptyStatus, emptyStatus
    );

    IF tempErrorAxis > 0 THEN
        Error := TRUE;
        ErrorAxisID := tempErrorAxis;
    ELSIF moverAxis30.Done AND moverAxis31.Done THEN
        moverAxis30(Execute := FALSE);
        moverAxis31(Execute := FALSE);
        subStep := 5;
    END_IF
```

Returning home can be done in parallel because there's no interference - both axes are moving away from the foam.

## Recipe-Driven Positions

The position parameters define the opening size:

```
Position 1 (30): Starting horizontal position (left edge of window)
Position 2 (30): Ending horizontal position (right edge of window)
Position 1 (31): Cutting depth (how deep to plunge)
Position 2 (31): Retract position (above foam)
Home (30, 31):   Clear positions for next operation
```

A 36" window vs a 24" window is just different Position 1 and Position 2 values in the recipe. No code changes needed.

## Why Sequential Cutting?

The sequence matters:

1. **Position first** - Wire must be at starting edge before plunging
2. **Plunge second** - Wire enters foam at known position
3. **Cut third** - Horizontal cut while wire is in foam
4. **Retract fourth** - Remove wire cleanly

If you tried cutting before plunging, the wire would drag across the foam surface. If you retracted before finishing the cut, you'd have an incomplete opening.

The physics of hot-wire cutting dictates the order.

## Lessons Learned

### Bug We Fixed: Cutting Before Positioning Complete

An early bug had the vertical plunge starting before horizontal positioning was confirmed done. This created diagonal entry cuts instead of clean vertical entries.

**The fix**: Strict substep transitions only on `.Done` confirmation:
```iecst
ELSIF moverAxis30.Done THEN
    moverAxis30(Execute := FALSE);
    subStep := 1;  // Only NOW start vertical
END_IF
```

### Pitfall: Wrong Position Variables

Window/door positions overlap naming with electrical trough positions:
- `axis30_TargetPosition_1` - Window horizontal start
- `axis30_TargetPosition_3` - Electrical horizontal start

Copy-paste errors can use the wrong positions. The recipe structure needs clear naming.

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
| ErrorAxisID | UINT | Which axis caused error (30 or 31) |
| CurrentSubStep | UINT | Current substep (0-5) |
| ActiveAxesMask | LWORD | Bitmask of moving axes |
| StepDescription | STRING[80] | Human-readable description |

## The Philosophy

Windows and doors are about creating spaces - openings that let light in, that let people pass through. FB_MotionStep_WindowsDoors is literally about cutting holes, but those holes transform a solid block into something that can become part of a building.

The 2-axis hot wire system is elegant in its simplicity: one axis positions, one axis cuts. The complexity is in the recipe data (what size opening?) not the motion logic (how to cut?).

Simple mechanisms, flexible configuration. That's good machine design.

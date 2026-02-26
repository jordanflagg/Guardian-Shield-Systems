# FB_MotionStep_Electrical: The Hidden Pathways

## The Story

Modern buildings are full of wires. Power, data, control - they all need somewhere to run. In ICF construction, that means routing channels through the foam before the concrete is poured.

**FB_MotionStep_Electrical cuts troughs** - U-shaped channels that will later hold electrical conduit. It's a different motion pattern from windows/doors: position horizontally, plunge vertically with two cutting elements, then drag horizontally to create the trough.

## What It Does

FB_MotionStep_Electrical executes 6 substeps:

1. **Position** (Axis 30) - Move to trough starting position
2. **Extend** (Axes 35, 36 parallel) - Lower cutting elements into foam
3. **Cut** (Axis 30) - Drag horizontally to create trough
4. **Retract** (Axes 35, 36 parallel) - Lift cutting elements
5. **Return home** (Axes 30, 35, 36 parallel) - Clear the work area
6. **Complete** - Ready for next operation

## Key Difference: No Gearing on 35/36

Unlike most axis pairs in this machine, axes 35 and 36 operate **independently**:

```
Window/Door:  30 → 32 (geared), 31 → 33 (geared)
Electrical:   30 → 32 (geared), 35 (independent), 36 (independent)
```

Why? Because electrical troughs need independent control of each cutting element. They might cut at different depths, or one might be disabled while the other operates.

This makes FB_MotionStep_Electrical slightly different - it directly controls axes 35 and 36 rather than relying on gearing.

## The Cutting Geometry

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    ELECTRICAL TROUGH CUTTING GEOMETRY                        │
│                                                                              │
│   Axis 30 (Horizontal positioning) ◄──────────────────────────▶            │
│                                                                              │
│   Axes 35, 36 (Independent vertical cutting elements)                       │
│        ▼  ▼                                                                 │
│   ┌────────────────────────────────────────────────────────────────────┐    │
│   │                                                                     │    │
│   │      35↓  36↓                                                      │    │
│   │       │    │                                                        │    │
│   │       │    │    ═══════════════════════════════════════            │    │
│   │       │    │    │                                     │            │    │
│   │       ▼    ▼    │   TROUGH BEING CUT                  │            │    │
│   │       ╔════╗    ◄───────────────────────────────────▶             │    │
│   │       ║    ║         Axis 30 drags through foam                    │    │
│   │       ║    ║                                                        │    │
│   │       ╚════╝                                                        │    │
│   │                                                                     │    │
│   │                          FOAM BLOCK                                 │    │
│   └────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│   CUTTING SEQUENCE:                                                         │
│   1. Axis 30 positions to trough start                                     │
│   2. Axes 35, 36 plunge into foam (parallel)                              │
│   3. Axis 30 drags horizontally, creating trough                          │
│   4. Axes 35, 36 retract (parallel)                                       │
│   5. All axes return home                                                  │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       FB_MotionStep_Electrical                               │
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                        AXIS MOVERS                                   │   │
│   │                                                                      │   │
│   │   moverAxis30 : FB_AxisMover   ─── Horizontal positioning           │   │
│   │   moverAxis35 : FB_AxisMover   ─── Cutting element 1 (independent)  │   │
│   │   moverAxis36 : FB_AxisMover   ─── Cutting element 2 (independent)  │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                     STATUS TRACKING                                  │   │
│   │                                                                      │   │
│   │   status30, status35, status36 : ST_MoverStatus                     │   │
│   │   (Used for parallel moves in substeps 1, 3, 4)                     │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                    SUBSTEP MACHINE                                   │   │
│   │                                                                      │   │
│   │   0: Axis 30 to Position 3    (trough start position)              │   │
│   │   1: Axes 35,36 to Position 1 (plunge into foam - parallel)        │   │
│   │   2: Axis 30 to Position 4    (drag through foam - cutting)        │   │
│   │   3: Axes 35,36 to Position 2 (retract from foam - parallel)       │   │
│   │   4: Axes 30,35,36 to Home   (all return - parallel)               │   │
│   │   5: COMPLETE                                                       │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

## The Parallel Plunge

Substep 1 moves both cutting elements together:

```iecst
1: // Axes 35,36 extend into foam to depth (parallel move)
    StepDescription := 'Electrical - extending into foam';
    ActiveAxesMask := FC_BuildAxisMask(35, 36, 0, 0, 0, 0, 0, 0);

    moverAxis35(
        Execute := TRUE,
        AxisRef := Axis_35,
        Position := Positions.axis35_TargetPosition_1,
        ...
    );

    moverAxis36(
        Execute := TRUE,
        AxisRef := Axis_36,
        Position := Positions.axis36_TargetPosition_1,
        ...
    );

    tempErrorAxis := FC_FindFirstErrorAxis(
        status35, status36,
        emptyStatus, emptyStatus, emptyStatus, emptyStatus, emptyStatus, emptyStatus
    );

    IF tempErrorAxis > 0 THEN
        Error := TRUE;
        ErrorAxisID := tempErrorAxis;
    ELSIF moverAxis35.Done AND moverAxis36.Done THEN
        moverAxis35(Execute := FALSE);
        moverAxis36(Execute := FALSE);
        subStep := 2;
    END_IF
```

Both elements plunge simultaneously for efficiency and uniform trough depth.

## Position Numbering Convention

Axis 30 uses different position targets for different operations:

| Position | Window/Door Use | Electrical Use |
|----------|-----------------|----------------|
| Position 1 | Horizontal start | (not used) |
| Position 2 | Horizontal end | (not used) |
| Position 3 | (not used) | Trough start |
| Position 4 | (not used) | Trough end |
| Home | Clear position | Clear position |

This allows the recipe to configure both window/door and electrical cutting for the same axis without conflict.

## The Three-Axis Return

Substep 4 returns all three axes home:

```iecst
4: // All axes 30,35,36 return home (parallel move)
    StepDescription := 'Electrical - returning home';
    ActiveAxesMask := FC_BuildAxisMask(30, 35, 36, 0, 0, 0, 0, 0);

    moverAxis30(Execute := TRUE, Position := Positions.axis30_HomePosition, ...);
    moverAxis35(Execute := TRUE, Position := Positions.axis35_HomePosition, ...);
    moverAxis36(Execute := TRUE, Position := Positions.axis36_HomePosition, ...);

    tempErrorAxis := FC_FindFirstErrorAxis(
        status30, status35, status36,
        emptyStatus, emptyStatus, emptyStatus, emptyStatus, emptyStatus
    );

    IF tempErrorAxis > 0 THEN
        Error := TRUE;
        ErrorAxisID := tempErrorAxis;
    ELSIF moverAxis30.Done AND moverAxis35.Done AND moverAxis36.Done THEN
        // All done
        subStep := 5;
    END_IF
```

## Why Independent Cutting Elements?

Geared systems are great when you need identical motion. But electrical troughs have variations:

- **Different depths**: One conduit run might be deeper than another
- **Single-element cuts**: Sometimes you only need one trough line
- **Maintenance**: Replace/calibrate one element without affecting the other

Independent control of 35 and 36 provides flexibility that gearing would prevent.

## Lessons Learned

### Bug We Fixed: Position Variable Naming

Early code mixed up position variables:
```iecst
// WRONG - using window/door positions
Position := Positions.axis30_TargetPosition_1  // Should be Position_3!
```

Window/door uses Position 1/2; electrical uses Position 3/4. The fix was clearer variable naming in the recipe structure and careful code review.

### Pitfall: Forgetting to Wait for All Three

In substep 4, all three axes must complete:
```iecst
// MUST check all three
ELSIF moverAxis30.Done AND moverAxis35.Done AND moverAxis36.Done THEN
```

Missing one would cause premature transition while an axis was still moving.

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
| ErrorAxisID | UINT | Which axis caused error (30, 35, or 36) |
| CurrentSubStep | UINT | Current substep (0-5) |
| ActiveAxesMask | LWORD | Bitmask of moving axes |
| StepDescription | STRING[80] | Human-readable description |

## The Philosophy

Electrical troughs aren't glamorous. They're hidden inside walls, buried in concrete, invisible to anyone who lives in the building. But without them, there's no power, no light, no modern life.

FB_MotionStep_Electrical creates those hidden pathways. It's infrastructure for infrastructure - motion control creating channels that will carry electrical infrastructure.

The fact that axes 35 and 36 are independent (not geared) reflects real-world flexibility needs. Good engineering isn't just about technical elegance; it's about matching the solution to actual requirements.

# FB_MotionStep_Studs: The Structural Carvers

## The Story

Inside every insulated concrete form (ICF) block are studs - the structural elements that give the foam its strength. These aren't just cuts; they're precision cavities that must align perfectly with standard construction practices.

**FB_MotionStep_Studs carves 8 stud channels simultaneously** - 4 vertical pairs and 4 horizontal pairs, working in coordinated phases to cut the characteristic stud pattern into the foam.

This is where the machine earns its keep. 16 axes moving in concert, hot wires slicing through foam with millimeter precision.

## What It Does

FB_MotionStep_Studs executes 6 substeps:

1. **Vertical position** (Axes 14,18,22,26) - Position vertical cutting elements
2. **Horizontal extend** (Axes 15,19,23,27) - Extend horizontal elements into foam
3. **Vertical cut** (Axes 14,18,22,26) - Cut vertically through foam
4. **Horizontal retract** (Axes 15,19,23,27) - Pull horizontal elements out
5. **All home** (All 8 masters) - Return everything to start position
6. **Complete** - Ready for next operation

## The Axis Organization

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      STUD CARVING AXIS LAYOUT                                │
│                                                                              │
│   Each "stud unit" has a VERTICAL axis and a HORIZONTAL axis               │
│   Plus corresponding SLAVE axes for synchronized cutting                    │
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                                                                      │   │
│   │     Unit 1              Unit 2              Unit 3              Unit 4│   │
│   │   ┌───────┐           ┌───────┐           ┌───────┐           ┌────┐│   │
│   │   │14 (V) │           │18 (V) │           │22 (V) │           │26(V)││   │
│   │   │   │   │           │   │   │           │   │   │           │  │  ││   │
│   │   │   ▼   │           │   ▼   │           │   ▼   │           │  ▼  ││   │
│   │   │  16   │           │  20   │           │  24   │           │ 28  ││   │
│   │   │(slave)│           │(slave)│           │(slave)│           │(slv)││   │
│   │   └───────┘           └───────┘           └───────┘           └────┘│   │
│   │                                                                      │   │
│   │   ◄──15(H)──▶       ◄──19(H)──▶       ◄──23(H)──▶       ◄──27(H)│   │
│   │      │                  │                  │                  │      │   │
│   │      ▼                  ▼                  ▼                  ▼      │   │
│   │     17                 21                 25                 29      │   │
│   │   (slave)            (slave)            (slave)            (slave)   │   │
│   │                                                                      │   │
│   │   ════════════════════════════════════════════════════════════════  │   │
│   │                           FOAM BLOCK                                 │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   MASTER AXES (controlled directly):                                        │
│   Vertical:   14, 18, 22, 26                                               │
│   Horizontal: 15, 19, 23, 27                                               │
│                                                                              │
│   SLAVE AXES (follow via gearing):                                         │
│   Vertical:   16, 20, 24, 28                                               │
│   Horizontal: 17, 21, 25, 29                                               │
└─────────────────────────────────────────────────────────────────────────────┘
```

## The Cutting Sequence

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CUTTING SEQUENCE                                     │
│                                                                              │
│   SubStep 0: VERTICAL POSITION                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │   Axes 14,18,22,26 move to Position 1                               │   │
│   │                                                                      │   │
│   │   ▼  ▼  ▼  ▼   ← Vertical axes descend to cutting start position   │   │
│   │   ══════════════════════════════════════════════════════════════   │   │
│   │                           FOAM                                       │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   SubStep 1: HORIZONTAL EXTEND                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │   Axes 15,19,23,27 move to Position 1                               │   │
│   │                                                                      │   │
│   │   │  │  │  │                                                        │   │
│   │   ◄──┼──┼──┼──▶  ← Horizontal axes extend, penetrating foam        │   │
│   │   ══════════════════════════════════════════════════════════════   │   │
│   │                           FOAM                                       │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   SubStep 2: VERTICAL CUT                                                   │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │   Axes 14,18,22,26 move to Position 2                               │   │
│   │                                                                      │   │
│   │   │  │  │  │                                                        │   │
│   │   │  │  │  │                                                        │   │
│   │   ▼  ▼  ▼  ▼   ← Vertical axes cut through foam                    │   │
│   │   ══════════════════════════════════════════════════════════════   │   │
│   │       ╔══╗  ╔══╗  ╔══╗  ╔══╗  ← Stud cavities forming             │   │
│   │       ║  ║  ║  ║  ║  ║  ║  ║                                       │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   SubStep 3: HORIZONTAL RETRACT                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │   Axes 15,19,23,27 move to Position 2 (retracted)                   │   │
│   │                                                                      │   │
│   │   ▶──┼──┼──┼──◄  ← Horizontal axes retract from foam               │   │
│   │       ╔══╗  ╔══╗  ╔══╗  ╔══╗                                       │   │
│   │       ║  ║  ║  ║  ║  ║  ║  ║                                       │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   SubStep 4: ALL HOME                                                       │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │   All 8 masters return to home position in parallel                 │   │
│   │                                                                      │   │
│   │   ▲  ▲  ▲  ▲   ← All axes clear foam                               │   │
│   │       ╔══╗  ╔══╗  ╔══╗  ╔══╗  ← Finished stud cavities             │   │
│   │       ║  ║  ║  ║  ║  ║  ║  ║                                       │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

## The Status Array Pattern

With 8 axes moving in parallel, we need to track their status efficiently:

```iecst
VAR
    // Status structures for utility functions
    verticalStatus : ARRAY[1..4] OF ST_MoverStatus;
    horizontalStatus : ARRAY[1..4] OF ST_MoverStatus;
    allStatus : ARRAY[1..8] OF ST_MoverStatus;
END_VAR

// Build status arrays each scan
verticalStatus[1].Done := moverAxis14.Done;
verticalStatus[1].Error := moverAxis14.Error;
verticalStatus[1].AxisID := 14;

verticalStatus[2].Done := moverAxis18.Done;
verticalStatus[2].Error := moverAxis18.Error;
verticalStatus[2].AxisID := 18;
// ... etc
```

This pattern enables utility functions:

```iecst
// Check for any error
tempErrorAxis := FC_FindFirstErrorAxis(
    verticalStatus[1], verticalStatus[2],
    verticalStatus[3], verticalStatus[4],
    emptyStatus, emptyStatus, emptyStatus, emptyStatus
);

IF tempErrorAxis > 0 THEN
    Error := TRUE;
    ErrorAxisID := tempErrorAxis;

// Check for all complete
ELSIF FC_CheckMoversComplete(
    verticalStatus[1], verticalStatus[2],
    verticalStatus[3], verticalStatus[4],
    emptyStatus, emptyStatus, emptyStatus, emptyStatus
) THEN
    // All done - advance
    moverAxis14(Execute := FALSE);
    moverAxis18(Execute := FALSE);
    moverAxis22(Execute := FALSE);
    moverAxis26(Execute := FALSE);
    subStep := 1;
END_IF
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          FB_MotionStep_Studs                                 │
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                     VERTICAL MOVERS                                  │   │
│   │                                                                      │   │
│   │   moverAxis14 : FB_AxisMover   ─── Vertical 1 (master, slave 16)   │   │
│   │   moverAxis18 : FB_AxisMover   ─── Vertical 2 (master, slave 20)   │   │
│   │   moverAxis22 : FB_AxisMover   ─── Vertical 3 (master, slave 24)   │   │
│   │   moverAxis26 : FB_AxisMover   ─── Vertical 4 (master, slave 28)   │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                    HORIZONTAL MOVERS                                 │   │
│   │                                                                      │   │
│   │   moverAxis15 : FB_AxisMover   ─── Horizontal 1 (master, slave 17) │   │
│   │   moverAxis19 : FB_AxisMover   ─── Horizontal 2 (master, slave 21) │   │
│   │   moverAxis23 : FB_AxisMover   ─── Horizontal 3 (master, slave 25) │   │
│   │   moverAxis27 : FB_AxisMover   ─── Horizontal 4 (master, slave 29) │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                   STATUS AGGREGATION                                 │   │
│   │                                                                      │   │
│   │   verticalStatus[4] : ST_MoverStatus                                │   │
│   │   horizontalStatus[4] : ST_MoverStatus                              │   │
│   │   allStatus[8] : ST_MoverStatus  (for substep 4 - all home)        │   │
│   │                                                                      │   │
│   │   FC_FindFirstErrorAxis() ─── Find which axis errored              │   │
│   │   FC_CheckMoversComplete() ─── Check if all are done               │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                    SUBSTEP MACHINE                                   │   │
│   │                                                                      │   │
│   │   0: Vertical to Position 1    (4 axes parallel)                   │   │
│   │   1: Horizontal to Position 1  (4 axes parallel)                   │   │
│   │   2: Vertical to Position 2    (4 axes parallel - cutting)         │   │
│   │   3: Horizontal to Position 2  (4 axes parallel - retracting)      │   │
│   │   4: All to Home              (8 axes parallel)                    │   │
│   │   5: COMPLETE                                                       │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Parallel Execution Within Substeps

Substep 4 demonstrates full 8-axis parallel motion:

```iecst
4: // All stud axes return home (8 axes in parallel)
    StepDescription := 'Stud axes - returning home';
    ActiveAxesMask := FC_BuildAxisMask(14, 15, 18, 19, 22, 23, 26, 27);

    // Vertical axes home
    moverAxis14(Execute := TRUE, Position := Positions.axis14_HomePosition, ...);
    moverAxis18(Execute := TRUE, Position := Positions.axis18_HomePosition, ...);
    moverAxis22(Execute := TRUE, Position := Positions.axis22_HomePosition, ...);
    moverAxis26(Execute := TRUE, Position := Positions.axis26_HomePosition, ...);

    // Horizontal axes home
    moverAxis15(Execute := TRUE, Position := Positions.axis15_HomePosition, ...);
    moverAxis19(Execute := TRUE, Position := Positions.axis19_HomePosition, ...);
    moverAxis23(Execute := TRUE, Position := Positions.axis23_HomePosition, ...);
    moverAxis27(Execute := TRUE, Position := Positions.axis27_HomePosition, ...);

    // Build combined status for all 8 movers
    allStatus[1] := verticalStatus[1];   allStatus[2] := horizontalStatus[1];
    allStatus[3] := verticalStatus[2];   allStatus[4] := horizontalStatus[2];
    allStatus[5] := verticalStatus[3];   allStatus[6] := horizontalStatus[3];
    allStatus[7] := verticalStatus[4];   allStatus[8] := horizontalStatus[4];

    tempErrorAxis := FC_FindFirstErrorAxis(
        allStatus[1], allStatus[2], allStatus[3], allStatus[4],
        allStatus[5], allStatus[6], allStatus[7], allStatus[8]
    );

    IF tempErrorAxis > 0 THEN
        Error := TRUE;
        ErrorAxisID := tempErrorAxis;
    ELSIF FC_CheckMoversComplete(...) THEN
        // Clear all movers and advance
        subStep := 5;
    END_IF
```

All 8 masters start simultaneously, and we wait for the slowest one to complete.

## Why Not Use FB_MultiAxisMover?

Good question! FB_MultiAxisMover can handle up to 8 axes, which matches our needs. We chose individual movers because:

1. **Different positions per axis** - Each axis has its own Position1, Position2, and Home
2. **Status visibility** - We want to know exactly which axis failed
3. **Flexibility** - Future changes might require different timing per axis
4. **Debugging** - Individual movers are easier to observe in online mode

FB_MultiAxisMover works great when all axes go to the same position (like homing to zero). For different target positions, individual movers with status aggregation is cleaner.

## Lessons Learned

### Bug We Fixed: emptyStatus Initialization

The utility functions take 8 status parameters. When using fewer axes, we pass `emptyStatus`:

```iecst
emptyStatus : ST_MoverStatus := (Done := FALSE, Error := FALSE, AxisID := 0);
```

Early versions didn't initialize `Done := FALSE`, causing false completions.

**Key insight**: Uninitialized structures have undefined values. Always initialize.

### Pitfall: Status Array Not Updated

The status arrays must be updated **every scan before checking**:

```iecst
// MUST update status before checking
verticalStatus[1].Done := moverAxis14.Done;
verticalStatus[1].Error := moverAxis14.Error;
// ... etc ...

// NOW check
IF FC_CheckMoversComplete(...) THEN
```

If you check first, you're using stale data from the previous scan.

### Why Phased Cutting?

The sequence (position → extend → cut → retract → home) prevents collisions:
- **Position first** - Gets vertical elements in place before extending
- **Extend second** - Horizontal elements penetrate at known vertical position
- **Cut third** - Vertical elements cut while horizontals are in position
- **Retract fourth** - Clear horizontals before moving verticals
- **Home last** - All elements clear the work area

Different orders would risk hot wires hitting each other or the foam incorrectly.

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
| CurrentSubStep | UINT | Current substep (0-5) |
| ActiveAxesMask | LWORD | Bitmask of moving axes |
| StepDescription | STRING[80] | Human-readable description |

## The Philosophy

Stud carving is the heart of this machine's value proposition. It takes a plain foam block and transforms it into structural building material.

FB_MotionStep_Studs orchestrates 16 axes (8 masters, 8 slaves) through a precise cutting sequence. The complexity is hidden behind a simple interface: Enable goes TRUE, Done goes TRUE when finished.

That's the art of abstraction - making the complex feel simple while preserving all the precision that matters.

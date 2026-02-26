# FB_MotionStep_Unload: The Delivery

## The Story

Every manufacturing cycle must end with a delivery - the finished product leaving the work area so the next one can begin.

For this machine, that means taking a carved foam block (now featuring studs, window openings, and electrical troughs) and moving it from the processing center to the unload table where a forklift can pick it up.

**FB_MotionStep_Unload is the bookend to FB_MotionStep_LoadBlock.** Where LoadBlock brings raw material in, Unload sends finished product out.

## What It Does

FB_MotionStep_Unload executes 5 substeps:

1. **Raise table** (Axis 10 → slaves 11,12,13) - Lift block off suction cups
2. **Shift block** (Axis 8 → slave 9) - Push to unload area
3. **Lower table** (Axis 10) - Set block down on unload surface
4. **Return pusher** (Axis 8) - Clear for next cycle
5. **Complete** - Ready for next block

## The Physical Sequence

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       UNLOAD - PHYSICAL SEQUENCE                             │
│                                                                              │
│   STEP 0: RAISE TABLE (release from suction)                                │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                                                                      │   │
│   │                     Suction cups release                            │   │
│   │                          ○ ○ ○                                      │   │
│   │                                                                      │   │
│   │        ▲               ┌──────────────────────────┐                 │   │
│   │ Axis 10│               │░░░░ FINISHED BLOCK ░░░░░│                 │   │
│   │  raises│               │░░░░ (with studs,   ░░░░░│                 │   │
│   │        │               │░░░░ windows, etc)  ░░░░░│                 │   │
│   │                        └──────────────────────────┘                 │   │
│   │   ═══════════════════════════════════════════════════               │   │
│   │              Unload table rises to receive block                    │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   STEP 1: SHIFT BLOCK                                                       │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                                                                      │   │
│   │                                                                      │   │
│   │                                    ┌──────────────────────────┐     │   │
│   │        Axis 8 pushes ──────────▶  │░░░░ FINISHED BLOCK ░░░░░│     │   │
│   │        (slave 9 follows)           │░░░░░░░░░░░░░░░░░░░░░░░░│     │   │
│   │                                    └──────────────────────────┘     │   │
│   │                                                                      │   │
│   │   ═══════════════════════════════════════════════════════════════   │   │
│   │                    Block shifts to unload position                  │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   STEPS 2-4: LOWER AND CLEAR                                                │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                                                                      │   │
│   │                                    ┌──────────────────────────┐     │   │
│   │        Axis 8 returns ◀──────────  │░░░░ FINISHED BLOCK ░░░░░│     │   │
│   │                                    │░░░░░░░░░░░░░░░░░░░░░░░░│     │   │
│   │                        ▼           └──────────────────────────┘     │   │
│   │                 Axis 10 lowers                                      │   │
│   │                                                                      │   │
│   │   ═══════════════════════════════════════════════════════════════   │   │
│   │        Block now resting on unload table                            │   │
│   │        Ready for forklift removal                                    │   │
│   │        Machine ready for next cycle                                 │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          FB_MotionStep_Unload                                │
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                         BASE HANDLER                                 │   │
│   │   base : FB_MotionStepBase                                          │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                        AXIS MOVERS                                   │   │
│   │                                                                      │   │
│   │   moverAxis8  : FB_AxisMover   ─── Pusher (master, slave 9)        │   │
│   │   moverAxis10 : FB_AxisMover   ─── Table lift (master, slaves 11-13)│   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                    SUBSTEP MACHINE                                   │   │
│   │                                                                      │   │
│   │   0: Axis 10 raise    (lift block off suction)                     │   │
│   │   1: Axis 8 shift     (push to unload area)                        │   │
│   │   2: Axis 10 lower    (set down on unload table)                   │   │
│   │   3: Axis 8 return    (clear pusher for next cycle)                │   │
│   │   4: COMPLETE                                                       │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

## The Symmetry with LoadBlock

Notice how Unload mirrors LoadBlock:

| LoadBlock | Unload |
|-----------|--------|
| Axis 1 shifts | (not used) |
| Axis 2 raises | Axis 10 raises |
| Axis 6 shifts | Axis 8 shifts |
| Axis 2 lowers | Axis 10 lowers |
| Axis 6 returns | Axis 8 returns |
| Axis 10 raises | (already raised) |
| Axis 8 centers | (already positioned) |
| Axis 8 returns | (combined with above) |
| Axis 10 lowers | (already lowered) |

The processing area is in the middle; load table on one side, unload table on the other. The motion patterns are conceptually similar but use different axes.

## The Suction Release TODO

Like LoadBlock, there's a placeholder for suction cup control:

```iecst
0: // Axis 10 raises to pick up block - slaves 11,12,13 follow
    StepDescription := 'Unload - raising table';
    ActiveAxesMask := FC_BuildAxisMask(10, 0, 0, 0, 0, 0, 0, 0);

    // TODO: Disable suction cups first when I/O is available
    // suctionCupsEnable := FALSE;

    moverAxis10(Execute := TRUE, Position := Positions.axis10_RaisePosition, ...);
```

When I/O is integrated, we'll:
1. Disable suction cups
2. Wait for vacuum to release
3. Then raise the table

Without proper sequencing, the block might stick to the suction cups while the table tries to lift it.

## Why Only 2 Axes?

Unload uses just axes 8 and 10, compared to LoadBlock's 5 axes. Why?

The processing center is already clear from the carving operations. There's no need to:
- Shift against a wall (block is already positioned)
- Use center shift mechanism (not in the path)
- Coordinate multiple lift tables (block is on unload side)

Simpler is better. Use only the axes you need.

## Recipe Position Reuse

The unload step reuses some positions from the load sequence:

```iecst
Position := Positions.axis10_RaisePosition   // Same as LoadBlock substep 5
Position := Positions.axis8_UnloadPosition   // Unique to unload
Position := Positions.axis10_LowerPosition   // Same as LoadBlock substep 9
Position := Positions.axis8_HomePosition     // Same as LoadBlock substep 8
```

The recipe structure allows position sharing where appropriate while keeping unique positions for unique operations.

## Lessons Learned

### Bug We Fixed: Sequence Completion Flag

Early code set `Done := TRUE` but forgot to set `Busy := FALSE`:

```iecst
// WRONG - Busy still TRUE!
4: // Complete
    Done := TRUE;
    // Busy := FALSE;  ← MISSING!
```

**The fix**: Always update both flags together:
```iecst
4: // Complete
    StepDescription := 'Cycle complete - ready for removal';
    ActiveAxesMask := 0;
    Done := TRUE;
    Busy := FALSE;  // Don't forget this!
```

### Pitfall: Early Pusher Return

If the pusher returns (substep 3) before the table fully lowers (substep 2), the block might shift during lowering. The sequence must be:
1. Lower table (block settles)
2. Then return pusher

Our substep ordering enforces this.

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
| ErrorAxisID | UINT | Which axis caused error (8 or 10) |
| CurrentSubStep | UINT | Current substep (0-4) |
| ActiveAxesMask | LWORD | Bitmask of moving axes |
| StepDescription | STRING[80] | Human-readable description |

## The Philosophy

Unload is the machine saying "I'm done. Here's your product."

It's the simplest of the motion steps - just 5 substeps, 2 axes. But it's also the most important moment for the customer: the finished product, ready for use.

FB_MotionStep_Unload handles this handoff with the same care as the complex carving operations. Clean motion, proper sequencing, clear status. Because every step matters, including the last one.

The cycle ends here. The next cycle begins with LoadBlock. And the rhythm continues.

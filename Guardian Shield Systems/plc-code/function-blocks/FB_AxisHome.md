# FB_AxisHome: Finding Home

## The Story

"Homing" means different things to different machines.

For traditional CNC with incremental encoders, homing is a ritual: creep toward a limit switch, touch it, back off, creep again until the index pulse aligns, finally declare "I know where I am."

For this machine? **Homing is just going to zero.** Every axis has an absolute encoder, so it knows exactly where it is the moment drives power up. No search, no ritual. "Homing" becomes "return to position 0."

But there's a twist that shapes this entire FB: **some axes can't just be told to move.**

## Two kinds of axis, two ways home

```
NON-KINEMATIC masters (6):   1, 2, 6, 8, 10, 34
    → free to command with MC_MoveAbsolute at any time → drive them to 0 directly.

KINEMATIC masters (12):      14,15,18,19,22,23,26,27  (Wire1-4 kin)
                             30,31,35,36              (Wire5_6 kin)
    → live inside ALWAYS-ENABLED wire kinematic groups. MC_MoveAbsolute on these
      FAULTS while the kin is enabled. They are homed by dispatching Wire*_home.npg
      G-code scripts through trigger_dispatch.py (the home move is the last line of
      each cutting script too).
```

This split is the single most important thing to understand here: the gantry slaves follow their masters automatically (so we never address them), but the *kinematic* masters need the Python/G-code path, not a PLC move.

## What It Does

- **Home Single (non-kin)** — `MC_MoveAbsolute` the selected axis to 0
- **Home Single (kin)** — raise `GVL_GCode.bHomeRequest`; this homes **all** kin axes (you can't
  home one axis inside an enabled kin without disabling the group)
- **Home All** — 6 non-kin masters to 0 in parallel (one `FB_MultiAxisMover`), then the kin axes
  via `bHomeRequest`
- **Always-live homed status** — reads all 18 master positions every scan for the HMI
- **Abort/halt** — `MC_Halt` the non-kin masters on abort; kin axes are halted by
  `ML_KinInterrupt2` from `FB_KinematicEnable`

## The "always reading" pattern

Position reading runs every scan regardless of `Enable`, because the HMI always wants to know
which axes are at home — before a cycle, during diagnostics, after an E-stop:

```iecst
FOR i := 1 TO GVL_Axes.MASTER_AXIS_COUNT DO          // 18 masters (slaves follow via gantry)
    fbReadPos[i](Enable := TRUE, Axis := AXIF_CONFIG_INDEXES[GVL_Axes.MASTER_AXES[i]]);
    IF fbReadPos[i].Valid THEN
        AxisIsHomed[GVL_Axes.MASTER_AXES[i]] := ABS(fbReadPos[i].Position) <= PositionTolerance;
    END_IF
END_FOR
```

> Note: it reads the **18 masters**, not all 36. Slave positions are never addressed directly —
> they mirror their masters through the Bosch ctrlX gantry config. Position reading works even
> while a kin is enabled, which is why kin-axis homed status stays accurate.

## The state machine

```
┌──────────────────────────────────────────────────────────────────────┐
│ State 0  IDLE                                                         │
│   ├─ HomeSingle↑, non-kin axis ─▶ State 1                            │
│   ├─ HomeSingle↑, kin axis     ─▶ State 20                           │
│   └─ HomeAll↑                  ─▶ State 10                           │
│                                                                      │
│ SINGLE NON-KIN (1-2)                                                 │
│   1: MC_MoveAbsolute selected axis → 0;  err → 99                    │
│   2: wait for HomeSingle to clear → 0                               │
│                                                                      │
│ HOME ALL (10-14)                                                     │
│   10: fbMoveNonKin → 6 non-kin masters to 0 in parallel; err → 99   │
│   11: bHomeDone:=F; bHomeRequest:=TRUE  (ask Python to home kins)   │
│   12: wait GVL_GCode.bHomeDone, then clear both flags               │
│   13: Done                                                          │
│   14: wait for HomeAll to clear → 0                                 │
│                                                                      │
│ SINGLE KIN (20-22)                                                  │
│   20: bHomeRequest:=TRUE  (homes ALL kin axes via scripts)          │
│   21: wait bHomeDone → Done                                         │
│   22: wait for HomeSingle to clear → 0                              │
│                                                                      │
│ ERROR (99): stop movers + clear bHomeRequest; wait for cmds clear   │
└──────────────────────────────────────────────────────────────────────┘
```

> The old "three groups of 8 / 8 / 2" batch strategy is gone. Home-All now moves the **6**
> non-kin masters in a single `FB_MultiAxisMover` call, and hands every kinematic axis to the
> Python home-script dispatcher in one `bHomeRequest`.

## Error axis mapping

`FB_MultiAxisMover` reports which of its 8 *slots* failed (`ErrorAxisNum` = 1–8). We map that back
to the real axis number through the `NON_KIN_MASTER_AXES` array so the operator sees "Axis 10",
not "slot 5":

```iecst
ELSIF fbMoveNonKin.Error THEN
    ErrorAxisID := GVL_Axes.NON_KIN_MASTER_AXES[fbMoveNonKin.ErrorAxisNum];
    FC_ReportFault('FB_AxisHome', ErrorAxisID, fbMoveNonKin.ErrorID,
                   'Home all: non-kin group move failed', E_MotionStep.WAIT_FOR_LOAD, 0);
    state := 99;
END_IF
```

Faults are reported straight to `GVL_Faults` via `FC_ReportFault` (same as the motion steps); the
`Error`/`ErrorAxisID` outputs are still provided for the HMI homing card.

## The mover flush (phantom-fault prevention)

Like every mover owner, FB_AxisHome drives its movers to `Execute := FALSE` when disabled, on
abort, and in the error state — so a mover latched in ERROR can never re-fire a stale fault on the
next home. (See `FB_AxisMover.md → The Phantom Fault`.)

```iecst
IF NOT Enable AND NOT haltActive THEN
    fbMoveSingle(Execute := FALSE, AxisRef := selectedAxisRef);
    fbMoveNonKin(Execute := FALSE);
    GVL_GCode.bHomeRequest := FALSE;
    state := 0; Busy := FALSE; Done := FALSE; Error := FALSE;
END_IF
```

## Position Tolerance: "close enough"

```iecst
AxisIsHomed[n] := ABS(currentPos) <= PositionTolerance;   // default 0.5 mm
```

0.5 mm, not exact zero, because servos don't hold a position perfectly, encoders quantize, and
positions drift with temperature. Tight enough for correct cycle start, loose enough to avoid
false "not homed" readings. It's a VAR_INPUT, so the HMI can tune it.

## Interface Reference

### Inputs
| Name | Type | Default | Description |
|------|------|---------|-------------|
| Enable | BOOL | — | Enable homing mode |
| HomeAxis | UINT | — | Axis to home (1–36, must be a master) |
| HomeSingle | BOOL | — | Rising edge: home the selected axis |
| HomeAll | BOOL | — | Rising edge: home all master axes |
| Velocity / Acceleration / Deceleration / Jerk | LREAL | 10/5/5/10 | Non-kin move profile |
| PositionTolerance | LREAL | 0.5 | "At home" tolerance (mm) |
| Abort | BOOL | — | Halt in-progress non-kin moves immediately |

### Outputs
| Name | Type | Description |
|------|------|-------------|
| Busy / Done / Error | BOOL | Operation status |
| ErrorAxisID | UINT | Axis that caused the error |
| AllAxesHomed | BOOL | TRUE when all master axes are at 0 |
| AxisIsHomed | ARRAY[1..36] OF BOOL | Per-axis homed status (masters; slaves default TRUE) |
| InvalidAxis | BOOL | Selected axis is not a master |
| Aborted | BOOL | TRUE after a clean abort/halt completes |

## The Philosophy

Homing touches something fundamental: the machine's sense of where it is. Absolute encoders erase
the anxiety of "lost after power loss" — the machine always knows its position, so homing becomes
"go home," not "find home." FB_AxisHome reflects that confidence, while quietly handling the one
real complication: the kinematic axes that must be sent home through G-code rather than a direct
PLC move.

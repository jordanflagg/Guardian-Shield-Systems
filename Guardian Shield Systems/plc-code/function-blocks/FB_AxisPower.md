# FB_AxisPower: The Master Switch

## The Story

Imagine you're responsible for turning power on and off to an entire city — not one house at a time, the whole city at once. And if there's a problem anywhere, you need to know exactly which block has the issue.

Now multiply the stakes: these aren't light bulbs, they're servo drives controlling precise motion. A power fault on axis 23 could mean a ruined block, or worse, equipment damage.

**FB_AxisPower is the master switch for 36 servo drives.** In v3.0 its job is deliberately narrow:

1. Power all drives on/off as a coordinated unit.
2. Establish the gantry (master/slave) connections once, at startup.
3. Report power and gantry faults to the shared fault queue.

> **What it does NOT do anymore:** fault *recovery*. There is no `Reset` input, no MC_Reset loop,
> no `diagnosis/confirm/all-errors`, no `AllResetDone` output. All of that moved to
> **`FB_FaultMonitor`** (the RESETTING sequence) in v3.0, so there's exactly one place that owns
> hardware recovery. If you're looking for reset logic, it's there, not here.

## What It Does

- **Power control** — `MC_Power` on all 36 axes, enabled together by `PowerOn`
- **Gantry connection** — `ML_AxsAddToGantry` for all 18 slave→master pairs, once per PLC run
- **Status** — `DrivesReady` is TRUE only when power is on, every drive reports ready, no drive
  has an error, *and* the gantry is connected
- **Fault reporting** — drive and gantry errors are pushed to `GVL_Faults` via `FC_ReportFault`
  (self-clearing: the per-axis "reported" flag clears when the drive's error goes away)

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            FB_AxisPower                                  │
│                                                                          │
│  INPUT:  PowerOn                                                         │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────┐     │
│  │ DRIVE POWER (every scan)                                        │     │
│  │   FOR i := MIN..MAX DO  fbPower[i](Enable := PowerOn, Axis…)    │     │
│  │   build allReady / firstError                                   │     │
│  │   report each drive error once via FC_ReportFault (self-clear)  │     │
│  └────────────────────────────────────────────────────────────────┘     │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────┐     │
│  │ GANTRY CONNECTION (once, when drives first come ready)          │     │
│  │   gantryState 0: fill 18 structs (slave name + master name)     │     │
│  │              1: ML_AxsAddToGantry × 18                          │     │
│  │              2: GantryConnected := TRUE; monitor for errors     │     │
│  │   gantryState is NEVER reset — connections persist through      │     │
│  │   drive power cycles; re-calling would fault "already connected"│     │
│  └────────────────────────────────────────────────────────────────┘     │
│                                                                          │
│  OUTPUTS: DrivesReady, ErrorAxisID                                      │
└─────────────────────────────────────────────────────────────────────────┘
```

## Why gantry connection lives here (and runs only once)

On ctrlX, `ML_AxsAddToGantry` is what actually binds a slave axis to its master at runtime.
`MC_MoveAbsolute` on a gantry master won't drive the slaves until this is done. So FB_AxisPower
performs it once, the first time `DrivesReady` conditions are met:

```iecst
IF PowerOn AND allReady AND (firstError = 0) THEN
    CASE gantryState OF
        0: // fill all 18 structs (AxisName = slave, MasterName = master)
           ... ; gantryState := 1;
        1: // call ML_AxsAddToGantry for all 18 pairs
           ... ; gantryState := 2;
        2: // connected — monitor each pair for errors
           GantryConnected := TRUE; ...
    END_CASE
ELSE
    GantryConnected := FALSE;   // but gantryState is preserved, NOT reset to 0
END_IF
```

The critical subtlety: **gantry connections survive a drive power cycle.** Slaves stay
`GANTRY_SLAVE` even when masters go `DISABLED`. So `gantryState` must never roll back to 0 — if
it did, the next power-on would call `ML_AxsAddToGantry` again and fault with "already connected."

## The DrivesReady calculation

```iecst
DrivesReady := PowerOn AND allReady AND (firstError = 0) AND GantryConnected;
```

Four conditions, no shortcuts:
- Power commanded ON
- Every drive reports `Status` TRUE
- No drive has an error
- The gantry is connected (otherwise master moves wouldn't carry their slaves)

`DrivesReady` is the gate the state machine checks before it will enter RUNNING, HOMING, or MANUAL.

## How faults are reported (self-clearing)

There's no error *latch* in here — that's `FB_FaultMonitor`'s job. FB_AxisPower just pushes a
fault entry the first time a drive error appears, and re-arms when it clears:

```iecst
IF NOT fbPower[i].Error THEN
    powerErrorReported[i] := FALSE;          // re-arm once the drive is healthy
END_IF
IF fbPower[i].Error AND NOT powerErrorReported[i] THEN
    FC_ReportFault('FB_AxisPower', i, DWORD#0, 'Drive power error',
                   E_MotionStep.WAIT_FOR_LOAD, 0);
    powerErrorReported[i] := TRUE;           // report once per occurrence
END_IF
```

This self-clearing pattern (the same one `FB_KinematicEnable` uses) is structurally immune to the
"phantom fault" trap — there's no latched state that can get stuck. See `FAULT_TROUBLESHOOTING.md`.

## In context

```
PowerOn  ──▶ ┌──────────────┐ ──▶ DrivesReady ──▶ gate for RUNNING / HOMING / MANUAL
(GVL_HMI.    │ FB_AxisPower │ ──▶ ErrorAxisID ──▶ HMI diagnostics
 btn_DriveOn)└──────────────┘ ──▶ FC_ReportFault ──▶ GVL_Faults ──▶ FB_FaultMonitor
```

`PLC_PRG` also force-drops `GVL_HMI.btn_DriveOn` to FALSE whenever the machine is faulted, so a
fault automatically cuts drive power.

## Lessons Learned

### Why fault recovery was moved out
Earlier versions did MC_Reset and `diagnosis/confirm/all-errors` inside FB_AxisPower. That split
recovery across two FBs (power here, kinematics elsewhere) and made reset ordering hard to reason
about. v3.0 consolidated **all** recovery into `FB_FaultMonitor`'s RESETTING sequence (confirm →
reset slaves → reset masters → kin reset/enable → confirm → verify). FB_AxisPower got simpler and
more single-purpose as a result.

### Gantry state must persist
The one genuinely surprising behavior: not resetting `gantryState` on power loss. It feels wrong
("shouldn't I reconnect after powering back up?") but the connection is sticky on the controller,
and re-adding faults. Power can cycle; the gantry binding stays.

## Interface Reference

### Inputs
| Name | Type | Description |
|------|------|-------------|
| PowerOn | BOOL | Enable power to all drives |

### Outputs
| Name | Type | Description |
|------|------|-------------|
| DrivesReady | BOOL | TRUE when all drives are powered, error-free, and the gantry is connected |
| ErrorAxisID | UINT | First axis with a power error (0 = none) |

> No `Reset` input and no `AllResetDone` output — reset/recovery lives in `FB_FaultMonitor`.

## The Responsibility

FB_AxisPower is the gatekeeper between the control system and 36 servo drives. Get it right and
it's invisible: operators press Drive On, the drives come alive, the gantries bind, production
runs. That's the goal of infrastructure code — reliability so absolute people forget it exists.

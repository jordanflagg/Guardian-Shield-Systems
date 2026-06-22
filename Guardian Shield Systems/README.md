# Guardian Shield Systems - Foam Block Carving Machine

Automated foam block processing system with 36-axis motion control on a Bosch ctrlX CORE.

> **New here? Start with these three:**
> 1. This README (architecture overview)
> 2. [plc-code/FAULT_TROUBLESHOOTING.md](plc-code/FAULT_TROUBLESHOOTING.md) — how to diagnose a fault fast
> 3. [CLAUDE.md](CLAUDE.md) — the authoritative, in-depth system overview
>
> Each function block also has a companion `.md` next to its `.txt` that tells its story in plain language.

## 📁 Project Structure

```
Guardian Shield Systems/
├── plc-code/
│   ├── function-blocks/       # PLC function blocks (FB_*) + a .md companion each
│   │   ├── FB_AxisMover.txt           # Generic single-axis move (wraps MC_MoveAbsolute)
│   │   ├── FB_MultiAxisMover.txt       # Up to 8 coordinated parallel moves
│   │   ├── FB_AxisData.txt            # Reads position/velocity for the HMI
│   │   ├── FB_AxisManual.txt          # Manual jog of a single master axis (MC_Jog)
│   │   ├── FB_AxisHome.txt            # Homing — non-kin via moves, kin via G-code scripts
│   │   ├── FB_ButtonManager.txt       # Button edge detection → one-scan command pulses
│   │   ├── FB_AxisPower.txt           # Drive power (MC_Power ×36) + gantry connection
│   │   ├── FB_KinematicEnable.txt     # 24/7 wire-kin enable / interrupt / opstate monitor
│   │   ├── FB_FaultMonitor.txt        # Fault detection, latch, ctrlX diag poll, reset/recovery
│   │   ├── FB_MotionStep_LoadBlock.txt # Load step (12 substeps, axes 1,2,6,8,10)
│   │   ├── FB_MotionStep_Cutting.txt   # Cutting step (G-code driven — no PLC axis motion)
│   │   ├── FB_MotionStep_Unload.txt    # Unload step (5 substeps, axes 8,10)
│   │   ├── FB_MotionSequence.txt       # Motion phase orchestrator
│   │   ├── FB_MachineStateMachine.txt  # Top-level state control + safety
│   │   └── FB_ErrorHandler.txt         # DEPRECATED stub (replaced by FB_FaultMonitor)
│   │
│   ├── data-types/
│   │   ├── E_MachineState.txt         # 9 machine states
│   │   ├── E_MotionStep.txt           # Motion phases (WAIT_FOR_LOAD…SHIFT_TO_UNLOAD_AREA)
│   │   ├── E_ActiveCommand.txt        # Button command enum
│   │   ├── ST_MotionParameters.txt    # Velocity/accel/decel/jerk
│   │   ├── ST_PositionSetpoints.txt   # Load/unload axis target positions
│   │   └── ST_FaultReport.txt         # One fault record (source, axis, code, step…)
│   │
│   ├── global-variables/
│   │   ├── GVL_Axes.txt               # Master/slave/kin axis constants (single source of truth)
│   │   ├── GVL_Machine.txt            # Positions + motion params (replaces the old recipe lib)
│   │   ├── GVL_GCode.txt              # G-code pipeline handshake (Python ↔ PLC)
│   │   ├── GVL_Faults.txt             # activeFault + axisFlags[1..36] + systemFault
│   │   └── GVL_HMI.txt                # All HMI read/write variables
│   │
│   ├── helper functions/
│   │   ├── FC_BuildAxisMask.txt       # Axis numbers → 64-bit HMI bitmask
│   │   └── FC_ReportFault.txt         # One-liner any FB calls to post a fault
│   │
│   ├── programs/  PLC_PRG.txt          # Main orchestrator
│   ├── FAULT_TROUBLESHOOTING.md        # ★ Field guide for diagnosing faults
│   └── documentation/ Project Overview.txt
│
└── web-hmi/                   # Web-based HMI (browser ↔ ctrlX Data Layer)
    └── simple-version/index-industrial.html   # Primary HMI
```

## 🎯 Project Overview

| | |
|---|---|
| **Machine** | Automated foam block carving machine |
| **Controller** | Bosch ctrlX CORE |
| **Language** | IEC 61131-3 Structured Text |
| **Axes** | 36 servo (18 masters + 18 gantry slaves), absolute encoders (no homing search) |
| **Cutting** | Hot-wire, **G-code driven** by the ctrlX script runtime + wire kinematic groups |
| **Operations** | Block load → cut (studs, windows/doors, electrical troughs) → unload |
| **Version** | 3.0 — G-code pipeline + Bosch gantry groups |

### Two big architectural ideas (v3.0)

1. **Gantry slaving is configured in the Bosch ctrlX web UI**, not in PLC code. The PLC only ever
   commands the 18 master axes; the 18 slaves follow via hardware kinematic config. (There is no
   `FB_AxisGearing` anymore.)
2. **All cutting is G-code.** The Python pipeline generates per-wire `.npg` scripts, uploads them
   to the ctrlX filesystem, and `trigger_dispatch.py` runs them on always-enabled wire kinematics.
   The PLC does **not** command cutting-axis motion — `FB_MotionStep_Cutting` just runs a handshake
   (`bFilesReady` → `bBusy` → `bJobDone`). The studs / windows / electrical motions are all just
   wire scripts now, so the old `FB_MotionStep_Studs/_WindowsDoors/_Electrical` FBs are gone.

## 🚀 Quick Start — PLC import order

1. **Data types:** `E_MachineState`, `E_MotionStep`, `E_ActiveCommand`,
   `ST_MotionParameters`, `ST_PositionSetpoints`, `ST_FaultReport`
2. **Global variables:** `GVL_Axes` (constants), `GVL_Machine`, `GVL_GCode`, `GVL_Faults`, `GVL_HMI`
3. **Helper functions:** `FC_BuildAxisMask`, `FC_ReportFault`
4. **Function blocks (dependency order):**
   `FB_AxisMover` → `FB_MultiAxisMover` → `FB_AxisData`, `FB_AxisManual`, `FB_AxisHome`,
   `FB_ButtonManager`, `FB_AxisPower`, `FB_KinematicEnable`, `FB_FaultMonitor`,
   `FB_MotionStep_LoadBlock`, `FB_MotionStep_Cutting`, `FB_MotionStep_Unload`,
   `FB_MotionSequence`, `FB_MachineStateMachine`
5. **Program:** `PLC_PRG`

### Web HMI quick test
```bash
cd web-hmi/simple-version
start index-industrial.html
```

## 📖 Function Blocks at a glance

**FB_MachineStateMachine** (top-level) — INIT, IDLE, HOMING, MANUAL, RUNNING, STOPPING, FAULTED,
E_STOPPED, RESETTING. E-Stop and `HasFault` (from FB_FaultMonitor) are checked before the main
CASE. Handles wire-kinematic interrupt/continue and cycle pause/resume. **No** recipe lock or
gearing engagement.

**FB_MotionSequence** (orchestrator) — `WAIT_FOR_LOAD → SHIFT_TO_PROCESSING_AREA → CUTTING →
SHIFT_TO_UNLOAD_AREA`, enabling one step FB at a time. Positions come from `GVL_Machine`; the cut
path comes from `GVL_GCode`.

**Motion step FBs**
- `FB_MotionStep_LoadBlock` — 12 substeps; axes 1, 2, 6, 8, 10
- `FB_MotionStep_Cutting` — G-code handshake only (PLC commands no cutting axes)
- `FB_MotionStep_Unload` — 5 substeps; axes 8, 10

**FB_AxisMover / FB_MultiAxisMover** (helpers) — wrap `MC_MoveAbsolute` with a clean
Done/Busy/Error state machine; the multi-mover coordinates up to 8 in parallel. ⚠️ Both must be
flushed with `Execute := FALSE` on disable to avoid *phantom faults* — see
[FAULT_TROUBLESHOOTING.md](plc-code/FAULT_TROUBLESHOOTING.md) and `FB_AxisMover.md`.

**FB_AxisPower** — `MC_Power` on all 36 axes + one-time `ML_AxsAddToGantry` for the 18 pairs.
`DrivesReady` gates RUNNING/HOMING/MANUAL. Reset/recovery is **not** here — it's in FB_FaultMonitor.

**FB_KinematicEnable** — keeps the 5 wire kinematic groups enabled 24/7, handles interrupt/continue
on E-Stop/Stop/Start, and polls each kin's opstate for `ERRORSTOP`.

**FB_FaultMonitor** — the heart of fault handling. Latches `HasFault` from either `GVL_Faults`
(any FB's `FC_ReportFault`) or the 24/7 ctrlX diagnosis poll, and owns the full reset/recovery
sequence (confirm errors → MC_Reset slaves → masters → kin reset/enable → verify). Also computes
`LogicFaultSuspected` (phantom-fault hint).

**FB_AxisHome / FB_AxisManual / FB_AxisData** — homing (non-kin via moves, kin via G-code home
scripts), manual jog of master axes, and live position/velocity for the HMI.

**FB_ButtonManager** — R_TRIG edge detection → **one-scan** command pulses (the state machine owns
mode persistence). Priority: E-Stop > Stop > Start > Home > Manual > Reset.

## 🧯 Fault handling (the short version)

```
Any FB → FC_ReportFault → GVL_Faults.activeFault + axisFlags[n]
                                  │
ctrlX 24/7 diag poll ─────────────┤
                                  ▼
                          FB_FaultMonitor (latches HasFault, runs recovery on RESET)
                                  ▼
                       FB_MachineStateMachine → FAULTED → (reset) → RESETTING → IDLE
                                  ▼
                       HMI: HMI_HasFault, HMI_ActiveFault, HMI_LogicFaultSuspected
```

`HMI_LogicFaultSuspected = TRUE` means "an axis FB reported an error but ctrlX sees no drive fault"
— a stale/phantom logic fault, so look at the PLC, not the drive. Full guide:
[FAULT_TROUBLESHOOTING.md](plc-code/FAULT_TROUBLESHOOTING.md).

## 🛠️ Axis Configuration

18 masters receive commands; 18 slaves follow via Bosch ctrlX gantry groups (1:1).

| Axes | Function | Role |
|------|----------|------|
| 1 | Block shift to left wall | Independent master |
| 2 (3,4,5) | Load table lift | Master + 3 gantry slaves |
| 6 (7) | Load pusher / center shift | Master + slave |
| 8 (9) | Process/unload pusher | Master + slave |
| 10 (11,12,13) | Process/unload table lift | Master + 3 slaves |
| 14,15 (16,17) | Stud station 1 (vert/horiz) | Kinematic (Wire1) |
| 18,19 (20,21) | Stud station 2 | Kinematic (Wire2) |
| 22,23 (24,25) | Stud station 3 | Kinematic (Wire3) |
| 26,27 (28,29) | Stud station 4 | Kinematic (Wire4) |
| 30,31 (32,33) | Window/door (horiz R&P / vert) | Kinematic (Wire5_6) |
| 34 | Unload table shift wall | Independent master |
| 35,36 | Electrical trough cutters | Kinematic (Wire5_6) |

Kinematic masters live inside always-enabled wire groups and can't take `MC_MoveAbsolute` while
enabled — they're homed via G-code home scripts (`FB_AxisHome`). Non-kin masters (1, 2, 6, 8, 10,
34) home with direct moves.

## 🚦 Machine States

`INIT → IDLE`, then from IDLE: `HOMING`, `MANUAL`, or `RUNNING` (needs `DrivesReady` + staged
G-code). `STOPPING` is a *pause* (resumable via Start). `FAULTED` / `E_STOPPED` require Reset, which
runs `RESETTING` (FB_FaultMonitor recovery) before returning to IDLE.

## 🔐 Safety Features

- E-Stop interrupts any state (highest priority), `MC_Halt` on all axes, wire kins interrupted
- Fault interrupts any state via `HasFault`; drives auto-power-off on fault
- Centralized fault detection, latch, and recovery in FB_FaultMonitor
- 24/7 ctrlX diagnosis polling catches drive faults even if no FB noticed

## 📝 Future Enhancements

- [ ] Suction cup I/O (enable output + vacuum-confirm input)
- [ ] Hot wire PWM temperature control
- [ ] Multiple window/door openings per block
- [ ] Fault history ring buffer + timestamps (see FAULT_TROUBLESHOOTING.md §6)
- [ ] Surface `HMI_LogicFaultSuspected` on the HMI fault card
- [ ] Production tracking, alarm logging, and trending

---

**Project:** Guardian Shield Systems — Foam Block Carving Machine
**Company:** Integrated ControlWorks, LLC
**Version:** 3.0 (G-Code Pipeline + Bosch Gantry Groups)

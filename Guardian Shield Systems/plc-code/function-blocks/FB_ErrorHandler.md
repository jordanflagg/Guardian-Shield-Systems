# FB_ErrorHandler — DEPRECATED (v3.0)

> ⚠️ **This function block is a deprecated empty stub.** `FB_ErrorHandler.txt` still exists only
> so the CODESYS project doesn't throw a missing-POU warning, and it should be deleted once the
> project tree no longer references the name. It contains no logic. The detailed narrative that
> used to live here described an architecture that has been **completely replaced** — do not use
> it as a reference.

## What replaced it

The old `FB_ErrorHandler` collected error signals that were **propagated up** through
`FB_MotionSequence` into `FB_MachineStateMachine` (one BOOL + AxisID per step, plus gearing
and power), then latched a single `ST_MotionError`. That whole wiring harness is gone.

The current fault system is **push-based** and far simpler:

| Concern | Old (FB_ErrorHandler) | New (v3.0) |
|---|---|---|
| Reporting a fault | Wire `Error`/`ErrorAxisID` outputs up through 2 layers | Any FB calls `FC_ReportFault(...)` |
| Storage | `ST_MotionError` inside the handler | `GVL_Faults.activeFault` (+ `axisFlags[]`, `systemFault`) |
| Detection / latch | Handler runs inside the state machine | `FB_FaultMonitor` runs **first** in `PLC_PRG`, every scan |
| Hardware faults | Not detected unless an FB reported | `FB_FaultMonitor` also polls ctrlX diagnosis 24/7 |
| Recovery | Just cleared the latch | `FB_FaultMonitor` runs a full MC_Reset + kin-recovery sequence |
| Type | `ST_MotionError` | `ST_FaultReport` |

Notably, the old priority chain referenced `GearingError` and the
`Studs / WindowsDoors / Electrical` motion steps — **all of which were removed in v3.0**
(gantry slaving moved to the Bosch ctrlX web config; all cutting is now G-code driven through
`FB_MotionStep_Cutting`).

## Where to look now

- **`FB_FaultMonitor.txt`** — detection, latch, ctrlX diagnosis poll, and the reset/recovery sequence
- **`GVL_Faults.txt`** — `activeFault` (first-fault-wins), `axisFlags[1..36]`, `systemFault`
- **`FC_ReportFault.txt`** — the one-liner any FB calls to post a fault
- **`ST_FaultReport.txt`** — the per-fault record (replaces `ST_MotionError`)
- **`FAULT_TROUBLESHOOTING.md`** — how to read all of the above when the machine faults

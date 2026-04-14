# Guardian Shield Systems - TODO

---

## Code Review — Simplification & Cleanup
*Goal: Remove bloat, keep function. Every file should be readable by someone unfamiliar with the project.*

### Review Queue (in order)
- [x] `FB_AxisHome` — Reviewed 2026-03-27
- [x] `FB_AxisPower` — Reviewed 2026-03-27
- [x] `FB_ScriptDispatch` / `FB_KinCommand` / `ST_ScriptCmd` — Reviewed 2026-03-27
- [x] `FB_MotionStepBase` — Reviewed 2026-03-27
- [x] `FB_MotionStep_Cutting` — Reviewed 2026-03-27
- [x] `FB_MachineStateMachine` — Reviewed 2026-03-27
- [x] `FB_ErrorHandler` — Reviewed 2026-03-27
- [x] Helper functions (`FC_*`) — Reviewed 2026-03-27
- [x] `ST_AxisMoveCmd` / `ST_ScriptCmd` — Reviewed 2026-03-27
- [x] `PLC_PRG` — Reviewed 2026-03-27
- [x] `trigger_dispatch.py` — Reviewed 2026-03-30
- [x] `GVL_GCode` ↔ `trigger_dispatch.py` handshake — Confirmed clean 2026-03-30
- [x] `step_runner.py` — Reviewed 2026-03-30

### Completed Review Items

#### `step_runner.py` — 2026-03-30
- **Deleted:** `run_trigger_service()` (~90 lines) — v2.x dispatch model, completely superseded
  by trigger_dispatch.py. Referenced `bTriggerStart` and `bStartAck`, neither of which exists
  in GVL_GCode. Would mislead anyone reading the code into thinking the PLC trigger flow still
  goes through this service.
- **Deleted:** `_wait_for_wires_complete()` — only called by `run_trigger_service`. Dead by association.
- **Deleted:** `_PLC_TRIGGER`, `_PLC_START_ACK`, `_PLC_STATE` Data Layer path constants —
  all pointed to GVL_GCode variables that don't exist (bTriggerStart, bStartAck, sScriptState).
  Only used by the deleted functions.
- **Deleted:** `--trigger-service` CLI argument and its `main()` handler — invoked deleted function.
- **Deleted:** `import time` — no longer used after removing the polling loops.
- **Fixed:** `/stage` endpoint response message: `bTriggerStart` → `bBusy` (correct signal name).
- **Fixed:** `/step` endpoint docstring: step 5 now correctly says "Set bFilesReady=TRUE —
  trigger_dispatch.py dispatches wires when PLC sets bBusy=TRUE" instead of claiming this
  endpoint dispatches directly (it never did with dispatch=False).
- **Confirmed active endpoints:** `/stage` (primary production path), `/step` (same, alternate),
  `/health`, `/wires`, `/plc-status`, `/wires/{wire}/reset`, `/wires/reset-all`,
  `/kinematics/enable`, `/step/metadata` — all confirmed in use or as useful diagnostics.

#### `trigger_dispatch.py` — 2026-03-30
- **Fixed:** Module docstring was completely wrong — referenced `bTriggerStart` (doesn't exist),
  `bStartAck` (never existed), and "wire opstate BUSY→INIT" (actual logic polls kinematic
  opstate for STANDBY). Rewrote to accurately describe the current bBusy-driven flow.
- **Fixed:** `STARTUP_DELAY = 2.0` was a local constant buried in `_wait_kins_standby` — renamed
  to `KIN_STARTUP_DELAY` and moved to the module-level config block with `POLL_INTERVAL`/
  `KIN_SETTLE_TO`. All tuneable timing in one place.
- **Confirmed:** Credentials (HOST/USER/PASS) are default Bosch ctrlX credentials on an
  air-gapped 192.168.0.x machine network. Intentional for this deployment — not a bug.
- **Found + documented:** `bWire5Active` / `nActiveWires` in GVL_GCode are set by step_runner.py
  at staging time but `trigger_dispatch.py` ignores them. Wire5 can only be activated by
  manually editing `WIRE_SCRIPTS` and restarting the service. Added a TODO comment at
  `WIRE_SCRIPTS` describing the fix (read `bWire5Active` after `bBusy=TRUE`, add/remove Wire5
  dynamically). No code change — this is a feature addition, not a cleanup.
- **Confirmed:** GVL_GCode ↔ trigger_dispatch.py variable name drift check — all 6 paths
  match exactly (bFilesReady, bBusy, bJobDone, bError, sStatus, nPipelineStage). No drift.
- **Logic confirmed correct:** prepare→clear→verify→dispatch→wait→home→delete→bJobDone sequence
  is clean. Timeout and error paths are correct. Reconnect/retry loop is solid.

#### `PLC_PRG` — 2026-03-27
- **Fixed:** `HMI_MotionSubStep` type changed from `INT` to `UINT` — matched to `motionSubStep : UINT`
  output from FB_MachineStateMachine. Was an implicit narrowing conversion every scan.
- **Cleaned:** Removed double blank line (cosmetic).
- **Confirmed clean:** No references to any deleted items (FB_MotionStepBase, FC helpers,
  FB_ScriptDispatch, ST_GCodeMove, E_MoveType, etc.). All HMI variables confirmed in use
  by the web HMI (verified during FB_AxisHome review). Drive-disable-on-fault logic
  (btn_DriveOn := FALSE when isFaulted) is correct. Both axisData instances necessary.

#### `ST_AxisMoveCmd` + `ST_ScriptCmd` — 2026-03-27
- **Deleted both.** Neither referenced anywhere outside their own definition files.
- `ST_AxisMoveCmd` — intended as a command struct for FB_AxisMover but FB_AxisMover
  takes individual parameters directly; the struct was never used.
- `ST_ScriptCmd` — deleted earlier with FB_ScriptDispatch (superseded by Python dispatch).

#### Helper functions (`FC_*`) + `ST_MoverStatus` — 2026-03-27
- **Kept:** `FC_BuildAxisMask` — called 13× from LoadBlock and 4× from Unload. Earns its
  existence: converts axis numbers to a 64-bit HMI visualization bitmask cleanly.
- **Deleted:** `FC_AnyMoverError`, `FC_CheckMoversComplete`, `FC_FindFirstErrorAxis` —
  none called from anywhere. Built for a parallel-axis management pattern that was replaced
  by the simpler per-substep inline error checking now in each step FB.
- **Deleted:** `ST_MoverStatus` — only referenced by the three dead FC functions above.

#### `FB_ErrorHandler` — 2026-03-27
- **Fixed:** `errorTimestamp` field in ST_MotionError was never cleared on reset —
  added `ErrorInfo.errorTimestamp := T#0s` to the reset block.
- **Fixed:** Cutting error description was always 'G-Code cutting error on axis 0'
  (CuttingErrorAxisID is always 0 — Python doesn't provide an axis ID). Changed to
  'Wire cutting error — see GVL_GCode.sStatus for details' which points to the actual
  diagnostic information.
- **Fixed:** `internalErrorCount` type changed from INT to UINT to match the ErrorCount
  output it feeds.
- **Confirmed:** PowerError/PowerErrorAxisID inputs exist in the FB interface but are not
  yet driven — wiring them up is tracked as a TODO in FB_MachineStateMachine.

#### `FB_MachineStateMachine` — 2026-03-27
- **Removed:** `startButton := FALSE` from STOPPING — modifying VAR_INPUT has no external
  effect; dead code that looked functional but wasn't.
- **Removed:** Empty `IF motionSequence.SequenceComplete THEN` block — comment was the code.
- **Removed:** Stale TODO in FAULTED — error details already handled by FB_ErrorHandler.
- **Added:** `motionSequence(Enable := FALSE)` to STOPPING — fixes the known bug where
  Stop then Start resumed mid-sequence instead of from WAIT_FOR_LOAD.
- **Added:** `motionSequence(Enable := FALSE)` + GVL_GCode flag cleanup to RESETTING —
  ensures clean state after any fault. bFilesReady cleared so operator must re-upload
  G-code after a fault reset.
- **Replaced:** 3 lines of commented-out PowerError code with a single actionable TODO.
- **Remaining TODO:** STOPPING transitions to IDLE immediately — needs MC_Halt on all
  axes and wait for zero velocity for a proper controlled stop.

#### `FB_MotionStep_Cutting` + `FB_MotionSequence` — 2026-03-27
- **Removed:** `CurrentMoveIndex` and `TotalMoves` outputs from FB_MotionStep_Cutting —
  never written (always 0), leftover from when the FB tracked per-move queue progress.
- **Removed:** `CuttingMoveIndex` and `CuttingTotalMoves` from FB_MotionSequence VAR_OUTPUT
  and the two assignment lines that fed them. Nothing in the codebase read these.
- **Design decision resolved:** bError now sets Error := TRUE (faults machine) instead of
  silently advancing to unload. Clears bBusy + bFilesReady so operator must re-upload
  G-code after reset. trigger_dispatch.py clears bError at the start of the next trigger.
- **FB is now 3 substeps, clean:** 0=wait for bFilesReady → 10=wait for bJobDone → 20=cleanup.

#### `FB_MotionStepBase` — 2026-03-27
- **Action: Deleted. Inlined the enable/disable logic directly into all three step FBs.**
- **Why:** Abstraction cost more than it saved — 80 lines in base + 18 lines boilerplate per FB
  vs. 10 inlined lines per FB. Net saving: ~100 lines. Reading any step FB required opening
  a second file to understand `ShouldRun`, `ResetSubStep`, `base.Done`.
- **Dead code found:** `stepComplete` and `stepError` vars were declared in base but never
  set to TRUE — the guard that used them was permanently dead.
- **Inlined pattern** (same in all 3 FBs): IF NOT Enable → reset all + RETURN.
  IF NOT stepStarted → mark started, set Busy, reset subStep.

#### `GVL_GCode` architecture comment — 2026-03-27
- **Fixed:** Stale architecture comment said "trigger_dispatch.py is no longer needed" — this was wrong.
  trigger_dispatch.py IS the active dispatch engine. Rewrote comment to describe v4.0 accurately.
- **Actual architecture confirmed:**
  - Python API → uploads Wire*.npg, sets bFilesReady
  - PLC → sees bFilesReady, sets bBusy, waits for bJobDone
  - trigger_dispatch.py → sees bBusy, dispatches wires, monitors, homes, sets bJobDone
  - PLC → sees bJobDone, clears flags, Done
- **Variable ownership documented:** bFilesReady (Python→PLC), bBusy (PLC), bJobDone/bError (trigger_dispatch.py)

#### `FB_ScriptDispatch`, `FB_KinCommand`, `ST_ScriptCmd` — 2026-03-27
- **Action: Deleted all three files.** Never instantiated anywhere in the codebase.
- `FB_KinCommand` — superseded by direct `ML_KinReset`/`ML_KinEnable` calls inside `FB_AxisPower`
- `FB_ScriptDispatch` + `ST_ScriptCmd` — superseded by Python pipeline taking over G-code dispatch;
  PLC now just watches handshake flags (`bFilesReady`, `bBusy`, `bJobDone`). `FB_MotionStep_Cutting`
  never used these.

#### `FB_AxisPower` — 2026-03-27
- **Kept:** All `ML_AxsAddToGantry` and `ML_KinEnable` logic — this IS required PLC code
  - **Important:** CLAUDE.md said gantry is "configured in the web UI, NOT in PLC code" — this
    is misleading. Web UI defines the topology; `ML_AxsAddToGantry` is the runtime activation
    call the PLC must make. Without it, `MC_MoveAbsolute` on gantry masters will not work.
    Same for `ML_KinEnable` activating Wire1–Wire5 kinematic groups.
- **Changed:** Moved `GantryConnected`, `KinematicsEnabled`, `AllResetDone` from `VAR_OUTPUT`
  to `VAR` (internal only) — nothing in PLC_PRG or state machine reads them.
- **Kept as output:** `ErrorAxisID` — reserved for when FB_ErrorHandler power error inputs
  get wired up (currently commented out in FB_MachineStateMachine).
- **Only external output used:** `DrivesReady` → `PLC_PRG.HMI_DrivesReady`.

#### `FB_AxisHome` — 2026-03-27
- **Kept:** Core "move to position 0" logic (states 0–14, error 99), all HMI variables
- **Changed:** `FB_MachineStateMachine` INIT — `isHomed := FALSE` (was `TRUE`)
  - **Why:** The HMI gates cycle start on `isHomed`. Setting TRUE unconditionally at boot
    bypassed the check. Now it auto-flips to TRUE when `fbHome.AllAxesHomed` confirms
    all master axes are within ±0.5mm of position 0 — no operator action required if
    axes are already home, but the machine won't lie about it on cold start.
- **Kept (confirmed used):** 18x `MC_ReadActualPosition` scan loop, `AllAxesHomed`,
  `AxisIsHomed[]` array — all actively displayed in HMI homing page and used by
  the start-cycle validation gate.

---

## High Priority (Immediate)


Machine is running, stop, home, resume running it goes back to where it was. Need logic for resetting cycle and some way to keep track if anything is homed maybe we need to do a full reset. 

If runnning homing command and hit stop button the home continues. After doing this homing does not work... fb_single execute is stuck at TRUE. need abort homing option or soemthing to reset it. The FB axis mover instance is stuck on true and never reset 

after e stop (ie any time drive off is toggled) it forces you to home all axis. (maybe option to resume where left off or home in a pop up?)



### I/O Integration
- [ ] Add suction cup I/O control (enable output, active confirmation input)
- [ ] Add hot wire PWM control for temperature regulation (6 hot wires)
- [ ] Implement DrivesReady check before allowing RUNNING state

### State Machine
- [ ] Implement controlled deceleration in STOPPING state (FB_MachineStateMachine:207)
- [ ] Add fault logging and axis identification in FAULTED state (FB_MachineStateMachine:224)
- [ ] Implement axis error reset and alarm buffer clearing in RESETTING state (FB_MachineStateMachine:261)

### Motion Steps
- [ ] Add suction cup enable/disable in FB_MotionStep_LoadBlock (line 236)
- [ ] Add suction cup disable in FB_MotionStep_Unload (line 64)

## Medium Priority (Near-term)


### Axis Management
- [ ] Implement Axis 34 control (unload table shift)
- [ ] Add axis position limits and soft limits

### HMI Enhancements
- [ ] Add diagnostic displays for detailed axis status
- [ ] Add fault logging history display
- [ ] Add production statistics dashboard

## Low Priority (Future)

### Features
- [ ] Multiple window/door openings per block (recipe-driven array of positions)
- [ ] Production tracking and statistics (blocks processed, cycle times)
- [ ] Operator login and access levels
- [ ] Automatic recipe selection based on barcode/RFID

### Maintenance
- [ ] Predictive maintenance counters (motor hours, cycle counts)
- [ ] Calibration routines for position verification

---

## Completed

### Version 3.0 - February 2026
- [x] G-Code pipeline integration for hot wire cutting
- [x] Python FastAPI service to receive G-Code from upstream systems
- [x] FB_MotionStep_Cutting replaces separate Studs/WindowsDoors/Electrical steps
- [x] GVL_GCode for Python-to-PLC communication via Data Layer
- [x] E_MoveType and ST_GCodeMove data types for move queue
- [x] Simplified E_MotionStep enum (4 steps instead of 6)
- [x] Updated FB_ErrorHandler for unified cutting errors
- [x] No Bosch G-Code Runtime license required - uses PLCopen FBs directly

### Version 2.2 - January 2026
- [x] Add FB_AxisHome for single and batch axis homing
- [x] Move FB_AxisManual into FB_MachineStateMachine for proper state control
- [x] Add homing page controls to HMI
- [x] Add machine mode indicator to HMI header
- [x] Fix axis switching in FB_AxisData (cycle Enable on axis change)
- [x] Add separate FB_AxisData instance for homing page

### Version 2.1 - January 2026
- [x] Move FB_ErrorHandler from FB_MotionSequence to FB_MachineStateMachine
- [x] Centralized error collection from all subsystems (power, gearing, motion)

### Version 2.0 - January 2026
- [x] Modular motion step architecture (5 dedicated FBs)
- [x] FB_AxisMover helper for single-axis moves
- [x] FB_MultiAxisMover helper for parallel axis coordination
- [x] FB_ErrorHandler for centralized error collection
- [x] FB_AxisGearing for gearing control
- [x] Recipe system (GVL_Recipes)
- [x] HMI integration with real-time visualization
- [x] Skip logic for optional steps (studs, windows/doors, electrical)
- [x] Manual jog mode (FB_AxisManual)
- [x] Global error clearing via CXA_Datalayer

# Guardian Shield Systems - TODO

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

### Recipe System
- [ ] Implement recipe editing from HMI
- [ ] Add recipe save/load to persistent storage
- [ ] Implement actual PLC write for recipe changes (index-industrial.html:2049)

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

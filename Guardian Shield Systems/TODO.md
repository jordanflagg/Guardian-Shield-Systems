# Guardian Shield Systems - TODO

## High Priority (Immediate)

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

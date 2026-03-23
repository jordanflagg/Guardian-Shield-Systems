================================================================================
//                     FOAM BLOCK PROCESSING MACHINE
//                     MOTION CONTROL SYSTEM OVERVIEW
// ================================================================================
//
// Project: Automated Foam Block Carving Machine
// Controller: Bosch ctrlX CORE
// Language: Structured Text (IEC 61131-3)
// Total Axes: 36 servo axes
// Date: January 2026
// Version: 3.0 - G-Code Pipeline + Bosch Gantry Groups
//
// ================================================================================
// MACHINE DESCRIPTION
// ================================================================================
//
// This machine processes foam blocks (4-16 ft long, 4 ft high, 8-24 in deep) for
// building panel construction. The process flow is:
//
// 1. Fork truck loads raw foam block onto load table
// 2. Block is shifted and centered in the processing area
// 3. Python pipeline generates G-Code cutting path from panel design
// 4. PLC executes G-Code moves on hot wire axes (all cutting operations)
// 5. Finished block is shifted to unload table for fork truck removal
//
// The machine uses:
// - 36 servo axes with absolute encoders (no homing required)
// - Gantry groups configured in Bosch ctrlX web interface (slave axes follow masters)
// - 6 hot wires controlled by PWM for temperature regulation
// - Suction cups to hold blocks during processing
// - Target accuracy: ±1/8 inch (gaps filled with liquid foam later)
//
// CUTTING MOTION ARCHITECTURE:
// - Python pipeline generates a G-Code file and writes it directly to the ctrlX filesystem
// - Python triggers execution via a POST command to the ctrlX Data Layer script runtime
// - The G-Code runtime (NOT the PLC) drives all axis kinematics during cutting
// - The PLC monitors script/instances//<name>/state via Data Layer read each scan
// - State transitions: INIT → BUSY → INIT (file run done) or BUSY → ERROR (fault)
// - FB_MotionStep_Cutting reports Done/Error to FB_MotionSequence based on state
// - ST_GCodeMove and E_MoveType data types are NOT used — G-Code is native to the runtime
//
// GANTRY GROUP ARCHITECTURE:
// - Master-slave axis relationships are configured in the Bosch ctrlX web interface
//   as kinematic gantry groups, NOT in PLC code
// - PLC commands only master axes; slaves follow automatically via hardware config
// - This eliminates the need for FB_AxisGearing and MB_GearInPos calls in ST code
//
// ================================================================================
// PROGRAM ARCHITECTURE (v2.0 - Modular)
// ================================================================================
//
// The program follows a hierarchical, modular structure with clear separation
// of concerns. Motion steps are now encapsulated in dedicated function blocks
// for improved maintainability and testability.
//
// PLC_PRG (Main Program - Orchestrator)
// │
// ├── FB_ButtonManager
// │   └── Handles all operator inputs with edge detection
// │   └── Outputs: processed button states + activeCommand enum
// │
// ├── FB_AxisPower
// │   └── Centralized power management for all 36 axes
// │   └── Manages MC_Power and MC_Reset function blocks
// │   └── Uses CXA_Datalayer DL_WriteNode for global error clearing
// │   └── Output: DrivesReady status, AllResetDone, ErrorAxisID
// │
// ├── FB_MachineStateMachine
// │   └── Top-level machine state control (safety layer)
// │   └── States: INIT → IDLE → HOMING/MANUAL/RUNNING → STOPPING/FAULTED/E_STOPPED
// │   └── Contains FB_MotionSequence, FB_AxisManual instances
// │   └── Contains FB_ErrorHandler (centralized error collection)
// │   └── Outputs visualization data and error info for HMI
// │
// ├── FB_AxisManual
// │   └── Manual jog control for single axis via HMI
// │   └── Uses MC_Jog for velocity-controlled jogging
// │   └── Only allows jogging of master axes
// │   └── Provides position/velocity feedback to HMI
// │
// └── FB_MotionSequence (Orchestrator for motion steps)
//     │
//     ├── FB_MotionStep_LoadBlock     (SHIFT_TO_PROCESSING_AREA - 11 substeps)
//     ├── FB_MotionStep_Cutting       (CUTTING - G-Code driven, all cut types)
//     └── FB_MotionStep_Unload        (SHIFT_TO_UNLOAD_AREA - 5 substeps)
//
// HELPER FUNCTION BLOCKS:
// ───────────────────────
// ├── FB_AxisMover       - Wraps MC_MoveAbsolute with state machine
// └── FB_MultiAxisMover  - Coordinates up to 8 parallel axis moves
// 
// ================================================================================
// AXIS CONFIGURATION
// ================================================================================
// 
// MASTER AXES (18 total - receive motion commands):
// ─────────────────────────────────────────────────
//   Axis 1   Block shift to left wall (independent)
//   Axis 2   Load table lift (master for 3, 4, 5)
//   Axis 6   Load table pusher (master for 7)
//   Axis 8   Processing/unload table pusher (master for 9)
//   Axis 10  Processing/unload table lift (master for 11, 12, 13)
//   
//   Stud Carving - 4 stations, each with vertical + horizontal pair:
//   Axis 14  Vertical hot wire station 1 (master for 16)
//   Axis 15  Horizontal hot wire station 1 (master for 17)
//   Axis 18  Vertical hot wire station 2 (master for 20)
//   Axis 19  Horizontal hot wire station 2 (master for 21)
//   Axis 22  Vertical hot wire station 3 (master for 24)
//   Axis 23  Horizontal hot wire station 3 (master for 25)
//   Axis 26  Vertical hot wire station 4 (master for 28)
//   Axis 27  Horizontal hot wire station 4 (master for 29)
//   
//   Window/Door/Electrical:
//   Axis 30  Horizontal positioning - rack & pinion (master for 32)
//   Axis 31  Vertical hot wire (master for 33)
//   Axis 34  Unload table shift wall (independent)
//   Axis 35  Electrical trough cutter 1 (independent)
//   Axis 36  Electrical trough cutter 2 (independent)
// 
// SLAVE AXES (18 total - follow masters via Bosch ctrlX gantry groups):
// ────────────────────────────────────────────────────────
//   Axes 3, 4, 5      Follow Axis 2  (load table - 4 corners)
//   Axis 7            Follows Axis 6  (load pusher - 2 sides)
//   Axis 9            Follows Axis 8  (process pusher - 2 sides)
//   Axes 11, 12, 13   Follow Axis 10 (process lift - 4 corners)
//   Axis 16           Follows Axis 14 (stud vertical pair)
//   Axis 17           Follows Axis 15 (stud horizontal pair)
//   Axis 20           Follows Axis 18 (stud vertical pair)
//   Axis 21           Follows Axis 19 (stud horizontal pair)
//   Axis 24           Follows Axis 22 (stud vertical pair)
//   Axis 25           Follows Axis 23 (stud horizontal pair)
//   Axis 28           Follows Axis 26 (stud vertical pair)
//   Axis 29           Follows Axis 27 (stud horizontal pair)
//   Axis 32           Follows Axis 30 (window horizontal pair)
//   Axis 33           Follows Axis 31 (window vertical pair)
// 
// GANTRY GROUP NOTES:
// - All master-slave relationships configured in Bosch ctrlX web interface
// - Ratio: 1:1 for all pairs
// - PLC code only references and commands master axes
// - Slaves automatically follow masters via hardware kinematic configuration
// 
// ================================================================================
// STATE MACHINES
// ================================================================================
// 
// LEVEL 1: MACHINE STATE (FB_MachineStateMachine)
// ───────────────────────────────────────────────
// Controls overall machine behavior and safety.
// 
//   ┌──────────┐
//   │   INIT   │ ──→ Initialize variables, verify system
//   └────┬─────┘
//        ↓
//   ┌──────────┐
//   │   IDLE   │ ←──────────────────────────────────────┐
//   └────┬─────┘                                        │
//        │ ┌─────────────┬─────────────┐                │
//        ↓ ↓             ↓             ↓                │
//   ┌────────┐     ┌──────────┐   ┌─────────┐          │
//   │ HOMING │     │  MANUAL  │   │ RUNNING │          │
//   └────┬───┘     └────┬─────┘   └────┬────┘          │
//        │              │              │                │
//        └──────────────┴──────┬───────┘                │
//                              ↓                        │
//                        ┌──────────┐                   │
//                        │ STOPPING │ ──────────────────┤
//                        └──────────┘                   │
//                                                       │
//   ┌───────────┐    ┌──────────┐    ┌───────────┐     │
//   │ E_STOPPED │ ──→│ RESETTING│ ──→│  (back)   │ ────┘
//   └───────────┘    └──────────┘    └───────────┘
//         ↑
//         │ (E-stop can interrupt ANY state)
// 
// 
// LEVEL 2: MOTION SEQUENCE (FB_MotionSequence)
// ────────────────────────────────────────────
// Runs when machine is in RUNNING state. Each main state contains substeps.
//
//   ┌─────────────────┐
//   │  WAIT_FOR_LOAD  │  Wait for blockLoaded signal
//   └────────┬────────┘
//            ↓
//   ┌─────────────────────────┐
//   │ SHIFT_TO_PROCESSING_AREA│  11 substeps - move block to center
//   └────────┬────────────────┘
//            ↓
//   ┌─────────────────┐
//   │     CUTTING     │  G-Code driven - Python pipeline writes moves to
//   │                 │  GVL_GCode.aMoveQueue; FB_MotionStep_Cutting executes
//   │                 │  all cut types: studs, windows/doors, electrical troughs
//   └────────┬────────┘
//            ↓
//   ┌─────────────────────────┐
//   │  SHIFT_TO_UNLOAD_AREA   │  5 substeps - move to unload table
//   └────────┬────────────────┘
//            ↓
//   ┌─────────────────────────┐
//   │   SEQUENCE_COMPLETE     │  Signal done, wait for unload
//   └─────────────────────────┘
// 
// ================================================================================
// MOTION SEQUENCE DETAIL
// ================================================================================
// 
// WAIT_FOR_LOAD
// ─────────────
//   • Machine waits for operator to load foam block via fork truck
//   • Transition: blockLoaded input goes TRUE
// 
// SHIFT_TO_PROCESSING_AREA (11 substeps)
// ──────────────────────────────────────
//   Substep 0:  Axis 1 shifts block against left reference wall
//   Substep 1:  Axis 2 (+ 3,4,5) raises - lifts block off load table
//   Substep 2:  Axis 6 (+ 7) extends - pushes block toward center
//   Substep 3:  Axis 2 (+ 3,4,5) lowers - sets block down
//   Substep 4:  Axis 6 (+ 7) retracts to home
//   Substep 5:  Axis 10 (+ 11,12,13) raises - prepare to receive block
//   Substep 6:  Axis 8 (+ 9) extends - pushes block to final center
//   Substep 7:  Enable suction cups (wait for confirmation)
//   Substep 8:  Axis 8 (+ 9) retracts to home
//   Substep 9:  Axis 10 (+ 11,12,13) lowers - clears cutting area
//   Substep 10: Complete → transition to CUTTING
// 
// CUTTING (G-Code driven by ctrlX script runtime)
// ────────────────────────────────────────────────
//   Python writes G-Code file to ctrlX filesystem and POSTs to script runtime.
//   The G-Code runtime drives kinematics natively — PLC does NOT parse the G-Code.
//
//   PLC role (FB_MotionStep_Cutting):
//     1. Poll script/instances//<name>/state via Data Layer (DL_ReadNode)
//     2. Wait for state = BUSY (Python has started the job)
//     3. Wait for state to leave BUSY:
//          BUSY → INIT           : file run completed normally → Done
//          BUSY → READY/FINISHED : string run completed → Done
//          BUSY → ERROR          : script fault → Error
//     4. Report Done/Error to FB_MotionSequence
//
//   Script instance name configured in GVL_GCode.sScriptInstance.
//   Complete → transition to SHIFT_TO_UNLOAD_AREA
//
// SHIFT_TO_UNLOAD_AREA (5 substeps)
// ─────────────────────────────────
//   Substep 0:  Disable suction cups, Axis 10 (+ 11,12,13) raises
//   Substep 1:  Axis 8 (+ 9) extends - pushes block to unload table
//   Substep 2:  Axis 10 (+ 11,12,13) lowers - sets block on unload table
//   Substep 3:  Axis 8 (+ 9) retracts to home
//   Substep 4:  Complete → transition to SEQUENCE_COMPLETE
// 
// ================================================================================
// DATA STRUCTURES
// ================================================================================
// 
// E_MachineState (enumeration)
// ────────────────────────────
//   INIT := 0
//   IDLE := 1
//   HOMING := 2
//   MANUAL := 3
//   RUNNING := 4
//   STOPPING := 5
//   FAULTED := 6
//   E_STOPPED := 7
//   RESETTING := 8
// 
// E_MotionStep (enumeration)
// ──────────────────────────
//   WAIT_FOR_LOAD := 1
//   SHIFT_TO_PROCESSING_AREA := 2
//   CUTTING := 3          (G-Code driven - replaces Studs/Windows/Electrical)
//   SHIFT_TO_UNLOAD_AREA := 4
// 
// E_ActiveCommand (enumeration) - for button manager
// ──────────────────────────────────────────────────
//   CMD_NONE := 0
//   CMD_START := 1
//   CMD_STOP := 2
//   CMD_HOME := 3
//   CMD_MANUAL := 4
//   CMD_RESET := 5
// 
// ST_MotionParameters (structure)
// ───────────────────────────────
//   defaultVelocity : LREAL
//   defaultAcceleration : LREAL
//   defaultDeceleration : LREAL
//   defaultJerk : LREAL
//   positionTolerance : LREAL
// 
// ST_PositionSetpoints (structure)
// ────────────────────────────────
//   Contains all target positions for every axis at every step.
//   Positions are named: axis#_FunctionPosition
//   Example: axis2_RaisePosition, axis30_TargetPosition_1
//   Values loaded from GVL_Recipes.RecipeLibrary[RecipeID].positions
//
// ST_MotionError (structure)
// ──────────────────────────
//   hasError : BOOL               - Error is active
//   errorAxisID : UINT            - Axis that caused error
//   errorCode : DWORD             - Error code (1001-2005)
//   errorStep : E_MotionStep      - Which motion step had error
//   errorSubStep : INT            - Which substep within the step
//   errorDescription : STRING     - Human-readable error message
//
// GVL_Machine (Global Variable List)
// ───────────────────────────────────
//   Positions : ST_PositionSetpoints  - All load/unload axis target positions
//   MotionParams : ST_MotionParameters - Velocity, accel, decel, jerk for positioning moves
//   (Cutting paths come from GVL_GCode, not from machine config)
// 
// ================================================================================
// FUNCTION BLOCK DESCRIPTIONS
// ================================================================================
//
// FB_ButtonManager
// ────────────────
//   Purpose: Centralized button input processing with latching
//
//   Inputs:
//     btn_Start_In, btn_Stop_In, btn_Home_In,
//     btn_Manual_In, btn_Reset_In, btn_EStop_In : BOOL
//     ClearCommand : BOOL         - External clear from state machine
//
//   Outputs:
//     btn_Start_Out, btn_Stop_Out, btn_Home_Out,
//     btn_Manual_Out, btn_Reset_Out, btn_EStop_Out : BOOL
//     activeCommand : E_ActiveCommand
//
//   Behavior:
//     - Uses R_TRIG for edge detection on all buttons except E-stop
//     - E-stop is level-sensitive (active while held)
//     - Commands STAY LATCHED until another button pressed or ClearCommand
//     - Priority: E-Stop > Stop > Start > Home > Manual > Reset
//     - Outputs are mutually exclusive (CASE statement ensures this)
//
// FB_AxisPower
// ────────────
//   Purpose: Centralized axis power and reset management
//
//   Inputs:
//     PowerOn : BOOL              - Enable all drives
//     Reset : BOOL                - Reset all drive faults
//
//   Outputs:
//     DrivesReady : BOOL          - All drives powered and ready
//     AllResetDone : BOOL         - All axis resets complete
//     ErrorAxisID : UINT          - First axis with error (0 = none)
//
//   Behavior:
//     - Loops through all axes using MOTIF_CONFIG index range
//     - Calls MC_Power for each axis
//     - Reset sequence: 1) Clear all errors via DL_WriteNode, 2) MC_Reset all axes
//     - Uses CXA_Datalayer 'diagnosis/confirm/all-errors' for global error clear
//     - DrivesReady = TRUE only when ALL axes report ready with no errors
//
// FB_AxisManual
// ─────────────
//   Purpose: Manual jog control for single axis via HMI
//
//   Inputs:
//     Enable : BOOL               - Enable manual mode
//     AxisSelect : UINT           - Selected axis (1-36, only masters allowed)
//     JogPositive : BOOL          - Jog positive direction (hold to jog)
//     JogNegative : BOOL          - Jog negative direction (hold to jog)
//     JogVelocity : LREAL         - Jog velocity in mm/s
//
//   Outputs:
//     Active : BOOL               - Jog is currently active
//     Error : BOOL                - Error occurred
//     ErrorID : ERROR_CODE        - Error code from MC_Jog
//     CurrentPosition : LREAL     - Current position of selected axis (mm)
//     CurrentVelocity : LREAL     - Current velocity of selected axis (mm/s)
//
//   Behavior:
//     - Uses MC_Jog for velocity-controlled jogging
//     - Only allows jogging of 18 master axes (slaves follow via gearing)
//     - Position/velocity reading works even when disabled (for HMI display)
//     - Invalid axis selection returns error code 0x8001
//
// FB_MachineStateMachine
// ──────────────────────
//   Purpose: Top-level machine control and safety management
//
//   Inputs:
//     startButton, stopButton, homeButton,
//     manualMode, eStopActive, resetButton : BOOL
//     selectedRecipe : UINT       - Recipe selection from HMI (1-10)
//     jogAxisSelect, jogPositive, jogNegative : for manual mode
//     jogVelocity : LREAL         - Jog speed in mm/s
//     powerError : BOOL           - Power error from FB_AxisPower
//     powerErrorAxisID : UINT     - Which axis has power error
//
//   Outputs:
//     currentStateOut : E_MachineState
//     isRunning, isFaulted, isHomed : BOOL
//     activeRecipeID : UINT       - Currently active recipe
//     recipeLocked : BOOL         - TRUE when recipe cannot be changed
//     motionStepOut, motionSubStep, activeAxesMask, stepDescription : HMI viz
//     hasError : BOOL             - Any error (power or motion)
//     errorInfo : ST_MotionError  - Detailed error information from FB_ErrorHandler
//     errorCount : UINT           - Total error count since last reset
//     jogActive, jogCurrentPosition, jogCurrentVelocity, jogError : Jog feedback
//
//   Behavior:
//     - E-stop can interrupt ANY state (highest priority)
//     - Contains instances of FB_MotionSequence, FB_AxisManual
//     - Contains FB_ErrorHandler for centralized error collection
//     - Collects errors from: FB_AxisPower, FB_MotionSequence
//     - Recipe is locked when entering RUNNING state
//     - Uses MC_Halt for all axes in E_STOPPED state
//     - MANUAL state enables FB_AxisManual for jog control
//     - Transitions to FAULTED state when FB_ErrorHandler reports any error
//
// FB_MotionSequence
// ─────────────────
//   Purpose: Orchestrates modular motion step FBs for block processing
//
//   Inputs:
//     Enable : BOOL               - TRUE when machine in RUNNING state
//     RecipeID : UINT             - Recipe number to load (1-10)
//
//   Outputs:
//     SequenceComplete : BOOL     - Full cycle completed
//     CurrentStep : E_MotionStep  - Current motion phase
//     ActiveRecipeID : UINT       - Currently loaded recipe
//     RecipeLoadComplete : BOOL   - Recipe loaded successfully
//     RecipeLoadError : BOOL      - Recipe load failed
//     CurrentSubStep : INT        - Current substep within motion step
//     ActiveAxesMask : LWORD      - Bitmask of moving axes (64-bit)
//     StepDescription : STRING    - Human-readable description for HMI
//     HasError : BOOL             - Motion error occurred
//     ErrorAxisID : UINT          - Which axis caused error
//
//   Additional Outputs (for FB_ErrorHandler in state machine):
//     LoadBlockError, LoadBlockErrorAxisID : Error from load block step
//     CuttingError, CuttingErrorAxisID : Error from G-Code cutting step
//     UnloadError, UnloadErrorAxisID : Error from unload step
//
//   Internal Components:
//     - FB_MotionStep_LoadBlock, FB_MotionStep_Cutting, FB_MotionStep_Unload
//
//   Behavior:
//     - Each motion step FB handles its own substeps and error reporting
//     - Exposes individual step errors for FB_ErrorHandler in state machine
//     - Cutting step skipped if GVL_GCode.nQueueCount = 0
//
// FB_MotionStep_LoadBlock (SHIFT_TO_PROCESSING_AREA)
// ──────────────────────────────────────────────────
//   Purpose: Moves block from load table to processing center
//   Substeps: 11 (0-10)
//   Axes Used: 1, 2 (master), 6 (master), 8 (master), 10 (master)
//
// FB_MotionStep_Cutting (CUTTING)
// ────────────────────────────────
//   Purpose: Monitors ctrlX G-Code script runtime state during cutting
//   Interface: Reads script/instances//<GVL_GCode.sScriptInstance>/state via DL_ReadNode
//   Behavior: Waits for BUSY, then waits for BUSY to end (INIT=done, ERROR=fault)
//   Note: PLC does NOT drive axes during cutting — the G-Code runtime handles kinematics
//
// FB_MotionStep_Unload (SHIFT_TO_UNLOAD_AREA)
// ───────────────────────────────────────────
//   Purpose: Moves completed block to unload table
//   Substeps: 5 (0-4)
//   Axes Used: 8 (master), 10 (master)
//
// FB_AxisMover (Helper)
// ─────────────────────
//   Purpose: Wraps MC_MoveAbsolute with cleaner state machine interface
//
//   Inputs:
//     Execute, AxisRef, Position, Velocity, Acceleration, Deceleration, Jerk
//
//   Outputs:
//     Done, Busy, Error, ErrorID, Active
//
//   Behavior:
//     - State machine: IDLE → MOVING → DONE/ERROR
//     - Reduces repetitive execute/done/error patterns
//     - Level-triggered: starts move when Execute is TRUE
//
// FB_MultiAxisMover (Helper)
// ──────────────────────────
//   Purpose: Coordinates multiple axis moves and waits for all to complete
//
//   Inputs:
//     Execute : BOOL              - Rising edge starts all moves
//     Enable1..8, Axis1..8, Position1..8 : per-axis configuration
//     Velocity, Acceleration, Deceleration, Jerk : shared motion params
//
//   Outputs:
//     Done, Busy, Error, ErrorAxisNum, ErrorID, ActiveAxesMask
//
//   Behavior:
//     - Uses array of FB_AxisMover internally
//     - Supports up to 8 parallel axis moves
//     - Edge-triggered execution
//     - Reports first error encountered
//
// FB_ErrorHandler (Located in FB_MachineStateMachine)
// ───────────────────────────────────────────────────
//   Purpose: Centralized error handling for the entire machine
//   Location: Inside FB_MachineStateMachine (supervisor level)
//
//   Inputs:
//     Reset : BOOL                - Reset all errors (triggered in RESETTING state)
//     PowerError, PowerErrorAxisID : From FB_AxisPower via state machine inputs
//     LoadBlockError, LoadBlockErrorAxisID : From FB_MotionSequence
//     CuttingError, CuttingErrorAxisID : From FB_MotionSequence (G-Code cutting)
//     UnloadError, UnloadErrorAxisID : From FB_MotionSequence
//     CurrentStep, CurrentSubStep : Context from FB_MotionSequence
//
//   Outputs:
//     HasError : BOOL             - TRUE if any error is active
//     ErrorInfo : ST_MotionError  - Detailed error information
//     ErrorCount : UINT           - Total errors since last reset
//
//   Behavior:
//     - Latches first error until reset
//     - Priority: Power > LoadBlock > Cutting > Unload
//     - Error codes: 1001=Power, 2001=LoadBlock, 2002=Cutting, 2005=Unload
//     - Reset triggered when state machine enters RESETTING state
//
//   Data Flow:
//     FB_AxisPower ──────────────┐
//     FB_MotionSequence (3 steps)┴──► FB_ErrorHandler ──► hasError, errorInfo
//                                              │
//                                              ▼
//                                    State machine uses hasError
//                                    to transition to FAULTED
// 
// ================================================================================
// MOTION CONTROL PATTERNS
// ================================================================================
// 
// SINGLE AXIS MOVE:
//   targetPosAxis# := positions.axis#_Position;
//   executeAxis#Move := TRUE;
//   
//   IF fbMoveAxis#.Done THEN
//       executeAxis#Move := FALSE;
//       subStep := subStep + 1;
//   END_IF;
//   
//   IF fbMoveAxis#.Error THEN
//       executeAxis#Move := FALSE;
//       // TODO: Handle error
//   END_IF;
// 
// PARALLEL AXIS MOVE (multiple axes, wait for all):
//   targetPosAxis14 := positions.axis14_Position;
//   targetPosAxis18 := positions.axis18_Position;
//   executeAxis14Move := TRUE;
//   executeAxis18Move := TRUE;
//   
//   IF fbMoveAxis14.Done AND fbMoveAxis18.Done THEN
//       executeAxis14Move := FALSE;
//       executeAxis18Move := FALSE;
//       subStep := subStep + 1;
//   END_IF;
//   
//   IF fbMoveAxis14.Error OR fbMoveAxis18.Error THEN
//       // Clear all and handle error
//   END_IF;
// 
// ================================================================================
// CONTROL FLOW SUMMARY
// ================================================================================
// 
// STARTUP:
//   1. Operator presses "Drive On"
//      → FB_AxisPower enables all 36 axes
//      → Wait for DrivesReady = TRUE
//   
//   2. Operator presses "Start"
//      → FB_MachineStateMachine → RUNNING
//      → FB_MotionSequence.enable := TRUE
//      → Sequence begins at WAIT_FOR_LOAD
// 
// NORMAL CYCLE:
//   1. Fork truck places block, blockLoaded := TRUE
//   2. Motion sequence executes all states/substeps
//   3. Block arrives at unload table
//   4. Fork truck removes block
//   5. Operator presses "Start" for next cycle
// 
// STOP:
//   1. Operator presses "Stop"
//      → FB_MachineStateMachine → STOPPING → IDLE
//      → FB_MotionSequence.enable := FALSE
//      → All motion halts, sequence resets
// 
// EMERGENCY STOP:
//   1. E-stop pressed
//      → FB_MachineStateMachine → E_STOPPED immediately
//      → MC_Halt called on all axes
//      → Requires E-stop release + Reset button to recover
// 
// ================================================================================
// KNOWN LIMITATIONS / TODO ITEMS
// ================================================================================
//
// IMMEDIATE:
//   □ Add suction cup I/O (enable output, active confirmation input)
//   □ Add hot wire PWM control for temperature regulation
//   □ Implement DrivesReady check before allowing RUNNING state
//
// FUTURE:
//   □ Multiple window/door openings per block (recipe-driven)
//   □ Axis 34 implementation (unload table shift)
//   □ Diagnostic displays and fault logging
//   □ Production tracking and statistics
//
// COMPLETED (v2.0):
//   ✓ Implement proper error handling with fault identification (FB_ErrorHandler)
//   ✓ Add SEQUENCE_COMPLETE state handling (loops back to WAIT_FOR_LOAD)
//   ✓ Add sequence reset on disable (each step FB resets independently)
//   ✓ HMI integration (visualization outputs in FB_MotionSequence)
//   ✓ Modular motion step architecture (3 dedicated FBs)
//   ✓ Manual jog mode (FB_AxisManual)
//   ✓ Global error clearing via CXA_Datalayer
//
// ================================================================================
// REVISION HISTORY
// ================================================================================
//
// Version 3.0 - March 2026
//   - MAJOR SIMPLIFICATION: Removed FB_AxisGearing and all MB_GearInPos ST code
//   - Gantry groups now configured in Bosch ctrlX web interface (kinematic config)
//   - Removed FB_MotionStep_Studs, FB_MotionStep_WindowsDoors, FB_MotionStep_Electrical
//   - Removed ST_GCodeMove and E_MoveType — G-Code goes directly to ctrlX script runtime
//   - FB_MotionStep_Cutting rewritten: monitors script/instances//<name>/state via DL_ReadNode
//     instead of dequeuing custom move structs. PLC never touches axis motion during cutting.
//   - GVL_GCode simplified: no move queue, just script instance name + status flags
//   - Python pipeline: writes G-Code file to ctrlX filesystem, POSTs to runtime to trigger
//   - Removed recipe system - replaced with direct GVL_Machine configuration
//   - FB_ErrorHandler simplified: removed GearingError, now Power > LoadBlock > Cutting > Unload
//   - FB_MachineStateMachine simplified: removed gearingNeeded flag and axisGearing calls
//
// Version 2.1 - January 2026
//   - Moved FB_ErrorHandler from FB_MotionSequence to FB_MachineStateMachine
//   - FB_ErrorHandler now collects errors from all subsystems (power, gearing, motion)
//
// Version 2.0 - January 2026
//   - MAJOR REFACTOR: Modular motion step architecture
//   - Added FB_AxisGearing, FB_AxisManual, FB_ErrorHandler
//   - FB_AxisPower now uses CXA_Datalayer for global error clearing
//
// Version 1.0 - January 2026
//   - Initial implementation with 36 axes and 18 gearing pairs
//
// ================================================================================
// END OF DOCUMENT
// ================================================================================
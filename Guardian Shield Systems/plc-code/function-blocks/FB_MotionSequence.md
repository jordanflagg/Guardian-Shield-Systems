# FB_MotionSequence: The Choreographer

## The Story

Think of a ballet. The choreographer doesn't dance - they orchestrate. They know when the lead should enter, when the corps should move, when the set should change. They see the whole performance and ensure each part happens in the right order.

**FB_MotionSequence is the choreographer for foam cutting.** It doesn't move axes directly - it knows which motion step should execute and when to hand off to the next one. Load the block, carve the studs, cut the windows, route the electrical troughs, unload the finished piece.

It's the layer that transforms a collection of independent motion steps into a coherent manufacturing sequence.

## What It Does

FB_MotionSequence orchestrates the motion flow:

- **Recipe loading** - Loads position setpoints and motion parameters for selected product
- **Step sequencing** - Progresses through motion steps in order
- **Conditional execution** - Skips steps not enabled in the recipe
- **Error aggregation** - Exposes errors from all steps for centralized handling
- **Visualization** - Provides HMI-friendly status for real-time monitoring

## The Motion Sequence

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          MOTION SEQUENCE FLOW                                │
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                      WAIT_FOR_LOAD                                   │   │
│   │                                                                      │   │
│   │   Waiting for foam block to be placed on load table                 │   │
│   │   (blockLoaded sensor = TRUE)                                       │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                              │                                               │
│                              ▼                                               │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                  SHIFT_TO_PROCESSING_AREA                            │   │
│   │                                                                      │   │
│   │   FB_MotionStep_LoadBlock                                           │   │
│   │   - Shift block against wall                                        │   │
│   │   - Lift and move to center                                         │   │
│   │   - 11 substeps, axes 1,2,6,8,10                                   │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                              │                                               │
│                   ┌──────────┴──────────┐                                   │
│            enableStuds?                 │                                   │
│                   │                     │                                   │
│              YES  │               NO    │                                   │
│                   ▼                     │                                   │
│   ┌───────────────────────────┐        │                                   │
│   │          STUDS            │        │                                   │
│   │                           │        │                                   │
│   │   FB_MotionStep_Studs    │        │                                   │
│   │   - 8 axis pairs carving │        │                                   │
│   │   - 6 substeps           │        │                                   │
│   └───────────────────────────┘        │                                   │
│                   │                     │                                   │
│                   └──────────┬──────────┘                                   │
│                              │                                               │
│                   ┌──────────┴──────────┐                                   │
│          enableWindowsDoors?            │                                   │
│                   │                     │                                   │
│              YES  │               NO    │                                   │
│                   ▼                     │                                   │
│   ┌───────────────────────────┐        │                                   │
│   │      WINDOWS_DOORS        │        │                                   │
│   │                           │        │                                   │
│   │FB_MotionStep_WindowsDoors│        │                                   │
│   │   - Hot wire cutting     │        │                                   │
│   │   - 6 substeps           │        │                                   │
│   └───────────────────────────┘        │                                   │
│                   │                     │                                   │
│                   └──────────┬──────────┘                                   │
│                              │                                               │
│                   ┌──────────┴──────────┐                                   │
│           enableElectrical?             │                                   │
│                   │                     │                                   │
│              YES  │               NO    │                                   │
│                   ▼                     │                                   │
│   ┌───────────────────────────┐        │                                   │
│   │       ELECTRICAL          │        │                                   │
│   │                           │        │                                   │
│   │FB_MotionStep_Electrical  │        │                                   │
│   │   - Trough routing       │        │                                   │
│   │   - 6 substeps           │        │                                   │
│   └───────────────────────────┘        │                                   │
│                   │                     │                                   │
│                   └──────────┬──────────┘                                   │
│                              │                                               │
│                              ▼                                               │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                   SHIFT_TO_UNLOAD_AREA                               │   │
│   │                                                                      │   │
│   │   FB_MotionStep_Unload                                              │   │
│   │   - Lift finished block                                             │   │
│   │   - Shift to unload table                                           │   │
│   │   - 5 substeps, axes 8,10                                           │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                              │                                               │
│                              ▼                                               │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │   SequenceComplete := TRUE                                           │   │
│   │   Return to WAIT_FOR_LOAD for next cycle                            │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Recipe Management

The sequence loads recipe data when RecipeID changes:

```iecst
IF RecipeID <> lastRecipeID THEN
    IF RecipeID >= 1 AND RecipeID <= 10 THEN
        IF GVL_Recipes.RecipeLibrary[RecipeID].isActive THEN
            // Load recipe data
            positions := GVL_Recipes.RecipeLibrary[RecipeID].positions;
            motionParams := GVL_Recipes.RecipeLibrary[RecipeID].motionParams;
            enableStuds := GVL_Recipes.RecipeLibrary[RecipeID].enableStuds;
            enableWindowsDoors := GVL_Recipes.RecipeLibrary[RecipeID].enableWindowsDoors;
            enableElectrical := GVL_Recipes.RecipeLibrary[RecipeID].enableElectrical;

            ActiveRecipeID := RecipeID;
            RecipeLoadComplete := TRUE;
            RecipeLoadError := FALSE;
        ELSE
            RecipeLoadError := TRUE;
        END_IF
    ELSE
        RecipeLoadError := TRUE;
    END_IF
    lastRecipeID := RecipeID;
END_IF
```

This pattern:
1. Detects recipe change
2. Validates range (1-10)
3. Checks if recipe is active
4. Copies all recipe data to local working variables
5. Sets enable flags for optional steps

The recipe contains:
- **positions** - Target positions for all axes in all steps
- **motionParams** - Velocity, acceleration, jerk settings
- **enableStuds/WindowsDoors/Electrical** - Flags to skip certain operations

## Conditional Step Execution

Not every product needs every operation:

```iecst
E_MotionStep.SHIFT_TO_PROCESSING_AREA:
    // ... execute load block step ...
    IF stepLoadBlock.Done THEN
        stepLoadBlock(Enable := FALSE);

        // Determine next operation based on recipe
        IF enableStuds THEN
            motionStep := E_MotionStep.STUDS;
        ELSIF enableWindowsDoors THEN
            motionStep := E_MotionStep.WINDOWS_DOORS;
        ELSIF enableElectrical THEN
            motionStep := E_MotionStep.ELECTRICAL;
        ELSE
            motionStep := E_MotionStep.SHIFT_TO_UNLOAD_AREA;
        END_IF
    END_IF
```

Each step checks what's enabled and skips to the next relevant step. A product that only needs studs will skip windows/doors and electrical entirely.

This flexibility comes from recipe data, not code changes. New product variants are configuration, not programming.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            FB_MotionSequence                                 │
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                         INPUTS                                       │   │
│   │                                                                      │   │
│   │   Enable : BOOL          - TRUE when machine in RUNNING state       │   │
│   │   RecipeID : UINT        - Recipe number (1-10)                     │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                              │                                               │
│                              ▼                                               │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                     RECIPE MANAGEMENT                                │   │
│   │                                                                      │   │
│   │   positions : ST_PositionSetpoints    ◀── Loaded from recipe        │   │
│   │   motionParams : ST_MotionParameters  ◀── Loaded from recipe        │   │
│   │   enableStuds, enableWindowsDoors, enableElectrical                 │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                              │                                               │
│                              ▼                                               │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                    STEP ORCHESTRATION                                │   │
│   │                                                                      │   │
│   │   motionStep : E_MotionStep           Current step in sequence     │   │
│   │                                                                      │   │
│   │   ┌─────────────────────────────────────────────────────────────┐  │   │
│   │   │ CASE motionStep OF                                           │  │   │
│   │   │                                                              │  │   │
│   │   │   WAIT_FOR_LOAD:                                            │  │   │
│   │   │       Wait for blockLoaded sensor                           │  │   │
│   │   │                                                              │  │   │
│   │   │   SHIFT_TO_PROCESSING_AREA:                                 │  │   │
│   │   │       stepLoadBlock(Enable := TRUE, Positions, MotionParams)│  │   │
│   │   │       IF Done → next step (based on enables)                │  │   │
│   │   │                                                              │  │   │
│   │   │   STUDS:                                                    │  │   │
│   │   │       stepStuds(Enable := TRUE, ...)                        │  │   │
│   │   │       IF Done → next step                                   │  │   │
│   │   │                                                              │  │   │
│   │   │   ... other steps ...                                       │  │   │
│   │   │                                                              │  │   │
│   │   │   SHIFT_TO_UNLOAD_AREA:                                     │  │   │
│   │   │       stepUnload(Enable := TRUE, ...)                       │  │   │
│   │   │       IF Done → SequenceComplete, back to WAIT_FOR_LOAD    │  │   │
│   │   │                                                              │  │   │
│   │   └─────────────────────────────────────────────────────────────┘  │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                              │                                               │
│                              ▼                                               │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                       OUTPUTS                                        │   │
│   │                                                                      │   │
│   │   SEQUENCING                        HMI VISUALIZATION               │   │
│   │   ┌───────────────────────┐        ┌───────────────────────────┐   │   │
│   │   │ SequenceComplete      │        │ CurrentSubStep            │   │   │
│   │   │ CurrentStep           │        │ ActiveAxesMask            │   │   │
│   │   │ ActiveRecipeID        │        │ StepDescription           │   │   │
│   │   │ RecipeLoadComplete    │        │                           │   │   │
│   │   │ RecipeLoadError       │        │                           │   │   │
│   │   └───────────────────────┘        └───────────────────────────┘   │   │
│   │                                                                      │   │
│   │   ERROR EXPOSURE (for FB_ErrorHandler)                              │   │
│   │   ┌─────────────────────────────────────────────────────────────┐  │   │
│   │   │ LoadBlockError, LoadBlockErrorAxisID                         │  │   │
│   │   │ StudsError, StudsErrorAxisID                                 │  │   │
│   │   │ WindowsDoorsError, WindowsDoorsErrorAxisID                   │  │   │
│   │   │ ElectricalError, ElectricalErrorAxisID                       │  │   │
│   │   │ UnloadError, UnloadErrorAxisID                               │  │   │
│   │   │ HasError, ErrorAxisID (aggregates)                           │  │   │
│   │   └─────────────────────────────────────────────────────────────┘  │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

## The Visualization Outputs

Each motion step provides visualization data that FB_MotionSequence passes through:

```iecst
E_MotionStep.STUDS:
    stepStuds(Enable := TRUE, Positions := positions, MotionParams := motionParams);

    // Pass through visualization outputs
    CurrentSubStep := stepStuds.CurrentSubStep;
    ActiveAxesMask := stepStuds.ActiveAxesMask;
    StepDescription := stepStuds.StepDescription;
```

This allows the HMI to show:
- **CurrentStep** - "STUDS"
- **CurrentSubStep** - "2"
- **StepDescription** - "Stud axes - horizontal extend"
- **ActiveAxesMask** - Bits for axes 15, 19, 23, 27 lit up

All without FB_MotionSequence needing to know the internal details of each step.

## Error Exposure

Errors bubble up through a clean interface:

```iecst
// At the end of the FB
LoadBlockError := stepLoadBlock.Error;
LoadBlockErrorAxisID := stepLoadBlock.ErrorAxisID;
StudsError := stepStuds.Error;
StudsErrorAxisID := stepStuds.ErrorAxisID;
// ... etc ...

// Aggregate for quick check
HasError := LoadBlockError OR StudsError OR WindowsDoorsError
            OR ElectricalError OR UnloadError;
```

The state machine's FB_ErrorHandler consumes these outputs:

```iecst
errorHandler(
    LoadBlockError := motionSequence.LoadBlockError,
    LoadBlockErrorAxisID := motionSequence.LoadBlockErrorAxisID,
    // ...
);
```

This separation means:
- Motion steps report their errors locally
- FB_MotionSequence exposes them without processing
- FB_ErrorHandler handles prioritization and latching
- FB_MachineStateMachine reacts to errors

Clean layering. Each component does one job.

## Disable Handling

When Enable goes FALSE (machine stopped):

```iecst
IF NOT Enable THEN
    // Disable all step FBs
    stepLoadBlock(Enable := FALSE);
    stepStuds(Enable := FALSE);
    stepWindowsDoors(Enable := FALSE);
    stepElectrical(Enable := FALSE);
    stepUnload(Enable := FALSE);

    // Clear error state
    HasError := FALSE;
    ErrorAxisID := 0;
    // ... clear all error outputs ...

    ActiveAxesMask := 0;
    stepStarted := FALSE;
    RETURN;
END_IF
```

This ensures:
1. All motion steps stop
2. Error states clear (actual errors handled by state machine)
3. Visualization shows no activity
4. Ready for clean restart

## Lessons Learned

### Bug We Fixed: Step Not Disabling After Completion

Early versions didn't disable the completed step before transitioning:

```iecst
// WRONG
IF stepLoadBlock.Done THEN
    motionStep := E_MotionStep.STUDS;  // stepLoadBlock still enabled!
END_IF
```

This caused issues when the sequence looped back to WAIT_FOR_LOAD - the LoadBlock step was still in a Done state.

**The fix**: Always disable before transitioning:
```iecst
IF stepLoadBlock.Done THEN
    stepLoadBlock(Enable := FALSE);  // Clean up first!
    motionStep := E_MotionStep.STUDS;
END_IF
```

### Pitfall: Not Handling Recipe Load Errors

If `RecipeLoadError = TRUE`, the sequence shouldn't run. But early versions tried anyway with stale data.

**Best practice**: Check recipe validity at the state machine level before entering RUNNING.

### Why Not a FOR Loop Over Steps?

You might think:
```iecst
FOR i := 1 TO NUM_STEPS DO
    IF stepFBs[i].Done THEN
        stepFBs[i].Enable := FALSE;
        // Next step...
    END_IF
END_FOR
```

But:
1. Step skipping logic (enableStuds, etc.) doesn't fit a simple loop
2. Different steps have different FB types
3. The explicit CASE makes the sequence readable
4. Debugging is easier when you can set breakpoints on specific steps

## Interface Reference

### Inputs
| Name | Type | Description |
|------|------|-------------|
| Enable | BOOL | TRUE when machine in RUNNING state |
| RecipeID | UINT | Recipe number to load (1-10) |

### Outputs
| Name | Type | Description |
|------|------|-------------|
| SequenceComplete | BOOL | Full cycle completed |
| CurrentStep | E_MotionStep | Current motion phase |
| ActiveRecipeID | UINT | Currently loaded recipe ID |
| RecipeLoadComplete | BOOL | Recipe loaded successfully |
| RecipeLoadError | BOOL | Recipe load failed |
| CurrentSubStep | UINT | Current substep within motion step |
| ActiveAxesMask | LWORD | Bitmask of currently moving axes |
| StepDescription | STRING[80] | Human-readable description |
| LoadBlockError | BOOL | Load block step error |
| LoadBlockErrorAxisID | UINT | Load block error axis |
| StudsError | BOOL | Studs step error |
| StudsErrorAxisID | UINT | Studs error axis |
| WindowsDoorsError | BOOL | Windows/doors step error |
| WindowsDoorsErrorAxisID | UINT | Windows/doors error axis |
| ElectricalError | BOOL | Electrical step error |
| ElectricalErrorAxisID | UINT | Electrical error axis |
| UnloadError | BOOL | Unload step error |
| UnloadErrorAxisID | UINT | Unload error axis |
| HasError | BOOL | Any motion error occurred |
| ErrorAxisID | UINT | Which axis caused first error |

## The Philosophy

FB_MotionSequence is a **thin orchestration layer**. It doesn't know how to carve studs or route electrical troughs. It knows *when* those things should happen and *what order* they go in.

This separation creates:
- **Testability** - Motion steps can be tested independently
- **Flexibility** - New steps can be added without changing orchestration
- **Clarity** - The sequence is readable as a high-level description of the process
- **Recipe-driven** - Product variations are configuration, not code

The choreographer doesn't need to know the steps to the dance - they need to know when each dancer should perform.

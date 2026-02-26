# FB_MotionStepBase: The Boilerplate Eliminator

## The Story

Copy-paste is the silent killer of codebases.

When we first wrote the motion step function blocks, each one had nearly identical enable/disable handling:

```iecst
// Check if enabled
IF NOT Enable THEN
    Done := FALSE;
    Busy := FALSE;
    Error := FALSE;
    subStep := 0;
    RETURN;
END_IF

// Handle first enable
IF Enable AND NOT stepStarted THEN
    stepStarted := TRUE;
    Busy := TRUE;
    Done := FALSE;
    subStep := 0;
END_IF

// Rest of the substep logic...
```

This pattern appeared in FB_MotionStep_LoadBlock, FB_MotionStep_Studs, FB_MotionStep_WindowsDoors, FB_MotionStep_Electrical, and FB_MotionStep_Unload. Five copies of the same logic. Five opportunities for bugs. Five places to update when requirements change.

**FB_MotionStepBase is the antidote.** It extracts the common enable/disable logic into a single, tested component that all motion steps can inherit.

## What It Does

FB_MotionStepBase handles the **ceremony** of motion step management:

- **Enable detection** - Recognizing when a step is activated
- **Disable handling** - Cleaning up when a step is deactivated
- **Substep reset signaling** - Telling the caller to reset their substep counter
- **Run gating** - Telling the caller whether to execute their main logic

It does NOT handle the actual motion - that's the caller's job. It just manages the lifecycle.

## The Interface Contract

FB_MotionStepBase establishes a **contract** with its callers:

```iecst
// The caller's boilerplate becomes:
base(Enable := Enable);

IF base.ResetSubStep THEN
    subStep := 0;
END_IF

IF NOT base.ShouldRun THEN
    Done := base.Done;
    Busy := base.Busy;
    RETURN;
END_IF

// Now run your actual substep logic
CASE subStep OF
    0: ...
    1: ...
END_CASE
```

Three checks, then you're into your domain logic. Clean. Consistent. Hard to mess up.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            FB_MotionStepBase                                 │
│                                                                              │
│   ┌─────────┐                                                               │
│   │ INPUTS  │                                                               │
│   │         │                                                               │
│   │ Enable  │───────┐                                                       │
│   └─────────┘       │                                                       │
│                     ▼                                                       │
│        ┌────────────────────────────────────────────────────────┐          │
│        │                   Logic Flow                            │          │
│        │                                                         │          │
│        │   ┌─────────────────────────────────────────────────┐  │          │
│        │   │ IF NOT Enable THEN                               │  │          │
│        │   │     Reset all state                              │  │          │
│        │   │     ShouldRun := FALSE                          │  │          │
│        │   │     RETURN                                       │  │          │
│        │   │ END_IF                                           │  │          │
│        │   └─────────────────────────────────────────────────┘  │          │
│        │                     │                                   │          │
│        │                     ▼                                   │          │
│        │   ┌─────────────────────────────────────────────────┐  │          │
│        │   │ IF Enable AND NOT stepStarted THEN              │  │          │
│        │   │     stepStarted := TRUE                         │  │          │
│        │   │     Busy := TRUE                                │  │          │
│        │   │     ResetSubStep := TRUE  ◀── One-shot signal   │  │          │
│        │   │ END_IF                                          │  │          │
│        │   └─────────────────────────────────────────────────┘  │          │
│        │                     │                                   │          │
│        │                     ▼                                   │          │
│        │   ┌─────────────────────────────────────────────────┐  │          │
│        │   │ IF stepComplete OR stepError THEN               │  │          │
│        │   │     ShouldRun := FALSE                          │  │          │
│        │   │ ELSE                                            │  │          │
│        │   │     ShouldRun := TRUE                           │  │          │
│        │   │ END_IF                                          │  │          │
│        │   └─────────────────────────────────────────────────┘  │          │
│        └────────────────────────────────────────────────────────┘          │
│                                                                              │
│   ┌──────────┐                                                              │
│   │ OUTPUTS  │                                                              │
│   │          │                                                              │
│   │ShouldRun │ ─── TRUE when substep logic should execute                  │
│   │Done      │ ─── Step completed (set by caller via marking stepComplete) │
│   │Busy      │ ─── Step in progress                                        │
│   │ResetSub- │ ─── TRUE on first scan after enable (reset your subStep!)  │
│   │  Step    │                                                              │
│   └──────────┘                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## The ResetSubStep Signal

This is the clever part. When a step is enabled, the base signals **once** that the caller should reset their substep:

```iecst
// In FB_MotionStepBase
IF Enable AND NOT stepStarted THEN
    stepStarted := TRUE;
    ResetSubStep := TRUE;  // Signal: reset your substep!
END_IF
```

The caller responds:
```iecst
IF base.ResetSubStep THEN
    subStep := 0;
END_IF
```

Why a signal instead of having the base manage the substep directly? Because:

1. **Encapsulation** - The base doesn't need to know about the caller's internal state
2. **Flexibility** - Some callers might reset to a value other than 0
3. **Clarity** - The caller explicitly handles their own state

The signal is **one-shot** - it's TRUE for exactly one scan when enabling, then FALSE thereafter. The caller doesn't need to track edges; they just respond to the signal.

## The ShouldRun Gate

```iecst
IF NOT base.ShouldRun THEN
    Done := base.Done;
    Busy := base.Busy;
    RETURN;
END_IF
```

This early-return pattern ensures:
- Disabled steps immediately exit with clean outputs
- Completed steps don't re-execute their logic
- Error states properly halt execution

The caller's CASE statement only runs when `ShouldRun = TRUE`, which means:
- Enable is TRUE
- Step hasn't completed yet
- No error has been flagged

## How It Transforms Code

### Before (without FB_MotionStepBase)

```iecst
FUNCTION_BLOCK FB_MotionStep_LoadBlock

VAR
    subStep : UINT;
    stepStarted : BOOL := FALSE;
    stepComplete : BOOL := FALSE;
    stepError : BOOL := FALSE;
END_VAR

// Reset when disabled
IF NOT Enable THEN
    Done := FALSE;
    Busy := FALSE;
    Error := FALSE;
    ErrorAxisID := 0;
    ActiveAxesMask := 0;
    CurrentSubStep := 0;
    stepStarted := FALSE;
    stepComplete := FALSE;
    stepError := FALSE;
    subStep := 0;
    RETURN;
END_IF

// Handle enable transition
IF Enable AND NOT stepStarted THEN
    stepStarted := TRUE;
    stepComplete := FALSE;
    stepError := FALSE;
    Busy := TRUE;
    Done := FALSE;
    subStep := 0;
END_IF

// Don't run if complete or error
IF stepComplete OR stepError THEN
    RETURN;
END_IF

// Finally, the actual logic
CASE subStep OF
    ...
END_CASE
```

### After (with FB_MotionStepBase)

```iecst
FUNCTION_BLOCK FB_MotionStep_LoadBlock

VAR
    base : FB_MotionStepBase;
    subStep : UINT;
END_VAR

// All the ceremony in three lines
base(Enable := Enable);

IF base.ResetSubStep THEN
    subStep := 0;
END_IF

IF NOT base.ShouldRun THEN
    Done := base.Done;
    Busy := base.Busy;
    Error := FALSE;
    ErrorAxisID := 0;
    ActiveAxesMask := 0;
    CurrentSubStep := 0;
    RETURN;
END_IF

// Just the actual logic
CASE subStep OF
    ...
END_CASE
```

The before version has 25+ lines of enable/disable handling. The after version has 15, and most of those are output assignments specific to this FB. The core ceremony is 6 lines.

## Why Not Inheritance?

In object-oriented languages, we'd use inheritance: `FB_MotionStep_LoadBlock EXTENDS FB_MotionStepBase`. IEC 61131-3 supports inheritance, so why composition instead?

1. **IEC inheritance is limited** - You can't override methods the same way as in C++ or Java
2. **Composition is clearer** - The relationship is explicit: "I use a base handler"
3. **Testing is easier** - You can test FB_MotionStepBase independently
4. **Flexibility** - A step could use multiple helper FBs, not just one base

The composition approach (having `base : FB_MotionStepBase` as a VAR) is more idiomatic for IEC 61131-3.

## The Pattern in Context

FB_MotionStepBase is part of a broader architectural pattern:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Motion Step Architecture                            │
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                    FB_MotionSequence                                 │   │
│   │                         │                                            │   │
│   │                         ▼                                            │   │
│   │   ┌─────────────────────────────────────────────────────────────┐   │   │
│   │   │  FB_MotionStep_LoadBlock       FB_MotionStep_Studs          │   │   │
│   │   │  FB_MotionStep_WindowsDoors    FB_MotionStep_Electrical     │   │   │
│   │   │  FB_MotionStep_Unload                                       │   │   │
│   │   │                                                              │   │   │
│   │   │  Each contains:                                              │   │   │
│   │   │    base : FB_MotionStepBase  ◀── Shared enable/disable      │   │   │
│   │   │    subStep : UINT            ◀── Step-specific state        │   │   │
│   │   │    moverAxisN : FB_AxisMover ◀── Step-specific motion       │   │   │
│   │   └─────────────────────────────────────────────────────────────┘   │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                    FB_MotionStepBase                                 │   │
│   │                                                                      │   │
│   │    Provides: Enable handling, disable cleanup, substep reset,       │   │
│   │              run gating                                             │   │
│   │                                                                      │   │
│   │    Doesn't provide: Actual motion, error details, axis references  │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Lessons Learned

### Bug We Fixed: Forgetting ResetSubStep

Early usage missed the `IF base.ResetSubStep` check. This caused substeps to start from where they left off when re-enabled, instead of from 0.

**The fix**: Make it part of the standard pattern. Every motion step that uses FB_MotionStepBase must have:
```iecst
IF base.ResetSubStep THEN
    subStep := 0;
END_IF
```

### Pitfall: Modifying Done/Busy Incorrectly

The motion step should only modify `Done` when actually complete, and should propagate `base.Done`/`base.Busy` when not running:

```iecst
IF NOT base.ShouldRun THEN
    Done := base.Done;   // Propagate base state
    Busy := base.Busy;
    RETURN;
END_IF

// ... in substep logic ...
10: // Complete
    Done := TRUE;        // Set when actually complete
    Busy := FALSE;
```

Getting this wrong creates race conditions where Done flickers.

### Why stepComplete and stepError Exist

The base has internal flags `stepComplete` and `stepError` that aren't exposed as outputs. They're for tracking whether the step has finished, but the actual Done/Error values come from the caller.

This separation allows the caller to set their own error details (ErrorAxisID, etc.) while the base just tracks "has this step finished?"

## Interface Reference

### Inputs
| Name | Type | Description |
|------|------|-------------|
| Enable | BOOL | Enable this motion step |

### Outputs
| Name | Type | Description |
|------|------|-------------|
| ShouldRun | BOOL | TRUE when substep logic should execute |
| Done | BOOL | Step completed (propagated to caller) |
| Busy | BOOL | Step in progress |
| ResetSubStep | BOOL | TRUE on first scan after enable - reset your substep to 0 |

## The Philosophy

FB_MotionStepBase embodies the **DRY principle** (Don't Repeat Yourself).

Every time you copy-paste code, you're making a promise: "I will update all copies whenever this logic needs to change." That's a promise most developers can't keep.

By extracting the common pattern into a single component:
- Changes happen in one place
- Bugs are fixed once
- The pattern is documented
- New steps get it right automatically

It's not glamorous code. It doesn't move axes or carve foam. But it makes the motion steps simpler, more consistent, and more maintainable.

That's infrastructure done right: invisible when working, invaluable when you need to change things.

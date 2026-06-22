# Fault Troubleshooting Guide

*A field guide for figuring out **why** the machine faulted — fast — even at 3 AM, even if you've never opened this project before.*

---

## 0. The 30-second version

When the machine faults, open `GVL_Faults` in the CODESYS watch view and read these, top to bottom:

| Variable | Tells you |
|---|---|
| `activeFault.source` | **Which function block** reported it (e.g. `FB_MotionStep_Unload`) |
| `activeFault.axisID` | **Which axis** (1–36), or 0 for a system/non-axis fault |
| `activeFault.description` | Plain-English summary (e.g. `Axis 10 raise failed`) |
| `activeFault.errorCode` | Raw PLCopen `ErrorID` from the move (0 for power/kin/ctrlX faults) |
| `activeFault.motionStep` / `.motionSubStep` | **Where in the cycle** it happened |
| `axisFlags[1..36]` | Quick per-axis lamp — the TRUE one is your axis |

Then ask the one question that splits the whole problem in half:

> **Is `HMI_LogicFaultSuspected` TRUE, or does ctrlX actually show a drive error?**

That's the fork in the road. Everything below explains it.

---

## 1. The two kinds of fault

There are really only two families of fault on this machine, and they're diagnosed in completely different places.

### A) Real hardware / drive fault
A drive actually faulted — overcurrent, following error, limit hit, gantry mismatch, E-stop, a wire kinematic in `ERRORSTOP`. The ctrlX controller **knows** about these.

**Signature:**
- `faultMonitor.DiagErrorCount > 0` (the ctrlX live error count, polled every ~1 s)
- There's a matching entry in the **ctrlX Logbook** (web UI → Diagnostics → Logbook)
- `HMI_LogicFaultSuspected` is **FALSE**

**Where to look:** the ctrlX web UI Logbook, the physical machine, the drive LEDs.

### B) Phantom / logic fault
No drive is actually in error. A *function block* latched an error in software and is re-reporting it. The classic case: an `FB_AxisMover` was left stuck in its ERROR state from an earlier real fault, never got reset, and re-fires the **stale** `ErrorID` the next time that step runs — *before the axis even moves.*

**Signature:**
- `faultMonitor.DiagErrorCount = 0` (ctrlX sees nothing wrong)
- ctrlX Logbook is **clean**
- `activeFault.errorCode <> 0` and `activeFault.axisID > 0` (a mover reported a PLCopen ErrorID)
- A weird/“impossible” errorCode like **`0x7FFF` (32767)** is a giveaway
- **`HMI_LogicFaultSuspected` is TRUE** ← the machine now flags this for you

**Where to look:** the PLC logic and the **reset path** — not the drive.

> 💡 `HMI_LogicFaultSuspected` (computed in `FB_FaultMonitor`, mirrored into `GVL_HMI`) exists
> specifically so you don't have to know this distinction by heart. TRUE = "drive's fine, it's
> the code." It's a *hint*, not gospel — for the first ~1 second after a real fault it can read
> TRUE before the 1 s ctrlX poll catches up, so give it a beat.

---

## 2. The phantom fault, explained once and for all

This is worth internalizing because it's the most confusing class of bug on the machine, and it's caused the same way every time.

PLCopen motion blocks (`MC_MoveAbsolute`, and our `FB_AxisMover` wrapper around it) are **edge-driven and latching**:

- A move starts on a **rising edge** of `Execute` (FALSE → TRUE).
- `Done` and `Error` are **latched** — they stay set until the block is called again with `Execute := FALSE`.

Now picture this sequence:

1. A real fault happens mid-move. `FB_AxisMover` latches **ERROR** (its internal `state := 3`).
2. The owning step FB sets `localError`, the machine trips to `FAULTED`, the step is disabled.
3. On reset, the step FB clears *its own* bookkeeping (`subStep`, `stepStarted`, `localError`)…
   **…but forgets to call the mover with `Execute := FALSE`.**
4. The mover is frozen in ERROR. Nobody gave it the falling edge it needs to reset.
5. Next cycle, the step runs again and sets `Execute := TRUE`. The mover is *already* in ERROR —
   no rising edge, no new move — and it immediately re-emits the **old** `ErrorID`.
6. The HMI lights up `FAULTED / Axis 10 raise failed`. You run to the machine. Axis 10 is fine.
   The ctrlX Logbook is empty. You lose an hour.

**The rule that prevents all of it:**

> **Stopping calling a latched FB is *not* the same as resetting it.**
> Any FB that can freeze while latched must be explicitly driven with `Execute := FALSE`
> by whoever owns it.

This is now enforced in three places (and documented loudly in `FB_AxisMover`):

- `FB_MotionStep_LoadBlock` — flushes all 5 movers in its `IF NOT Enable` block
- `FB_MotionStep_Unload` — flushes both movers in its `IF NOT Enable` block
- `FB_MultiAxisMover` — holds all 8 child movers at `Execute := FALSE` while idle

---

## 3. How a fault flows through the system

Knowing the path tells you where to set a breakpoint.

```
  Any FB detects a problem
        │
        │  FC_ReportFault(source, axisID, errorCode, description, step, subStep)
        ▼
  GVL_Faults.activeFault   ← first-fault-wins: the ORIGINAL fault is preserved.
  GVL_Faults.hasFault := TRUE   Later calls are dropped until reset, so you always
  GVL_Faults.axisFlags[n] := TRUE   see the true root cause, not a follow-on symptom.
        │
        ▼
  FB_FaultMonitor (runs FIRST, every scan)
    - latches HasFault
    - also polls ctrlX diagnosis count 24/7 (the independent "is hardware really mad?" check)
    - computes LogicFaultSuspected
        │
        ▼
  FB_MachineStateMachine → FAULTED   (drops drive power, aborts the cut)
        │
        ▼
  HMI shows it via GVL_HMI.HMI_ActiveFault / HMI_HasFault / HMI_LogicFaultSuspected
        │
        │  operator presses RESET → state = RESETTING
        ▼
  FB_FaultMonitor reset sequence (states 1→10):
    confirm ctrlX errors → MC_Reset slaves → MC_Reset masters →
    ML_KinReset + ML_KinEnable all wire kins → confirm again → verify clean → unlatch
```

Two independent fault detectors feed `hasFault`:
1. **`FC_ReportFault`** — any FB that sees a problem in its own logic.
2. **ctrlX diagnosis poll** — catches real drive faults even if no FB noticed.

If `hasFault` is set but you can't find who set it, check both: a `source` string points to (1); a clean `source` with `DiagErrorCount > 0` points to (2) (`source = 'ctrlX_Diagnosis'`).

---

## 4. A decision tree for live troubleshooting

```
Machine FAULTED.
│
├─ Read GVL_Faults.activeFault.{source, axisID, description, motionStep, motionSubStep}
│
├─ Is HMI_LogicFaultSuspected TRUE  (and DiagErrorCount = 0, Logbook clean)?
│   │
│   ├─ YES → PHANTOM / LOGIC fault. The drive is fine.
│   │         • Press RESET. Does it come back the SAME step next cycle with the same
│   │           errorCode? → a mover isn't being flushed somewhere. Find the FB named in
│   │           `source`, confirm its `IF NOT Enable` block calls every mover with
│   │           Execute := FALSE.
│   │         • errorCode 0x7FFF / 32767 is a classic stale value.
│   │
│   └─ NO  → REAL drive fault.
│             • Open ctrlX web UI → Diagnostics → Logbook. Read the actual drive error.
│             • If source = 'FB_KinematicEnable' → a wire kin is in ERRORSTOP
│               (check motion/kin/WireN/state/opstate/plcopen).
│             • If source = 'FB_AxisPower' → drive power / gantry connection problem.
│             • If source = 'ctrlX_Diagnosis' → no FB caught it; the Logbook is the only
│               record. Read it there.
│
└─ Press RESET (RESETTING state runs the full FB_FaultMonitor recovery sequence).
    If HasFault re-latches within ~1 s, the hardware fault is still physically present.
```

---

## 5. Watch list — paste these into a CODESYS watch window

Keep this watch list saved; it answers 90% of "why did it fault" in one glance.

```
GVL_Faults.hasFault
GVL_Faults.activeFault.source
GVL_Faults.activeFault.axisID
GVL_Faults.activeFault.errorCode
GVL_Faults.activeFault.description
GVL_Faults.activeFault.motionStep
GVL_Faults.activeFault.motionSubStep
GVL_Faults.systemFault
GVL_Faults.axisFlags          (expand the array — the TRUE element is your axis)

PLC_PRG.faultMonitor.HasFault
PLC_PRG.faultMonitor.DiagErrorCount       (> 0 = REAL drive fault)
PLC_PRG.faultMonitor.LogicFaultSuspected  (TRUE = phantom / logic fault)
PLC_PRG.faultMonitor.resetSeqState        (watch this climb 1→10 during RESET)

PLC_PRG.stateMachine.currentStateOut
```

To pin down a phantom at the FB level, also add the suspect mover's internal state, e.g.:

```
PLC_PRG.stateMachine.motionSequence.stepUnload.moverAxis10.state   (3 = stuck in ERROR)
PLC_PRG.stateMachine.motionSequence.stepUnload.moverAxis10.ErrorID
```

If `.state = 3` while the machine is *idle* and nothing is moving, that mover is latched and
will phantom-fault on its next enable — that's the smoking gun.

---

## 6. Ideas to make this even easier (not yet implemented)

These are optional upgrades, roughly in value order, if you want to keep investing in diagnosability:

1. **Fault history ring buffer.** `activeFault` is first-fault-wins (great for root cause), but it
   only holds *one* fault. A small `ARRAY[0..9] OF ST_FaultReport` ring in `GVL_Faults`, written by
   `FC_ReportFault`, would let you see the *sequence* of faults across a session — invaluable when a
   real fault triggers a cascade. Pair with a scan/seconds timestamp per entry.

2. **Capture the live drive ErrorID at report time.** When a mover faults, also read the axis's
   real `MC_ReadAxisError` and store it alongside the PLCopen ErrorID. Then "phantom vs real" is
   provable per-fault, not inferred from the global ctrlX count.

3. **Surface `HMI_LogicFaultSuspected` on the fault panel.** The PLC already computes it; add one
   line to the HMI fault-details card: a yellow "⚠ Likely PLC logic fault — drive is healthy"
   badge when it's TRUE. Turns a 1-hour hunt into a glance. (HMI work only; PLC side is done.)

4. **Stamp the FB instance path into `source`.** Today `source` is the FB *type*
   (`'FB_MotionStep_Unload'`). If two instances of the same FB could fault, include the instance
   name so you know *which* one.

---

*If you only remember one thing from this document:* **`DiagErrorCount`/`LogicFaultSuspected`
tells you whether to walk to the machine or open the code.** Check it first, every time.

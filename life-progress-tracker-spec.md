note from claude chat : Complete implementation spec. A few things worth flagging before you hand it to Claude Code:
The XP thresholds are placeholder math — the formula given is approximate. You'll want to playtest the curve during implementation and adjust so early levels feel fast and later levels feel genuinely earned without being endless.
The archetype implementation is deliberately kept simple — it uses the top opportunity title rather than derived fictional names, consistent with the no-content-mapping constraint. Claude Code may try to make it more elaborate, push back on that.
The narrative templates have a lot of conditional branches — Claude Code should implement these as a clean template engine with ordered condition checks, not a messy chain of if/else. Worth specifying that explicitly if it starts going that way.
Everything in the "Explicit Non-Features" section at the bottom is there specifically because Claude Code will be tempted to add it. That list is a guardrail.

# Life Progress Tracker — Full Implementation Spec



## Overview

A React PWA that gamifies personal growth by turning real-life situations into XP-bearing events. The app tracks how users respond to recurring life challenges, builds a behavioral profile over time, and reflects it back through narrative and game mechanics. It never tells the user what to do. It only shows what they've done and who they're becoming.

The app has two rendering modes: **Standard mode** (existing pages, unchanged) and **Game mode** (toggled in settings, adds game layer on top of existing data without altering it).

---

## Data Model

### Situation
```
{
  id: string,
  title: string,
  description: string,
  difficulty: 1-5,          // user-defined
  isMeta: boolean,          // true = reflection/thinking, false = real life
  tags: string[],
  thoughts: {
    back: string[],         // negative/avoidant thoughts
    forth: string[]         // growth-oriented reframes
  },
  linkedOpportunities: opportunityId[],
  createdAt: timestamp
}
```

### Opportunity
```
{
  id: string,
  title: string,
  tags: string[],
  xp: number,               // total accumulated XP
  pathChoice: 'default' | 'cognitive' | 'emotional' | 'behavioral' | 'physical',
  pathLocked: boolean,      // true after level 3 reached
  createdAt: timestamp
}
```

### Event
```
{
  id: string,
  title: string,
  description: string,
  situationId: string,
  choice: 'well_done' | 'tried' | 'didnt_try' | 'misguided',
  linkedOpportunityIds: string[],   // inherited from situation at time of logging
  xpAwarded: number,                // computed and stored at event creation
  createdAt: timestamp
}
```

### GameProfile (only exists when game mode enabled)
```
{
  enabled: boolean,
  loginStreak: number,
  lastLoginDate: date,
  longestLoginStreak: number,
  totalDepthXP: number,     // global weighted XP
  unlockedTraits: [{ traitId, unlockedAt }],
  metaSkillBadges: [{ opportunityId, levelLabel, pathIcon, earnedAt }]
}
```

---

## XP System

### Base XP per choice
```
well_done:    +10 XP
tried:        +4 XP
didnt_try:    -2 XP
misguided:    -5 XP
```

### Real vs Meta multiplier
- Each situation has `isMeta: boolean` set by user in Customize
- If `isMeta = false` (real situation): positive XP choices are doubled
- Negative choices (didnt_try, misguided) are never doubled regardless of meta flag
- XP doubling applies to all linked opportunities equally

```
Real situation, well_done:   +20 XP per linked opportunity
Real situation, tried:       +8 XP per linked opportunity
Meta situation, well_done:   +10 XP per linked opportunity
Meta situation, tried:       +4 XP per linked opportunity
didnt_try:                   -2 XP always
misguided:                   -5 XP always
```

### Difficulty weighting (for Global Depth XP only)
Global Depth XP uses difficulty-weighted contribution:
```
contribution = base_xp * (1 + (difficulty - 1) * 0.15)
```
Difficulty 1 = 1.0x, Difficulty 5 = 1.6x. Applied only to Global Depth, not per-opportunity XP.

### Login XP
- 1 XP distributed equally across all active opportunities on daily login
- "Active" = has at least one event logged in last 30 days

---

## Path System

Every opportunity has a path. Default is pre-selected. User can change path freely until level 3 is reached, after which it locks permanently.

### Path definitions

**Default**
Labels: Aware → Learning → Practicing → Capable → Skilled → Proficient → Mastered

**Cognitive** — developing through understanding and reasoning
Labels: Noticing → Questioning → Understanding → Applying → Integrating → Internalizing → Embodied

**Emotional** — developing through feeling and processing
Labels: Reactive → Aware → Processing → Regulating → Attuned → Integrated → Embodied

**Behavioral** — developing through repetition and consistency
Labels: Attempting → Repeating → Establishing → Consistent → Automatic → Refined → Second nature

**Physical** — developing through body and energy
Labels: Recovering → Building → Strengthening → Conditioning → Robust → Peak → Vital

### Level structure
Each label repeats 3 times using Roman numerals before advancing:
```
Aware I → Aware II → Aware III → Learning I → Learning II → Learning III → ...
```
Total: 7 labels × 3 repetitions = 21 levels per path.

### XP thresholds per level
```
Level 1 (Label I):   0 - 299 XP
Level 2 (Label II):  300 - 699 XP
Level 3 (Label III): 700 - 1199 XP
Level 4:             1200 - 1799 XP
Level 5:             1800 - 2599 XP
Level 6:             2600 - 3599 XP
...continuing with increasing gaps
```
Implement as: `threshold(n) = 100 * n * (n + 1) / 2` approximately, adjust for balance during implementation.

### Prestige (beyond Mastered III / final label III)
After reaching the final level, the opportunity enters prestige. The badge reads the final label permanently (e.g., "Mastered III"). XP continues accumulating as sub-levels (Mastered III — sub 1, sub 2...) infinitely. Progress bar continues filling with smaller increments. Never resets.

### Meta-skill Badge
When an opportunity reaches its final path level (level 21 / prestige entry), a badge is permanently added to the character header:
```
{ pathIcon } { OpportunityName } — { FinalLevelLabel }
Example: 🌿 Discipline — Mastered III
```
Badges accumulate permanently and scroll horizontally on the progress page character header.

---

## Streak System (Game Mode Only)

All streaks are per-opportunity and per-situation independently unless specified.

### 1. Attempt Streak
**Tracks:** Consecutive events where choice was `tried` or `well_done`
**Breaks on:** `didnt_try` or `misguided`
**Does NOT break on:** Time gaps between events
**XP Bonus payouts (to the opportunity directly):**
```
Streak 3:  +15 XP
Streak 7:  +35 XP
Streak 15: +75 XP
Streak 30: +150 XP
```
**Visual:** Number with subtle upward indicator on opportunity card

### 2. Mastery Streak
**Tracks:** Consecutive `well_done` choices only
**Breaks on:** Anything below `well_done`
**Shown:** Only when active and ≥ 3. Hidden when broken.
**Purpose:** Feeds trait unlock calculations. Not a direct XP reward.

### 3. Recovery Streak
**Tracks:** After a `didnt_try` or `misguided`, count of consecutive `tried` or `well_done` before next failure
**XP Bonus:** +40 XP flat on the first `tried` or `well_done` after any failure (the comeback bonus)
**Personal best:** Stored per opportunity. Breaking personal best awards +40 XP bonus
**Visual:** "Recovery best: N" shown on expanded opportunity card

### 4. Breadth Streak
**Tracks:** Count of distinct situations handled with `tried` or `well_done` within rolling 7-day window
**Scope:** Global, not per opportunity
**Resets:** Weekly (configurable start day, default Sunday midnight)
**XP Bonus:** If breadth reaches 7 distinct situations in one week → +100 XP split equally across all active opportunities
**Visual:** Single number on character header "Breadth: N"

### 5. Failure Run
**Tracks:** Consecutive `didnt_try` or `misguided` on same situation or opportunity
**Shown:** Quietly on the opportunity/situation card when active. Not alarming.
**Breaks on:** Single `tried` or `well_done` — immediately and visibly
**Feeds:** Boss encounter tension meter directly
**No additional XP penalty** beyond base event XP

### 6. Real Life Streak
**Tracks:** Consecutive real-flagged situation events globally
**Breaks on:** Any event logged on a meta-flagged situation
**XP Bonus:** At 5 consecutive real events, next real event gets +20 XP bonus
**Visual:** "Real streak: N" on character header

### 7. Login Streak
**Tracks:** Consecutive days of app login
**Breaks on:** Missed day
**Milestone rewards:**
```
7 days:   +25 XP across all active opportunities
30 days:  +100 XP across all active opportunities
100 days: +300 XP across all active opportunities
365 days: +1000 XP across all active opportunities
```
**Visual:** Shown in character header and referenced in daily narrative

---

## Boss Encounters (Game Mode Only)

### What triggers a boss

**Situation Boss:** Failure run of 5+ consecutive `didnt_try` or `misguided` on same situation
**Opportunity Boss:** Net XP declining trend over last 20+ events on that opportunity (losses outweighing gains)

Multiple bosses can be active simultaneously. No cap.

### Tension meter
Two-sided tug-of-war meter. Not a health bar.

```
FEAR, ANXIETY
Grip    ████████░░  ░░░████  Resistance
        Failure run: 6      Attempt streak: 0
        Last well done: 23 days ago
```

**Grip grows with:** Each consecutive failure, time elapsed since last success, high difficulty setting on situation
**Resistance grows with:** Each `tried` or `well_done`, recovery streak, attempt streak

### Boss dissolution
When resistance exceeds grip consistently (5+ consecutive successes after boss activation), boss enters weakening state. After 5 consecutive successes while weakening, boss dissolves. Dissolution is animated — card fades out over 1.5 seconds.

### Boss naming
Named directly after the situation or opportunity title. No fictional names.
- Situation boss: "[Situation Title] is winning."
- Opportunity boss: "Your [Opportunity Title] is under pressure."

### Boss location
Bottom section of progress page (The Frontier). Visually distinct darker tone.

---

## Traits System (Game Mode Only)

Traits are permanent passive descriptors. They appear on the character header. They never disappear once unlocked. They are written as identity statements, not achievement names.

### Unlock conditions
Every trait requires three independent conditions met simultaneously. Conditions use only: level reached, streak lengths, event counts, real event ratio, path choices, time minimums. No content categorization.

### Trait list

**Steady**
Statement: "You return to calm when most don't."
Conditions:
- Any opportunity with Emotional path chosen at level 7+ (Practicing I or above)
- Attempt streak ≥ 7 on that same opportunity at any point
- ≥ 20 total events logged

**Forged**
Statement: "Difficulty is where you do your best work."
Conditions:
- ≥ 15 `well_done` choices on situations with difficulty 4 or 5
- No failure run longer than 4 in last 60 days
- Any opportunity at level 7+ (Practicing I or above)

**The Returner**
Statement: "You fall. You come back. Every time."
Conditions:
- Recovery streak personal best ≥ 8 on any opportunity
- ≥ 5 distinct recovery streaks completed across all opportunities
- Any opportunity at level 4+ (Learning I or above)

**Broadminded**
Statement: "You show up for all of it, not just the easy parts."
Conditions:
- Breadth streak of 7 achieved in ≥ 3 separate weeks
- ≥ 10 distinct situations logged with real flag (isMeta = false)
- No single situation comprising > 40% of total events

**Grounded**
Statement: "You know where you stand."
Conditions:
- Any opportunity at level 7+ with Emotional or Behavioral path chosen
- Real event ratio > 60% globally
- ≥ 30 total events logged

**Relentless**
Statement: "You don't stop. Not really."
Conditions:
- Any opportunity at level 13+ (Practicing III or above)
- Attempt streak ≥ 15 ever achieved on any opportunity
- ≥ 50 total events logged

**The Adaptor**
Statement: "Change doesn't destabilize you anymore."
Conditions:
- Any opportunity at level 7+ with Behavioral or Cognitive path chosen
- ≥ 10 distinct situations logged with real flag
- Attempt streak across ≥ 10 distinct situations ever achieved (breadth attempt tracking)

**Unguarded**
Statement: "You stopped hiding from the hard feelings."
Conditions:
- Any opportunity with Emotional path chosen at level 4+
- Real event ratio on Emotional-path opportunities > 70%
- ≥ 20 total events on Emotional-path opportunities

**The Long Game**
Statement: "You understand that slow is fast."
Conditions:
- Any opportunity at level 10+ (Capable I or above)
- App used across ≥ 90 calendar days (from first event to present)
- No single week with > 15 events logged (prevents grinding)

**Clear**
Statement: "When others spiral, you find the thread."
Conditions:
- Any opportunity with Cognitive path chosen at level 7+
- Mastery streak ≥ 5 on that opportunity at any point
- ≥ 10 total `well_done` choices across all events

### Trait display
- Maximum 4 traits shown on character header as short text chips
- If more than 4 unlocked, most recently earned shows
- Tapping header expands to full trait list with unlock date and full statement
- Trait unlock triggers single vibration + fade-in on character header

---

## Archetype System (Game Mode Only)

Derived from top 3 opportunities by XP gained in the rolling last-30-day window. Recalculated monthly.

Display: One or two word label derived from the three opportunity titles. No hidden mapping — user can tap archetype label to see exactly which three opportunities generated it.

Implementation: Show top 3 opportunity names in the tap-to-expand detail. The "archetype label" is simply the top opportunity's title shortened or abbreviated. Keep it simple — do not attempt to derive fictional archetype names. "Your top: Discipline, Resilience, Courage" is sufficient.

---

## Global Depth Level (Game Mode Only)

Single number representing total weighted XP across all opportunities:
```
depthXP += event_xp_awarded * difficulty_weight
```
Where `difficulty_weight = 1 + (difficulty - 1) * 0.15`

Always climbing. No ceiling. Displayed on character header.

---

## Random Challenges (Game Mode Only)

Not assigned. Pattern-surfaced. Shown in The Frontier section below boss encounters. Only one active at a time. Sometimes absent — absence is itself meaningful.

Three types, checked in priority order:

**Resurgence** (lowest priority)
Trigger: Situation not logged in ≥ 21 days
Text: "[Situation title] hasn't come up in a while. It's probably still out there."

**Edge** (medium priority)
Trigger: Opportunity closest to next level label (within 10% of XP threshold)
Display: Subtle visual highlight on that opportunity card for 48 hours. No text label on the challenge itself.

**Reversal** (highest priority)
Trigger: Failure run reaches exactly 5 on any situation or opportunity
Text: "This one keeps winning."

---

## Narrative System

Three narrative types. All template-based, no AI. Stored in chronological archive on analytics page. User toggles between Daily / Weekly / Monthly view. Previous narratives scrollable.

Minimum events required: Daily ≥ 1, Weekly ≥ 3, Monthly ≥ 10. Below threshold, no narrative generated for that period — absence is honest.

### Template assembly
Each narrative has three slots: Opening, Body, Closing. Each slot has multiple condition-gated variants. System picks first matching variant per slot. If no variant matches, slot is skipped. Max 6 sentences total per narrative.

All opportunity and situation names are inserted verbatim from user's data. Level labels inserted verbatim from path system. This is what makes the output feel personal.

---

### Daily Narrative

**Opening — what happened today**

```
IF only real events:
  "Today you met life directly. {N} real moments, logged as they happened."

IF mix real and meta:
  "Today had {N} moments — some lived, some reflected on."

IF only meta events:
  "Today was for thinking. {N} reflections logged."

IF single event only:
  "One moment today. {SituationTitle}. You chose {ChoiceLabel}."

IF high difficulty situation logged (difficulty 4-5):
  "You faced something hard today. {SituationTitle} doesn't get easier — you just get better at it."
```

**Body — what the data shows**

```
IF level label changed today:
  "Your {OpportunityTitle} moved. {OldLabel} is behind you. {NewLabel} is where you are now."

ELSE IF attempt streak milestone hit today (3, 7, 15, 30):
  "{OpportunityTitle} — {N} in a row. That's not luck."

ELSE IF recovery after failure run today:
  "After {N} difficult moments with {SituationTitle}, today you chose differently."

ELSE IF boss grip increased today:
  "{SituationTitle} is still winning. The run is at {N}."

ELSE IF boss resistance grew today:
  "You pushed back against {SituationTitle} today. The grip loosened slightly."

ELSE IF trait unlocked today:
  "Something crystallized today. You are {TraitName}."

ELSE:
  "Nothing dramatic. You showed up, logged it, moved on. That consistency is the whole thing."
```

**Closing — one quiet observation**

```
IF real ratio today > 70%:
  "More living than thinking today. Good."

ELSE IF meta ratio today > 70%:
  "Heavy on reflection today. The balance will find itself."

ELSE IF login streak milestone hit today:
  "{N} days in a row. The habit is real."

ELSE:
  "One day in the record. It adds up."
```

---

### Weekly Narrative

**Opening — the week's shape**

```
IF total events >= 10:
  "A full week. {N} moments logged across {distinctSituationCount} different situations."

IF total events 3-6 AND real ratio > 60%:
  "A quiet week in the app. {N} real moments — enough to matter."

IF meta ratio > 60%:
  "This week lived mostly in reflection. {metaCount} reflections, {realCount} real moments."

IF best XP week ever:
  "Your best week yet. {totalXP} earned. Something shifted."
```

**Body slot 1 — biggest movement**

```
Most XP gained single opportunity this week:
  "{OpportunityTitle} moved the most this week — {XPgained} earned across {N} events."
```

**Body slot 2 — pattern**

```
IF attempt streak extended past milestone this week:
  "Your {OpportunityTitle} attempt streak reached {N}. You haven't stopped yet."

ELSE IF breadth target hit (7 distinct):
  "{N} different situations handled with at least an attempt this week. Wide range."

ELSE IF breadth < 3 distinct situations:
  "Narrow week — mostly {topSituationTitle}. Deep focus, or just what life handed you."

ELSE IF new boss emerged this week:
  "{SituationTitle} became something harder this week. {N} consecutive difficult moments."

ELSE IF boss dissolved this week:
  "{SituationTitle} is behind you. {N} events to break it. It's gone."

ELSE IF level label changed this week:
  "{OpportunityTitle} crossed a threshold. You are {NewLabel} now."

ELSE IF recovery streak personal best broken this week:
  "After falling, you came back {N} times before slipping again. Your longest recovery yet."
```

**Closing — weekly identity**

```
IF trait unlocked this week:
  "You earned {TraitName} this week. It was already true. Now it's named."

ELSE IF real ratio > 65%:
  "More action than reflection this week. The balance was right."

ELSE:
  "Seven days. This is what they looked like."
```

---

### Monthly Narrative

Up to 8 sentences. Most reflective tone.

**Opening — the month's identity**

```
IF same top 3 opportunities all month:
  "For a full month, {Op1}, {Op2} and {Op3} defined your engagement. You are consistently building in one direction."

ELSE IF top opportunity changed mid-month:
  "Something changed mid-month. The first half was shaped by {OldTopOp}. The second by {NewTopOp}."

ELSE IF best XP month ever:
  "{totalXP} earned. {totalEvents} moments logged. Your most engaged month yet."

ELSE IF most events ever month:
  "You showed up {N} times this month. More than any month before."
```

**Body slot 1 — biggest movement**

```
Highest XP gain single opportunity:
  "{OpportunityTitle} grew more than anything else — {XPgained} this month. {CurrentLabel}. It shows."

ELSE IF most improved real ratio vs last month:
  "You brought more of your life into this. Real events up from {oldPct}% to {newPct}%."

ELSE IF longest attempt streak achieved this month:
  "Your {OpportunityTitle} attempt streak reached {N} this month. Sustained."

ELSE IF new trait unlocked:
  "{TraitName} emerged this month. The conditions were met — not quickly, but honestly."
```

**Body slot 2 — honest observation**

```
IF active boss at month end:
  "{SituationTitle} is still unresolved. {N} encounters this month."

ELSE IF failure run active on any opportunity at month end:
  "{OpportunityTitle} is under pressure. The trend over {N} events hasn't turned yet."

ELSE:
  "Nothing is winning against you right now. That's not nothing."

IF real ratio < 40%:
  "More thinking than acting this month. The reflection is real — so is the imbalance."
```

**Body slot 3 — the growth edge**

```
IF opportunity within 10% of next level label:
  "{OpportunityTitle} is close to {NextLabel}. {XPremaining} more and it moves."

ELSE IF opportunity with zero events all month:
  "{OpportunityTitle} was quiet this month. Not lost — just waiting."

ELSE IF login streak milestone passed:
  "{N} consecutive days this month. The practice is becoming structural."
```

**Closing — monthly identity statement**

```
IF real ratio > 65% AND no active bosses AND any attempt streak active:
  "This month you were someone who faced things and kept going."

ELSE IF active boss AND any recovery streak present AND real ratio > 50%:
  "This month you were someone in a real fight, who kept showing up anyway."

ELSE IF meta ratio > 60% AND trait unlocked this month:
  "This month was more reflection than action — but something crystallized that couldn't have come any other way."

ELSE IF breadth streak hit 7 in 2+ weeks this month:
  "This month you were wide rather than deep. All of life got some of your attention."

ELSE:
  "This is one month of your record. It is exactly what it is."
```

---

## Pages

### 1. Add Event (modified in game mode)

Standard flow unchanged. Game mode additions:

After situation is selected:
- Show current attempt streak for that situation if ≥ 3: "Attempt streak: {N}"
- Show failure run if active: "Failure run: {N}"
- Show boss indicator if situation has active boss (subtle, no text — small visual mark)

XP preview shown before choice selection:

**Standard mode:**
```
Well Done    +10 XP
Tried        +4 XP
Didn't Try   -2 XP
Misguided    -5 XP
```

**Game mode, real situation (isMeta = false):**
```
Well Done    +20 XP  ⚡
Tried        +8 XP   ⚡
Didn't Try   -2 XP
Misguided    -5 XP
```

**Game mode, meta situation (isMeta = true):**
```
Well Done    +10 XP
Tried        +4 XP
Didn't Try   -2 XP
Misguided    -5 XP
```

The ⚡ indicator is small and inline. No explanatory text needed after first use.

Choice labels displayed (same in both modes):
- Well Done
- Tried
- Didn't Try
- Misguided Action

---

### 2. Progress Page

**Standard mode:** Existing page, unchanged.

**Game mode:** Full overhaul. Three sections in single vertical scroll. No tabs.

#### Visual language (game mode)
- Background: deep slate (#1a1f2e or similar, not pure black)
- Text: warm off-white (#e8e4dc)
- XP bars: 2px height, thin and precise
- Level labels: slightly heavier font weight than surrounding text
- Path icons: muted, symbolic, not cartoonish
- Grip/resistance meters: amber (#c8a84b) for grip, slate-blue (#4a6fa5) for resistance
- Corner radius: 8px max
- No cartoon elements, no excessive color

#### Section 1 — Character Header

```
╔════════════════════════════════╗
║                                ║
║   {Archetype}                  ║
║   Depth {N} XP                 ║
║                                ║
║   ← {Badge} {Badge} {Badge} →  ║
║      (horizontal scroll)       ║
║                                ║
║   {Trait} · {Trait}            ║
║                                ║
║   Breadth: {N}  ·  Real: {N}   ║
╚════════════════════════════════╝
```

- Archetype: top opportunity title this month, shortened if needed
- Depth XP: global weighted XP, always climbing
- Badges: scroll horizontally, each shows `{pathIcon} {OpportunityTitle} — {LevelLabel}`
- Traits: max 4 shown as subtle text chips, most recently earned
- Tapping header expands to: full trait list with unlock dates and full trait statements, archetype explanation (which 3 opportunities generated it)

#### Section 2 — Opportunities

Vertical scrollable list. Grouped silently by most recently active (no group labels). Cards:

**Collapsed card:**
```
┌────────────────────────────────┐
│ {icon}  {OPPORTUNITY TITLE}    │
│         {Path name}   {LevelLabel}│
│         ████████░░░░  {XP}/{next}│
│                                │
│         ↑ Attempt: {N}         │
│         ↑ Mastery: {N}  (if active) │
│         ↺ Recovery best: {N}   │
└────────────────────────────────┘
```

- Failure run shown only when active, with subtle left border color shift (amber)
- Mastery streak shown only when ≥ 3

**Expanded card (tap to expand):**
```
┌────────────────────────────────┐
│ {icon}  {OPPORTUNITY TITLE}    │
│         {Path name}   {LevelLabel}│
│         ████████░░░░  {XP}/{next}│
│                                │
│         ↑ Attempt: {N}         │
│         ↑ Mastery: {N}         │
│         ↺ Recovery best: {N}   │
│         Failure run: —         │
│                                │
│  XP history sparkline          │
│  ▁▂▃▄▅▆▇█▇▆                   │
│  Last event: {N} days ago      │
│  Total events: {N}             │
│  Real events: {N} ({pct}%)     │
│                                │
│  Next level: {NextLabel}       │
│  Needs {N} more XP             │
│                                │
│  {PathName} path               │
│  {PathPhilosophy one-liner}    │
└────────────────────────────────┘
```

#### Section 3 — The Frontier

Visually separated from Section 2 by thin divider and slight background tone shift (darker). No section header label needed — the visual change signals descent.

**Boss cards:**
```
┌────────────────────────────────┐
│  {SITUATION TITLE}             │
│  Situation boss                │
│                                │
│  Grip    ███████░░░            │
│          ░░░░████  Resistance  │
│                                │
│  Failure run: {N}              │
│  Last well done: {N} days ago  │
└────────────────────────────────┘
```

Weakening boss: slightly lower opacity, grip bar visibly shorter.

**Random challenge** (below boss cards, if active):
Single line of plain text. No label, no border. Just the observation.

---

### 3. History Page

Standard mode: unchanged.
Game mode: same as standard, no additions needed.

---

### 4. Analytics Page

Two sections. No usage limit.

**Section 1 — Narrative**
Toggle: Daily | Weekly | Monthly
Current narrative displayed in clean readable text.
Below: scrollable archive, chronological, oldest at bottom.
Archive entries show date header + narrative text.
No editing, no deletion.

**Section 2 — Stats**
Clean numbers. Charts collapsed by default, expandable per section.

Sub-sections:
- Overall: total events, total XP, login streak, real vs meta ratio, depth level
- Per opportunity: XP over time (sparkline), event count, streak history
- Per situation: encounter count, choice distribution (4 choices as percentages), current streak state
- Breadth: distinct situations per week over time
- Boss history (game mode only): past bosses, duration, what choice broke them

---

### 5. Customize Page

**Situations:** Add/edit title, description, difficulty (1-5), tags, isMeta toggle (Real/Meta), thought pairs (back/forth), linked opportunities.

**Opportunities:** Add/edit title, tags. In game mode additionally: path selection UI showing all 4 paths with name, one-liner philosophy, and full label progression preview. Path locked after level 3 (show lock indicator, no edit possible).

**Settings:** Game mode toggle (on/off). Week start day. Other existing settings.

**Data management:** Merge opportunities (combine XP, redirect event links to survivor). Rename (propagates everywhere). Archive (removes from active views, preserves all history). Delete (hard to access, confirmation required, permanent).

---

## Animations (Game Mode Only)

All animations are understated. Silence is part of the design language.

- **After logging event:** Relevant opportunity card pulses once on return to progress page
- **XP bar fill:** Smooth fill animation when returning to progress page
- **Level label change:** Old label fades out, new label fades in (crossfade)
- **Trait unlock:** Appears in header with single short device vibration
- **Boss dissolution:** Card fades out over 1.5 seconds
- **No other animations**

---

## Storage

All data stored in localStorage (PWA, no backend).

Suggested key structure:
```
lpt_situations      → Situation[]
lpt_opportunities   → Opportunity[]
lpt_events          → Event[]
lpt_game_profile    → GameProfile
lpt_narratives      → { daily: Narrative[], weekly: Narrative[], monthly: Narrative[] }
lpt_settings        → Settings
```

Streaks are computed from event history on load, not stored separately — except personal bests (stored in GameProfile) and login streak (stored in GameProfile with lastLoginDate).

---

## Computation Notes

### Streak computation
On app load or after event log, recompute:
1. Per-opportunity attempt streak: walk events newest to oldest, count consecutive tried/well_done
2. Per-opportunity mastery streak: same, well_done only
3. Per-opportunity failure run: walk newest to oldest, count consecutive didnt_try/misguided
4. Per-opportunity recovery streak: find last failure, count consecutive successes after it
5. Breadth: count distinct situationIds with tried/well_done in last 7 days
6. Real life streak: walk all events newest to oldest, count consecutive real-situation events

### Boss computation
On each event log:
1. Check failure run per situation → if ≥ 5, activate situation boss
2. Check net XP trend per opportunity over last 20 events → if negative, activate opportunity boss
3. Recompute grip/resistance ratio for active bosses

### Trait computation
Check trait conditions after every event log. Conditions are deterministic and fast — no expensive operations. Unlock immediately when all three conditions met. Store unlock timestamp.

### Narrative generation
Generated on-demand when user opens analytics page and time threshold passed (daily: new calendar day, weekly: new week, monthly: new month). Walk through template slots in order, pick first matching variant, assemble string. Store result with timestamp.

---

## Implementation Priority Order

1. XP system with real/meta flag and choice values
2. Path system with level labels and prestige
3. Progress page overhaul (game mode)
4. Streak computation and display
5. Login streak and XP
6. Boss encounters
7. Traits
8. Narrative system (daily first, then weekly, monthly)
9. Random challenges
10. Analytics page stats section
11. Archetype and depth level
12. Merge/archive data management
13. Animations

---

## Explicit Non-Features (Do Not Implement)

- No AI or LLM calls anywhere
- No mapping of user content to internal hidden categories
- No action prompts or commitment mechanics
- No seasonal chapters or chapter-based content
- No compound resonance XP multiplier
- No user-facing value cluster labels
- No fictional archetype names beyond top opportunity title
- No analytics usage limits
- No push notifications or reminders
- Standard mode pages must remain pixel-identical to current implementation when game mode is off

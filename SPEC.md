# Spec: Classroom Seating Organizer

Status: **Approved — v1 built** (`seating.html`, tests in `tests.mjs`)

## Objective

A single HTML file a teacher opens in a browser to plan a classroom seating chart. The teacher
enters students and their needs, describes the room as a grid, and gets an arrangement that:

1. puts students with seating **priorities** (e.g. glasses, hearing, attention) near the front,
2. keeps students with **conflicts** apart,
3. keeps students who **work well together** close,

and can then fine-tune it by hand.

### User stories

- As a teacher, I can set the grid size (rows × columns) and mark individual cells as *desk* or
  *empty* (aisle, pillar, gap), so the grid matches my real room.
- As a teacher, I can set **how many seats each row has** (e.g. fewer at the front, more at the
  back); the desks are centred in the row and the column count is the maximum per row.
- As a teacher, I can see which side is the front (board / teacher desk).
- As a teacher, I can add students one at a time, or a whole class by pasting names (one per line).
- As a teacher, I can tag a student with priorities (glasses, hearing, mobility/near door, …) and
  add my own custom tags.
- As a teacher, I can mark two students as a **conflict** pair or a **good together** pair.
- As a teacher, I can press **Auto-arrange** and get a seating plan that respects the rules as well
  as possible.
- As a teacher, I can drag students between seats, swap them, and **lock** a seat so auto-arrange
  leaves it alone.
- As a teacher, I can see at a glance which rules are broken (highlighted seats + a list of issues).
- As a teacher, my work is still there when I reopen the file, and I can export/import it as a
  JSON file (backup, move to another computer). **One class per file/state** — for a second class
  I export the current one and start fresh or import another.
- As a teacher, I can undo/redo any change (manual moves, auto-arrange, edits) with buttons and
  Ctrl+Z / Ctrl+Y.
- As a teacher, I can print the plan cleanly.

## Assumptions

1. One self-contained `seating.html` — no install, no server, no build step; works offline by
   double-clicking it. No external libraries.
2. Modern desktop browsers (Chrome, Firefox, Edge, Safari). Phone/tablet usable but not optimised.
3. Data never leaves the computer: saved in the browser's `localStorage` plus JSON export/import.
   (Student names are personal data — nothing is sent anywhere.)
4. The grid is rectangular; irregular rooms are modelled by marking cells empty.
5. "Front" is the top row of the grid by default (can be flipped).
6. Class size up to ~40 students, grid up to ~12 × 12.
7. **The entire UI is in German** — all labels, buttons, messages, issue texts, default tags
   (e.g. „Brille", „Hörgerät", „Nähe zur Tür"), print view, and file names of exports
   (e.g. `sitzplan-7b.json`). Code identifiers and comments stay in English.

## Rules model

| Rule | Kind | Meaning |
|---|---|---|
| Priority tag (e.g. glasses) | soft, strong | Seat in the front *N* rows (N configurable per tag, default 2). Score penalty grows with distance from front. |
| Conflict pair | soft, strongest | Must be at least *d* seats apart, where *d* is set **per conflict** (default 1 = not in the 8 surrounding cells; 2 = at least one seat between them; …). Penalty grows the closer they are. |
| Good-together pair | soft, medium | Reward for being direct neighbours (left/right), smaller reward for diagonal/front-back. |
| Locked seat | hard | Auto-arrange never moves that student. |

- **Distance** = Chebyshev distance on the grid (max of row and column difference), so distance 1 = the 8 surrounding cells. Empty cells between two desks still count as
  distance (an aisle separates students).
- All rules are scored together; auto-arrange minimises total penalty. When rules can't all be met
  (e.g. 10 glasses-wearers, 6 front seats), it produces the best compromise and lists what's broken.
- Weights for each rule type are adjustable with sliders in a settings panel.

## Auto-arrange algorithm

1. Place locked students.
2. Greedy seed: priority students into front seats first, then the rest randomly.
3. Improve with simulated annealing over random swaps (including swaps with empty desks), a few
   thousand iterations, keeping the best score seen. Runs in well under a second for 40 students.
4. Every click on „Automatisch verteilen“ uses a new random seed, so it doubles as „neu mischen“.
   „Plätze leeren“ takes all unlocked students off their seats.

## UI layout

```
┌──────────────────────────────────────────────────────────────┐
│ Klasse: [7b]  [Auto-Verteilen] [Neu mischen] [↶][↷] [Drucken] [Export] [Import] │
├───────────────────────┬──────────────────────────────────────┤
│ Students              │            ▬▬▬ FRONT / BOARD ▬▬▬       │
│  + add / paste list   │   [Anna👓] [Ben  ] [    ] [Cem  ]      │
│  Anna   👓  🔒         │   [Dana ] [Emil ] [    ] [Finn❗]      │
│  Ben                  │   [ ... grid of seats ... ]            │
│  ...                  │                                        │
│ Relationships         │  Issues (2):                           │
│  ✖ Ben – Finn          │   • Ben and Finn sit next to each other│
│  ♥ Anna – Dana         │   • Cem (glasses) is in row 4          │
│ Room                  │                                        │
│  rows [5] cols [6]    │                                        │
│  edit desks mode      │                                        │
│ Settings (weights)    │                                        │
└───────────────────────┴──────────────────────────────────────┘
```

- Seats show name + small icons for tags. Broken rules → red outline; satisfied good pair → subtle
  link indicator.
- Hover/click a student → highlight their conflict (red) and good-together (green) partners on
  the grid.
- "Edit room" mode: clicking a cell toggles desk ↔ empty. Resizing keeps existing placements that
  still fit; students in removed cells go back to the unseated list.
- Unseated students shown in a tray; drag from tray to a seat.

## Data model (saved as JSON)

```json
{
  "version": 1,
  "className": "7b",
  "grid": { "rows": 5, "cols": 6, "front": "top", "empty": ["0,2", "1,2"] },
  "tags": [{ "id": "glasses", "label": "Brille", "icon": "👓", "frontRows": 2 }],
  "students": [{ "id": "s1", "name": "Anna", "tags": ["glasses"], "note": "" }],
  "relations": [{ "a": "s2", "b": "s6", "type": "conflict", "minDistance": 2 },
                { "a": "s1", "b": "s4", "type": "together" }],
  "seats": { "0,0": "s1" },
  "locked": ["s1"],
  "weights": { "priority": 5, "conflict": 10, "together": 3 }
}
```

## Project structure

```
seating-organizer/
  SPEC.md        → this document
  seating.html   → the whole app (HTML + CSS + JS inline)
  tests.mjs      → `node tests.mjs`; unit tests for the logic block extracted from seating.html
```

## Code style

Plain modern JavaScript (ES2020), no frameworks. State lives in one object; every change goes
through a small set of functions that update state, save, and re-render.

```js
function scoreArrangement(cls) {
  let penalty = 0;
  for (const rel of cls.relations) {
    const d = seatDistance(cls, rel.a, rel.b);
    if (rel.type === 'conflict' && d <= 1) penalty += cls.weights.conflict;
    if (rel.type === 'together') penalty -= togetherBonus(d) * cls.weights.together;
  }
  return penalty;
}
```

Pure logic (scoring, distance, arrange) is kept separate from DOM code so it can be tested.

## Testing strategy

- `tests.mjs` (run with `node tests.mjs`): extracts the `<script id="logic">` block from
  `seating.html` and runs a tiny assert runner over it. It covers distance/neighbour logic, scoring, that
  auto-arrange never moves locked students, never seats a conflict pair together when a valid
  arrangement exists, and fills front rows with priority students when seats allow.
- Manual browser check of each user story before calling it done.

## Boundaries

- **Always:** keep it one dependency-free file; keep data local; keep JSON export backward
  compatible (versioned).
- **Ask first:** adding any external library/CDN; changing the data format in a breaking way.
- **Never:** send student data anywhere; require a server.

## Success criteria

1. Opening `seating.html` from disk works with no network.
2. Grid can be resized and cells toggled empty; changes reflected instantly.
3. With a sample class (25 students, 3 glasses, 3 conflicts, 3 good pairs, 5×6 grid), auto-arrange
   produces zero violations in < 1 s.
4. When rules are impossible to satisfy, the issues list says which ones and why.
5. Drag-and-drop swap and lock work; locked students stay put across auto-arrange.
6. Reload keeps everything; export → import round-trips to an identical plan.
7. Print view shows only the grid with names, fitting one landscape page.
8. Undo/redo steps correctly through at least 50 changes.
9. Pasting 25 names (one per line) creates 25 students; blank lines and duplicates are ignored/flagged.

## Decisions (from review)

- Layout: free grid, every cell is a seat or empty.
- Conflict distance: configurable per conflict pair.
- One class per file (no class switcher).
- v1 extras: paste name list, print view, undo/redo. Gender-alternation rule: not in v1.
- UI language: German.

## Deviations from the draft (made during build)

- Tests are a Node script (`tests.mjs`) instead of `tests.html`: browsers block reading the app
  file from a second page opened via `file://`, so the browser-only version couldn't share code.
- No separate "Shuffle" button: auto-arrange already gives a new variant on every click.
- Added a „Beispielklasse laden“ button (shown only while the class is empty) for trying it out.
- Clicking a free desk while a student is selected moves them there (alternative to dragging).

## Added after v1

- App name: „Sitzplan*omat*“ (shown in the header, browser tab and printout).
- Conflict pairs that sit too close: red border on both + red dotted box around the pair;
  missed front-row priorities shown in amber.
- Name cards: every student gets a random animal emoji (unique within the class while the 60
  animals last, stored in the plan so reprints match). „Namenskarten drucken“ prints 8 cut-out
  cards per A4 page (name, animal, class, small seat hint), sorted front row first. Animals can be
  rerolled for one student (click it in the list) or for everyone.
- Help: a „?“ button beside „Automatisch verteilen“ opens a 7-step guide. On the very first start
  (empty plan, tour not yet seen) an interactive 10-step tour runs instead: it spotlights each part
  of the page, asks the user to actually do each step (add a student, set a tag, add a relation,
  auto-arrange), shows ✓ when done, and can be skipped or replayed from the guide. Later empty
  plans open the static guide.
- Font: Ubuntu (Regular, Bold, Bold Italic) is embedded in the file as subset WOFF2 (~155 KB,
  Ubuntu Font Licence permits document embedding), so it looks the same on every computer, offline.
- Emoji: only Unicode Emoji 11 (2018) or older are used so nothing shows as an empty box on
  Windows 10 (hearing tag is now 👂 instead of 🦻; old plans are migrated on load). Emoji still
  follow each system's own emoji style.

## Out of scope for v1

Multiple classes in one file, paired/group-table modes, gender alternation, mobile-optimised layout.

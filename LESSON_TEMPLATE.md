# How to build the next lesson (copy-the-prototype guide)

Every lesson in this course is one self-contained HTML file. `serverless-deep-dive.html`
(bonus lesson: functions, triggers, pay-per-use) is the reference prototype — copy it,
rename it, swap the content. No build step, no framework, no new services.

## The 10-minute copy

1. Copy `serverless-deep-dive.html` to your new file name (conventions below).
2. Change only these, top to bottom:
   - `<title>` and the topnav `.mid` label
   - Hero: `<h1>`, `.sub`, the chips (badge, objective, length), and the agenda table rows
   - The `--wk` color in `:root` if the lesson belongs to a different week
     (W1 `#0f8b8d` teal, W2 blue, W3 amber, W4 `#7b5ea7` violet — see any session file)
   - Segment headings/bodies, labs, walkthrough, AI block, quiz, discussion, exit ticket
3. Link it from `index.html` by copying any `<a class="sess" …>` line in the matching
   week block and editing href/title/tags.
4. Open the file in a browser and run the validation checklist below.

You do **not** need to change: the `<style>` block, the core framework `<script>`,
or the localStorage key — `PKEY` derives from the file name automatically, so each
lesson gets its own saved progress, polls, and quiz state for free.

## Anatomy (what each part is for)

| Part | Markup | Rule |
|---|---|---|
| Topnav | `.topnav` with `#scoreChip` | Keep the hub link + score chip; update the label and prev/next links |
| Hero | `.hero`, `.chip`, `.agenda` | One sentence promise + agenda a student can scan in 10 seconds |
| Warm-up | `.poll` / `.popt` / `.pollwhy` | No wrong answers; the `.pollwhy` carries the teaching point |
| Myth flips | `.flipgrid` / `.flip` (+ `.back`) | Front = misconception, back = reality in one sentence |
| Sort lab | `.matcher` / `.mcard[data-match]` / `.mzone[data-zone]` / `.mstatus` | Every card's `data-match` must equal its zone's `data-zone` |
| Worked walkthrough | normal cards inside `.capstone` | Show **every** number: event → units → unit price → total → argue the opposite. Never state a total without its arithmetic |
| AI concept | `.card.ai` | One real AI idea taught *through* the week's cloud objective, with copy-paste tutor prompts (`.promptbox`) and a fact-check step |
| Quiz | `.quiz` → `.q[data-a]` → 4× `.opt` + `.expl` + `.qresult` | See answer rules below |
| Discussion / exit | `textarea[data-persist]` | `data-persist` keys must be unique per page; answers save automatically |

## Answer rules (auto-checking, zero infrastructure)

- `data-a` is the **0-based index** of the correct option (A=0, B=1, C=2, D=3).
- Clicking checks instantly in the page — right/wrong highlighting, explanation reveal,
  running score in `.qresult` and the topnav chip. Nothing leaves the browser.
- Every `.expl` starts `Answer: X.` and then explains **all four** options
  (✔ why the key is right, ✘ why each other option fails). Students learn from misses.
- Keep answer letters varied across the quiz; story-problem stems, workplace settings.
- Last two questions test the day's AI concept, like every session in this course.
- Optional: instructor submission. Session pages add a name field + submit button
  (`#studentName`, `#submitQuizBtn`, `#submitStatus`) that posts chosen answers to the
  course endpoint for server-side marking. Checking never depends on it — leave it out
  and the lesson still grades itself in-page.

## Naming conventions

- Core sessions: `weekN-sessionM.html` (e.g. `week4-session12.html`)
- Standalone deep dives / bonus lessons: `topic-deep-dive.html`
  (e.g. `sso-token-deep-dive.html`, `serverless-deep-dive.html`)
- Homework and project material stay under `homework/` and `project/`.

## Validation checklist (2 minutes, before committing)

- [ ] File opens from disk and renders styled (hero, cards, chips) — not bare HTML
- [ ] Both warm-up polls accept a vote and reveal their explanation
- [ ] Every flip card flips; every matcher card can be placed (all zones reachable)
- [ ] Answer all quiz questions: score bar, scoreline, and topnav chip all update
- [ ] Get one wrong on purpose: explanation appears and names the correct letter —
      and that letter matches the option the page highlights
- [ ] Any calculator/custom interactive runs with the worked example's numbers and
      reproduces the walkthrough's total
- [ ] Reload: progress persists; “Reset my progress on this page” clears it
- [ ] `index.html` link opens the new file

## Generating exercises with AI (how the prototype's were drafted)

1. Prompt for story problems, not definitions: “Write 8 workplace scenarios testing
   [topic]; one unambiguously best answer each; explain all four options.”
2. Demand the arithmetic be shown for any numeric item, then **recompute it yourself**
   before pasting — the page's credibility is the numbers.
3. Vary the key letters, then set `data-a` from your verified key — never let the
   generator assign the key unchecked.
4. Read every explanation aloud once. If a distractor is arguably right, rewrite the
   stem until only one answer survives scrutiny.

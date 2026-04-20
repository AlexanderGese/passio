# Seed catalog — 100 free + 25 paid

Ideas grouped by category. "Free" = small enough to ship as a hobby contribution to the Orchard. "Paid" = deep enough to charge for; price tag is my starting bet (you can test WTP by pricing one tier higher and dropping after 30 days).

## Free seeds (100)

### Widgets (header/corner chips) — 15
1. **clock-sync** — atomic clock drift indicator
2. **moon-phase** — tiny moon glyph + phase name
3. **stock-ticker** — one symbol, 24h change
4. **crypto-ticker** — BTC/ETH price
5. **timezone-ring** — 3 cities' current time in a row
6. **pomodoro-chip** — header version of the pomodoro ring
7. **battery-chip** — laptop battery with trend arrow
8. **ping-chip** — round-trip to a host, colored
9. **commute-chip** — home→work ETA via OSM
10. **air-quality** — AQI for your city
11. **standup-countdown** — minutes until your next daily standup
12. **rain-warning** — precipitation in the next 2h
13. **meeting-soon** — red chip when next meeting <5min
14. **water-reminder** — 90-min water drip ring
15. **current-sprint-day** — "day 3/14 of sprint"

### Inbox / communications — 10
16. **slack-unread** — unread count per channel
17. **discord-mentions** — @ mentions count
18. **telegram-bridge** — send/receive via saved-messages
19. **signal-bridge** — signal-cli wrapper
20. **email-scheduler** — send email at X
21. **email-undo-send** — 30s hold before SMTP sends
22. **email-snooze** — archive + reappear at date
23. **mail-digest** — 8am summary of yesterday's mail
24. **smart-bcc** — auto-BCC yourself based on rules
25. **vcard-attacher** — drop a signature block into drafts

### News / feeds — 10
26. **hn-pulse** (already ships) — top 5 HN
27. **lobsters-pulse** — lobsters front page
28. **reddit-digest** — subreddit hot picks
29. **rss-digest** — morning read across your RSS
30. **github-trending** — language-filtered
31. **arxiv-fresh** — today's papers in your field
32. **podcast-new-episodes** — RSS-based
33. **youtube-subs** — new uploads from subscriptions (RSS)
34. **obsidian-starred** — feeds from star.md files
35. **twitter-bookmarks** — via RSS-bridge

### Calendar / time — 8
36. **weekly-review** — templated journal prompt Friday 17:00
37. **monthly-review** — first Sunday template
38. **birthdays** — ICS birthdays → morning chip
39. **time-box-timer** — 50-min blocks with 10-min breaks
40. **flow-timer** — 90-min deep-work timer
41. **meetings-this-week** — listed with prep notes
42. **no-meeting-wednesdays** — nudge if you schedule one
43. **calendar-heatmap** — 12-week activity grid

### Developer — 12
44. **github-pr-dashboard** — mine + review-requested
45. **github-issues-assigned** — mine across repos
46. **git-repo-health** — uncommitted, unpushed, dirty
47. **branch-age-warn** — branches >30 days old
48. **npm-outdated** — direct deps with upgrades
49. **cargo-outdated** — Rust equivalent
50. **eslint-on-save** — run on vault code files
51. **commit-message-coach** — draft a conventional-commit message
52. **pr-description-writer** — uses the diff
53. **git-stash-browser** — list + re-apply
54. **lang-learner** — flashcards of new language keywords
55. **api-latency-watch** — ping your endpoints, chart

### Research / knowledge — 10
56. **pdf-drop** — drag PDF into bubble, ingest to vault
57. **highlighter** — selected text → vault note
58. **citation-formatter** — APA/MLA from DOI
59. **wiki-grab** — URL → distilled note
60. **yt-transcript** — youtube URL → vault note
61. **glossary** — track term → definition
62. **quote-collector** — save + tag quotes
63. **question-log** — daily open questions
64. **ideas-parking-lot** — capture + tag
65. **book-reading-tracker** — books you're reading + progress

### Productivity — 10
66. **habit-tracker** — light, streaks, 7-day grid
67. **weekly-goal-recap** — Friday auto-send of the week
68. **daily-intent** — morning "what matters today" prompt
69. **eisenhower-sorter** — drop todos into quadrants
70. **anti-distraction-timer** — block distracting domains for N min
71. **focus-playlist** — spotify deep-work playlist trigger
72. **morning-routine** — step-by-step guided routine
73. **evening-routine** — mirror of morning
74. **journaling-prompt** — daily prompt rotated from a pool
75. **mood-tracker** — 1-5 scale, trend graph

### Fun / personality — 10
76. **compliment-fairy** — random compliment on boot (once/day)
77. **mood-emoji** — cycle the avatar's mood
78. **weather-haiku** — generate a haiku about today's weather
79. **word-of-the-day** — from Merriam-Webster RSS
80. **on-this-day** — your vault notes from N years ago
81. **desktop-wallpaper-rotator** — from a folder
82. **screen-time-shame** — nice, funny nudges
83. **fake-coworker** — pretend-present Slack status toggle
84. **rubber-duck-button** — press to explain what you're stuck on, logged
85. **curiosity-log** — what did you learn today

### Integrations — 10
86. **notion-mirror** — two-way Notion DB ↔ vault
87. **linear-triage** — your assigned issues
88. **jira-stand-up** — yesterday/today/blockers
89. **trello-board** — list view of one board
90. **airtable-query** — saved queries
91. **spotify-now-playing** — chip + save-to-liked
92. **lastfm-scrobble** — nothing to do, just show
93. **strava-week** — km run/ridden this week
94. **weight-tracker** — Apple Health / Fitbit import
95. **sleep-score** — Oura / Fitbit pull

### Meta / devops — 5
96. **seed-playground** — live-reload scratchpad
97. **seed-doctor** — check installed seeds for missing permissions
98. **vault-link-doctor** — broken [[wiki-links]] finder
99. **secret-audit** — unused secrets in vault
100. **log-tailer** — tail app logs in a tab

---

## Paid seeds (25)

Prices in USD one-time unless noted. My rationale for each price.

### Tier: $5–10 — quick polish over something most people do manually

| # | Name | Price | Why it sells |
|---|---|---|---|
| 1 | **pomodoro-plus** | $5 | Logs every session to vault + weekly report. People who love pomodoro love metrics |
| 2 | **clipboard-plus** | $5 | History + pins + snippet expansion (typed keyword → expand). Basic clipboard managers are $10+ on every platform |
| 3 | **screenshot-commander** | $7 | Region + annotate + OCR + save to vault with tags. Flameshot-in-Passio |
| 4 | **typing-coach** | $7 | WPM + heatmap + error-correction assistant while you type in any app |
| 5 | **window-layouter** | $9 | Save window arrangements as "contexts" (work, play, focus), restore with one click |

### Tier: $10–20 — replaces a paid SaaS you already pay for

| # | Name | Price | Why it sells |
|---|---|---|---|
| 6 | **gmail-triage** | $15 | Cuts inbox time 15+ min/day. Shipped as first paid seed; $15 is SuperHuman-lite pricing |
| 7 | **meeting-summarizer** | $19 | Mic → diarized transcript → summary → vault → action-item todos. Otter/Fireflies are $20/mo |
| 8 | **calendar-coach** | $15 | Weekly calendar optimizer with frameworks (blocks, buffers, deep-work) |
| 9 | **reading-companion** | $15 | PDF ingest + chat + vault notes + spaced-repetition cards |
| 10 | **research-compounder** | $19 | Multi-source research → structured doc with citations |
| 11 | **focus-gatekeeper** | $12 | Hard-block distracting sites during focus sessions (with "I agreed" gate) |
| 12 | **email-drafter-pro** | $15 | Context-aware reply drafts with your past-reply style memory |

### Tier: $25–40 — deep work, real value, targeted professionals

| # | Name | Price | Why it sells |
|---|---|---|---|
| 13a | **reddit-command** | $29 | Full Reddit remote: submit/comment/vote/search/inbox + AI autopilot with hard daily caps. Shipped. |
| 13b | **x-command** | $39 | Full X remote with OAuth 1.0a signing in-seed. Shipped. X API costs are the user's problem. |
| 13 | **salesforce-assistant** | $29 | Account lookup + call prep + post-call logging |
| 14 | **lawyer-privilege-mode** | $39 | HIPAA/privilege-preserving seed: local-only memory, audit log, export pack |
| 15 | **therapist-session-notes** | $39 | SOAP templates + secure vault + session audio (local-only) |
| 16 | **freelancer-invoice** | $25 | Track time → generate PDF invoice → log to vault; integrates stripe-lite |
| 17 | **shopify-supportline** | $29 | Pulls Shopify support queue; drafts replies; logs to vault |
| 18 | **dev-daily-log** | $25 | Pulls git commits + PRs + issues + calendar → daily log entry in vault |

### Tier: $40–75 — premium, opinionated, picky audiences

| # | Name | Price | Why it sells |
|---|---|---|---|
| 19 | **study-buddy-pro** | $49 | Flashcards + exam prep + spaced rep + calendar blocks + analytics |
| 20 | **writing-studio** | $59 | Distraction-free writer + outline + research side-pane + draft→publish workflow |
| 21 | **interview-prep** | $49 | Tech interviews: problem bank, pattern notes, mock sessions logged |
| 22 | **newsletter-studio** | $69 | Ideas → drafts → schedule → export to Substack/beehiiv. For creators |
| 23 | **business-intel** | $69 | Pulls Google Analytics / Plausible / Stripe / Linear into one daily brief |
| 24 | **language-tutor-japanese** | $49 | JLPT-N5→N2 structured progression; pairs well with passio's existing lang-learner goal |
| 25 | **legal-research** | $75 | State-law corpus search (US-only initially); prompt templates for briefing |

### Recurring-revenue alternatives (pick one flagship, if you want subscriptions)

- **gmail-triage** — $5/mo — better for the long tail vs $15 one-time
- **meeting-summarizer** — $7/mo
- **research-compounder** — $9/mo
- **business-intel** — $15/mo
- **legal-research** — $25/mo (law firms will pay per-month forever)

Subscriptions are higher effort: you need webhook-driven license re-issuance. Start with one-time until one of the one-time Seeds has >100 sales, then consider flipping that one to monthly.

## Revenue math (rough)

A plausible 12-month scenario if you ship ~5 paid seeds in the first quarter and 3–5 more every quarter:

| Seed | Price | 12-month sales estimate | Revenue |
|---|---|---|---|
| gmail-triage | $15 | 150 | $2,250 |
| meeting-summarizer | $19 | 100 | $1,900 |
| research-compounder | $19 | 80 | $1,520 |
| calendar-coach | $15 | 60 | $900 |
| pomodoro-plus | $5 | 200 | $1,000 |
| clipboard-plus | $5 | 120 | $600 |
| reading-companion | $15 | 80 | $1,200 |
| screenshot-commander | $7 | 100 | $700 |
| writing-studio | $59 | 20 | $1,180 |
| therapist-session-notes | $39 | 10 | $390 |

Rough total: **~$11,640/yr** from 10 paid seeds with zero marketing spend. If one hits (viral tweet, HN front page, a lifestyle-design YouTuber picks it up), multiply by 5–10×.

That's not life-changing on its own — but it's a real-revenue flywheel that compounds as you add seeds and as users tell friends. Plus every paid seed doubles as a showcase for the Passio platform, which feeds free-seed adoption, which grows the paid funnel.

## Go-to-market — which 3 to ship first

Start with three that:
- You'd personally use every day (motivation sustains)
- Are independently valuable (not dependent on each other)
- Span price tiers (learn WTP fast)

My picks:
1. **gmail-triage** — $15 — broad appeal, clear value
2. **meeting-summarizer** — $19 — growing category
3. **pomodoro-plus** — $5 — volume entry point

Ship in that order, 3–4 weeks between launches. Track: installs (free tier), paid conversions, refund rate, NPS via a 1-question `passio.bubble.speak` after 7 days of use.

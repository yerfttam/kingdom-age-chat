# Kingdom Age Wiki — Schema & Structure

This document defines the structure of the Kingdom Age wiki. It is read by the LLM during ingest to ensure consistency across all pages. Follow it exactly.

---

## Categories

Every wiki page belongs to exactly one of these categories:

| Category | What it covers |
|---|---|
| `Concepts` | Core theological ideas central to Kingdom Age teaching (e.g., "The Kingdom of God", "The Seed", "Sonship") |
| `Teachings` | Specific doctrinal positions or emphases that recur across Kingdom Age teaching (e.g., "Living by Christ", "Organic Church Life") |
| `Biblical Texts` | Key passages of Scripture and how they are interpreted and applied in Kingdom Age teaching |
| `Series` | A named video or teaching series, summarizing its arc and key themes |
| `Entities` | People, ministries, or movements referenced in the content (e.g., "Immanuel Sun", "Kingdom Age Ministry") |
| `Prophetic` | Visions, prophetic words, and revelatory experiences shared by teachers or members in the content |

---

## Page Format

Every page must follow this exact markdown structure:

```markdown
## Summary

2–3 sentences. What is this concept/teaching/entity? State it plainly and precisely as Kingdom Age would understand it — not a generic evangelical definition.

## Key Points

- Bullet list of the most important things taught about this topic across all sources.
- Each bullet is a distinct, concrete point — not a restatement of the summary.
- Aim for 4–8 bullets. Merge redundant points across sources rather than listing them separately.
- Quote a teacher directly when they have a particularly sharp or distinctive way of phrasing something. Attribute the quote by name when the speaker is identifiable.

## Cross-References

- [[slug-of-related-page]] — one-line explanation of the relationship
- [[another-slug]] — one-line explanation

Cross-references use double-bracket wiki link syntax. Only link to pages that genuinely illuminate this one — not every related topic.

## Sources

- video:{video_id} — {video title}
- post:{post_url} — {post title}
- pdf:seed_ch{N} — The Seed, Chapter {N}
```

---

## Slugs

- Lowercase, hyphen-separated, no special characters
- Derived from the page title: "The Kingdom of God" → `the-kingdom-of-god`
- Must be unique across all pages
- For entities: `person-immanuel-sun`, `ministry-kingdom-age`
- For biblical texts: `scripture-john-15`, `scripture-genesis-1`
- For series: `series-the-seed-teachings`
- For prophetic entries: `vision-{short-description}`, e.g. `vision-the-two-trees`, `vision-army-of-overcomers`

---

## Tags

Tags are used for filtering and discovery. Each page should have 3–8 tags chosen from the list below. Add new tags only if none of the existing ones fit.

**Theological themes:**
`kingdom`, `seed`, `sonship`, `church-life`, `spiritual-warfare`, `prayer`, `grace`, `faith`, `transformation`, `organic-growth`, `new-creation`, `the-spirit`, `christ-as-life`, `overcomers`, `new-testament`, `old-testament`, `prophecy`, `end-times`, `worship`, `discipleship`, `ministry`, `authority`, `suffering`, `resurrection`

**Prophetic:**
`vision`, `dream`, `prophetic-word`, `revelation`, `angelic`, `heavenly-realm`, `intercession`, `spiritual-sight`

**Content types:**
`foundational`, `advanced`, `practical`, `devotional`, `expository`, `series-overview`

---

## Ingest Rules

1. **One page per concept** — do not create separate pages for the same concept covered in multiple sources. Update the existing page instead.
2. **Synthesize, don't transcribe** — wiki pages are synthesized knowledge, not sermon notes. Remove filler, repetition, and tangents.
3. **Kingdom Age voice** — preserve the distinctive theological framing of Kingdom Age teaching. Terms like "seed", "kingdom", "organic", and "life" carry specific meanings here. Do not flatten these into generic evangelical meanings. Immanuel Sun was a foundational teacher who passed away; his teachings are still central, but Kingdom Age has multiple teachers whose voices belong in the wiki equally.
4. **Cross-references over repetition** — if a concept is explained on another page, reference it rather than re-explaining it.
5. **Source every claim** — every Key Point should be traceable to at least one source in the Sources section.
6. **Minimum bar** — do not create a page unless there is enough content for a meaningful Summary + at least 3 Key Points. Thin content should be merged into a broader page.
7. **Series pages** — summarize the arc of the series, not individual episodes. Individual episode insights belong on Concept or Teaching pages. IMPORTANT: before creating a new Series page, check the existing slug list carefully — if a series page for this content already exists under any slug variation, use that slug instead of creating a new one. Do not create multiple series pages for the same series.
8. **Prophetic pages** — each vision or prophetic word gets its own page. Preserve the narrative of the vision as the speaker told it, then add a "Significance" section explaining the theological interpretation given. Identify the speaker by name if known. Do not merge multiple visions into one page.

---

## Example Page

```markdown
---
slug: the-seed
title: The Seed
category: Concepts
tags: [seed, kingdom, sonship, new-creation, foundational]
sources:
  - pdf:seed_ch1
  - pdf:seed_ch2
  - video:abc123
---

## Summary

"The Seed" refers to the divine life of God implanted in the human spirit at regeneration — specifically, Christ Himself as the life-seed (Col. 1:27). Kingdom Age teaching draws this primarily from the Parable of the Sower and John 12:24, treating the seed not as a metaphor for the gospel message but as the very person of Christ taking root in man.

## Key Points

- The seed is Christ as life, not merely a teaching or a decision. Receiving the seed means Christ enters and inhabits the human spirit.
- Growth is organic, not mechanical — the seed must have the right conditions (good soil = an open, exercised spirit) to germinate and grow.
- The seed contains the full nature of what it will become: the kingdom of God is already present in seed form wherever Christ indwells a believer.
- Immanuel Sun distinguishes between "seed-life" (the indwelling Christ) and "fruit" (the outward expression of that life) — many Christians have the seed but never bear fruit because the seed is suppressed.
- Death is necessary for the seed to release its life: "Unless a grain of wheat falls into the earth and dies, it remains alone" (John 12:24). Suffering and the cross are not obstacles to the seed's growth but the very conditions for it.

## Cross-References

- [[sonship]] — the seed grows toward full sonship; maturity is the goal of the seed
- [[organic-church-life]] — the community context in which seeds grow together
- [[suffering-and-the-cross]] — death of the outer man as the condition for the seed's release

## Sources

- pdf:seed_ch1 — The Seed, Chapter 1
- pdf:seed_ch2 — The Seed, Chapter 2
- video:abc123 — "The Seed and the Kingdom" (YouTube)
```

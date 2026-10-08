---
name: tix-stories
description: Write, estimate, plan and update stories in Tix, the personal tracker, using its MCP tools. Use whenever the user asks to add, change, split, find or plan work in Tix, or mentions a space such as French, GCP, DSAI, AWS, Coding or My Job.
---

# Writing stories for Tix

Tix holds every area of the user's life as a **space** (FR French, GCP, DSAI, AWS, CODE Coding,
JOB My Job, and any they add). Work is Space, then Epic, then Story, Task, Bug or Spike, then
Subtask. All spaces share one sprint.

## The one rule that comes first

**Always show drafts in chat and create only after the user says yes.** Never call
`create_issues`, `split_issue`, `update_issue`, `move_issue` or `plan_sprint` on your own
initiative. Draft, ask, then act. If they change something, show the new draft and ask again.

## Picking the space

1. Call `list_spaces` to see the real keys and epics.
2. Pick the space from context ("French", "DELF", "B1" mean FR; "my job", "work" mean JOB).
3. If it is unclear, ask. **Never invent a new space**; the user adds spaces in the app.
4. Put story level issues under an epic when one fits; name it by key or exact title.

## Story format

- **Title:** short, plain words, starts with a verb: "Book the DELF exam date".
- **Description:** "As a ..., I want ..., so that ...".
- **Acceptance criteria:** 2 to 5, each one testable: someone could say yes or no to it.
  Good: "Exam date chosen and fee paid". Weak: "Make progress on the exam".
- Use **task** for a chore with no user value statement, **bug** for something broken,
  **spike** for time boxed research, **subtask** for a step inside a story.

## Estimating

Points measure effort and uncertainty, not hours. Use only 1, 2, 3, 5, 8.

| Points | Example                                                                       |
| ------ | ----------------------------------------------------------------------------- |
| 1      | Book an exam date; renew a document online                                    |
| 2      | Read one chapter and take notes; take one practice test                       |
| 3      | Finish one course section; a small script with tests                          |
| 5      | Complete a textbook unit with exercises; build a small feature end to end     |
| 8      | A multi part piece of work: a full mock exam with marking; a home lab network |

**Anything bigger than 8 gets split.** Propose the split, and after approval use `split_issue`.
Epics and subtasks never carry points. If you cannot estimate, leave points empty and say why.

## Planning a sprint

1. Call `get_sprint` with `"next"` (or plan from scratch with `plan_sprint` after approval).
2. Read `velocity`: the average points finished over the last three sprints. Keep the plan near
   it. Before any history exists, suggest 20 points for 2 weeks or 10 for 1 week.
3. Start with carried over items. Mention issues that slipped before.
4. Capacity is a guide: going over is allowed, but say so plainly.

## Writing style

Plain words, short sentences. **No dashes** of any kind in titles, descriptions or criteria;
use commas, colons or separate sentences instead.

## After acting

Report the keys Tix returned (for example "Created FR-15") so the user can find them. If a tool
returns an error, read it, fix the draft, and ask again if the fix changes what they approved.

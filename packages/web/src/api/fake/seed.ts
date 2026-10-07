// Demo data taken from the mockups, so every screen has something real to show.
// Dates are relative to today: Sprint 4 always started 4 days ago, so the board,
// "days left" and velocity look right whenever the app is opened.

import { generateNKeysBetween } from "fractional-indexing";
import { addDays, sprintEndDate, today } from "../../lib/dates";
import type {
  Actor,
  Issue,
  IssueEvent,
  IssueType,
  Outcome,
  Points,
  Priority,
  Settings,
  Space,
  Sprint,
  SprintIssue,
  Status,
} from "../types";
import type { Db } from "./db";

const SPACES: Omit<Space, "id" | "nextNumber" | "archived">[] = [
  {
    key: "JOB",
    name: "My Job",
    color: "#64748b",
    description: "Work tasks beside everything else",
  },
  {
    key: "FR",
    name: "French",
    color: "#3b74d6",
    description: "Goal: reach B1 and pass the DELF exam",
  },
  { key: "GCP", name: "GCP", color: "#2a9d68", description: "Cloud platform work and modules" },
  { key: "DSAI", name: "DSAI", color: "#8b5cd6", description: "Data science and AI study" },
  { key: "AWS", name: "AWS", color: "#e08a1e", description: "SAA certification and home lab" },
  {
    key: "CODE",
    name: "Coding",
    color: "#d6466f",
    description: "Side projects, dotfiles, practice",
  },
  { key: "CERT", name: "Certifications", color: "#1aa3a3", description: "Terraform Associate" },
  { key: "LIFE", name: "Personal admin", color: "#b8952a", description: "Documents and finances" },
];

interface Def {
  key: string;
  type: IssueType;
  title: string;
  parent?: string; // key of the epic (or story, for subtasks)
  points?: Points;
  status?: Status;
  sprint?: number; // sprint number the issue currently sits in
  by?: Actor;
  priority?: Priority;
  description?: string;
  criteria?: [string, boolean][];
}

// Order here is backlog rank order.
const ISSUES: Def[] = [
  // ---- My Job
  { key: "JOB-1", type: "epic", title: "Q4 deliverables" },
  {
    key: "JOB-2",
    type: "task",
    title: "Prepare quarterly review slides",
    parent: "JOB-1",
    points: 3,
    priority: "high",
  },
  {
    key: "JOB-3",
    type: "story",
    title: "Automate the weekly report export",
    parent: "JOB-1",
    points: 5,
  },
  { key: "JOB-4", type: "bug", title: "Dashboard date filter ignores time zone", parent: "JOB-1" },

  // ---- French
  { key: "FR-1", type: "epic", title: "Reach B1 by March" },
  { key: "FR-2", type: "epic", title: "Speaking practice" },
  { key: "FR-3", type: "epic", title: "Vocabulary" },
  {
    key: "FR-4",
    type: "story",
    title: "Finish Alter Ego units 7 to 9",
    parent: "FR-1",
    points: 5,
    status: "in_progress",
    sprint: 4,
    description:
      "As a French learner, I want to complete units 7 to 9 so that I cover the B1 grammar the DELF exam expects.",
    criteria: [
      ["All exercises in units 7 to 9 are done and checked against the key", false],
      ["Audio tracks for each unit listened to twice", true],
      ["Unit tests scored 70% or higher", false],
    ],
  },
  {
    key: "FR-5",
    type: "subtask",
    title: "Unit 7 exercises and audio",
    parent: "FR-4",
    status: "done",
  },
  {
    key: "FR-6",
    type: "subtask",
    title: "Unit 8 exercises and audio",
    parent: "FR-4",
    status: "in_progress",
  },
  { key: "FR-13", type: "subtask", title: "Unit 9 exercises and audio", parent: "FR-4" },
  {
    key: "FR-7",
    type: "story",
    title: "Daily 20 minute listening for 4 weeks",
    parent: "FR-1",
    points: 3,
    sprint: 4,
    by: "claude",
  },
  {
    key: "FR-8",
    type: "task",
    title: "Book DELF B1 exam date",
    parent: "FR-1",
    points: 1,
    status: "done",
    sprint: 4,
  },
  {
    key: "FR-12",
    type: "task",
    title: "Do a full DELF B1 mock exam",
    parent: "FR-1",
    points: 3,
    by: "claude",
  },
  {
    key: "FR-11",
    type: "story",
    title: "Learn 200 words from the work vocabulary deck",
    parent: "FR-3",
    points: 5,
  },
  {
    key: "FR-14",
    type: "story",
    title: "Shadow one podcast episode a week",
    parent: "FR-2",
    points: 3,
  },
  {
    key: "FR-9",
    type: "story",
    title: "Two conversation sessions a week",
    parent: "FR-2",
    points: 3,
  },
  {
    key: "FR-10",
    type: "story",
    title: "Record a 2 minute self introduction",
    parent: "FR-2",
    points: 2,
    sprint: 5,
    by: "claude",
  },
  { key: "FR-15", type: "task", title: "Review 50 irregular verbs", parent: "FR-3", points: 2 },
  { key: "FR-16", type: "task", title: "Write a short letter each week", parent: "FR-3" },

  // ---- GCP
  { key: "GCP-1", type: "epic", title: "IAP Enablement" },
  { key: "GCP-2", type: "epic", title: "Cloud Run module" },
  { key: "GCP-3", type: "epic", title: "DNA templates" },
  { key: "GCP-4", type: "epic", title: "Prod perf audit" },
  {
    key: "GCP-15",
    type: "story",
    title: "Create the Cloud Run module skeleton",
    parent: "GCP-2",
    points: 5,
    status: "done",
    sprint: 1,
  },
  {
    key: "GCP-16",
    type: "task",
    title: "Add CI checks for the module",
    parent: "GCP-2",
    points: 3,
    status: "done",
    sprint: 1,
  },
  {
    key: "GCP-17",
    type: "story",
    title: "Support secrets in the Cloud Run module",
    parent: "GCP-2",
    points: 5,
    status: "done",
    sprint: 2,
  },
  {
    key: "GCP-19",
    type: "task",
    title: "Tag module release v0.2",
    parent: "GCP-2",
    points: 3,
    status: "done",
    sprint: 2,
  },
  {
    key: "GCP-20",
    type: "task",
    title: "Draft the IAP rollout plan",
    parent: "GCP-1",
    points: 2,
    status: "done",
    sprint: 2,
  },
  {
    key: "GCP-22",
    type: "story",
    title: "Refactor certificate handling in Cloud Run module",
    parent: "GCP-2",
    points: 5,
    status: "done",
    sprint: 3,
  },
  {
    key: "GCP-24",
    type: "story",
    title: "Add variables for custom domain mapping",
    parent: "GCP-2",
    points: 5,
    status: "done",
    sprint: 3,
  },
  {
    key: "GCP-25",
    type: "task",
    title: "Write the Cloud Run module README",
    parent: "GCP-2",
    points: 2,
    status: "done",
    sprint: 3,
  },
  {
    key: "GCP-26",
    type: "story",
    title: "Expose private key variable in Cloud Run module",
    parent: "GCP-2",
    points: 5,
    status: "done",
    sprint: 4,
  },
  {
    key: "GCP-29",
    type: "story",
    title: "Enable IAP on the Cloud Run backend service",
    parent: "GCP-1",
    points: 5,
    status: "in_progress",
    sprint: 4,
    by: "claude",
  },
  {
    key: "GCP-31",
    type: "story",
    title: "Bind Okta group to IAP access policy",
    parent: "GCP-1",
    points: 3,
    sprint: 4,
    by: "claude",
  },
  {
    key: "GCP-37",
    type: "story",
    title: "Test IAP login with two pilot users",
    parent: "GCP-1",
    points: 2,
    sprint: 5,
  },
  {
    key: "GCP-38",
    type: "bug",
    title: "Knowledge Catalog lake naming breaks in prod folder",
    parent: "GCP-3",
  },
  {
    key: "GCP-40",
    type: "story",
    title: "Recreate product performance services in the new project",
    parent: "GCP-4",
    points: 8,
  },
  {
    key: "GCP-39",
    type: "task",
    title: "Document the IAP rollout steps",
    parent: "GCP-1",
    points: 2,
  },
  {
    key: "GCP-41",
    type: "spike",
    title: "Compare lake layouts for the DNA templates",
    parent: "GCP-3",
    points: 3,
  },

  // ---- DSAI
  { key: "DSAI-1", type: "epic", title: "Python for data" },
  { key: "DSAI-2", type: "epic", title: "Intro to ML" },
  {
    key: "DSAI-4",
    type: "task",
    title: "Set up the Python environment",
    parent: "DSAI-1",
    points: 5,
    status: "done",
    sprint: 3,
  },
  {
    key: "DSAI-3",
    type: "task",
    title: "Complete pandas chapter exercises",
    parent: "DSAI-1",
    points: 3,
    status: "in_progress",
    sprint: 4,
  },
  {
    key: "DSAI-5",
    type: "story",
    title: "Build a regression notebook on a public dataset",
    parent: "DSAI-2",
    points: 8,
  },
  {
    key: "DSAI-6",
    type: "task",
    title: "Read chapter 3 of the statistics book",
    parent: "DSAI-2",
    points: 2,
  },
  {
    key: "DSAI-7",
    type: "story",
    title: "Plot a dataset with matplotlib",
    parent: "DSAI-1",
    points: 3,
  },

  // ---- AWS
  { key: "AWS-1", type: "epic", title: "SAA certification" },
  { key: "AWS-2", type: "epic", title: "Home lab" },
  {
    key: "AWS-3",
    type: "task",
    title: "Finish the EC2 section of the SAA course",
    parent: "AWS-1",
    points: 3,
    status: "done",
    sprint: 1,
  },
  {
    key: "AWS-5",
    type: "task",
    title: "Take SAA practice test 1",
    parent: "AWS-1",
    points: 3,
    status: "done",
    sprint: 2,
  },
  {
    key: "AWS-6",
    type: "task",
    title: "Finish IAM section of the SAA course",
    parent: "AWS-1",
    points: 3,
    sprint: 4,
  },
  {
    key: "AWS-8",
    type: "story",
    title: "Build a VPC with public and private subnets in the home lab",
    parent: "AWS-2",
    points: 5,
  },
  {
    key: "AWS-9",
    type: "task",
    title: "Take SAA practice test 2",
    parent: "AWS-1",
    points: 2,
    by: "claude",
  },
  {
    key: "AWS-4",
    type: "story",
    title: "Set up billing alerts and budgets",
    parent: "AWS-2",
    points: 5,
  },
  { key: "AWS-7", type: "task", title: "Read the S3 storage classes whitepaper", parent: "AWS-1" },

  // ---- Coding
  { key: "CODE-1", type: "epic", title: "Tix app" },
  { key: "CODE-2", type: "epic", title: "Dotfiles" },
  { key: "CODE-3", type: "epic", title: "LeetCode" },
  {
    key: "CODE-4",
    type: "task",
    title: "Move shell config into a dotfiles repo",
    parent: "CODE-2",
    points: 2,
    status: "done",
    sprint: 1,
  },
  {
    key: "CODE-6",
    type: "task",
    title: "Sync dotfiles to the new laptop",
    parent: "CODE-2",
    points: 2,
    status: "done",
    sprint: 2,
  },
  {
    key: "CODE-7",
    type: "story",
    title: "Write the Tix design doc",
    parent: "CODE-1",
    points: 3,
    status: "done",
    sprint: 3,
  },
  {
    key: "CODE-10",
    type: "task",
    title: "Set up Tix repo and CI",
    parent: "CODE-1",
    points: 2,
    status: "done",
    sprint: 4,
    by: "claude",
  },
  {
    key: "CODE-12",
    type: "story",
    title: "Open PR for the Tix CLI create command",
    parent: "CODE-1",
    points: 3,
    status: "in_review",
    sprint: 4,
    by: "claude",
  },
  {
    key: "CODE-14",
    type: "story",
    title: "Add burndown chart to Tix",
    parent: "CODE-1",
    points: 5,
    sprint: 5,
  },
  {
    key: "CODE-5",
    type: "story",
    title: "Solve 10 medium array problems",
    parent: "CODE-3",
    points: 3,
  },
  {
    key: "CODE-11",
    type: "story",
    title: "Tix backlog screen with drag to rank",
    parent: "CODE-1",
    points: 5,
  },
  {
    key: "CODE-13",
    type: "story",
    title: "Keyboard shortcuts for Tix",
    parent: "CODE-1",
    points: 3,
  },
  { key: "CODE-8", type: "task", title: "Add zsh aliases for git", parent: "CODE-2", points: 1 },
  { key: "CODE-9", type: "story", title: "Solve 5 graph problems", parent: "CODE-3" },

  // ---- Certifications
  { key: "CERT-1", type: "epic", title: "Terraform Associate" },
  {
    key: "CERT-2",
    type: "task",
    title: "Install Terraform and run the tutorial",
    parent: "CERT-1",
    points: 2,
    status: "done",
    sprint: 1,
  },
  {
    key: "CERT-3",
    type: "task",
    title: "Watch course modules 1 to 3",
    parent: "CERT-1",
    points: 2,
    status: "done",
    sprint: 2,
  },
  {
    key: "CERT-4",
    type: "story",
    title: "Build a module with remote state",
    parent: "CERT-1",
    points: 5,
  },
  { key: "CERT-5", type: "task", title: "Take practice exam 1", parent: "CERT-1", points: 3 },
  { key: "CERT-6", type: "task", title: "Book the exam", parent: "CERT-1" },

  // ---- Personal admin
  { key: "LIFE-1", type: "epic", title: "Documents" },
  { key: "LIFE-2", type: "epic", title: "Finances" },
  {
    key: "LIFE-4",
    type: "task",
    title: "Set up a monthly budget sheet",
    parent: "LIFE-2",
    points: 3,
    status: "done",
    sprint: 2,
  },
  {
    key: "LIFE-5",
    type: "task",
    title: "Scan passport and ID",
    parent: "LIFE-1",
    points: 2,
    status: "done",
    sprint: 3,
  },
  { key: "LIFE-3", type: "task", title: "Renew driver's licence", parent: "LIFE-1", points: 1 },
  { key: "LIFE-6", type: "task", title: "File last year's receipts", parent: "LIFE-2", points: 2 },
];

// sprint_issues rows for issues that did not finish, plus everything in Sprint 4.
// Issues finished in a sprint get an outcome "done" row automatically.
const UNFINISHED: [sprint: number, key: string, outcome: Outcome][] = [
  [1, "GCP-17", "carried_over"],
  [1, "CODE-5", "returned"],
  [1, "LIFE-3", "returned"],
  [2, "FR-12", "returned"],
  [2, "AWS-4", "returned"],
  [3, "GCP-26", "carried_over"],
  [3, "FR-12", "returned"],
];

const GOALS = [
  "Get the Cloud Run module started and pick up the SAA course",
  "Ship module v0.2 and plan the IAP rollout",
  "Close the Cloud Run module refactor and start Python for data",
  "Start the IAP rollout and keep French daily",
  "Finish IAP rollout and keep French daily",
];

export function buildSeed(): Db {
  const now = new Date().toISOString();
  const s4Start = addDays(today(), -4);

  const spaces: Space[] = SPACES.map((s, i) => ({
    ...s,
    id: i + 1,
    nextNumber: 1,
    archived: false,
  }));
  const spaceByKey = new Map(spaces.map((s) => [s.key, s]));

  const sprints: Sprint[] = [1, 2, 3, 4, 5].map((n) => {
    const startDate = addDays(s4Start, (n - 4) * 14);
    const endDate = sprintEndDate(startDate, 2);
    const state = n < 4 ? "completed" : n === 4 ? "active" : "planned";
    return {
      id: n,
      number: n,
      name: `Sprint ${n}`,
      goal: GOALS[n - 1]!,
      lengthWeeks: 2,
      startDate,
      endDate,
      capacity: 30,
      state,
      completedAt: state === "completed" ? `${endDate}T17:00:00.000Z` : null,
    };
  });
  const sprintStart = (n: number) => sprints[n - 1]!.startDate;

  const ranks = generateNKeysBetween(null, null, ISSUES.length);
  const idByKey = new Map(ISSUES.map((d, i) => [d.key, i + 1]));

  // When an issue first entered any sprint, so createdAt can come before it.
  const firstSprint = new Map<string, number>();
  for (const [n, key] of UNFINISHED) {
    firstSprint.set(key, Math.min(n, firstSprint.get(key) ?? n));
  }

  const issues: Issue[] = ISSUES.map((d, i) => {
    const space = spaceByKey.get(d.key.split("-")[0]!)!;
    const status = d.status ?? "todo";
    const sprint = d.sprint ?? null;
    const startN = Math.min(firstSprint.get(d.key) ?? 99, sprint ?? 99);
    const createdDate =
      d.type === "epic"
        ? addDays(sprintStart(1), -7)
        : startN <= 5
          ? addDays(sprintStart(startN), -3)
          : addDays(s4Start, -10);
    const completedAt =
      status === "done" && d.type !== "subtask"
        ? `${addDays(sprintStart(sprint ?? 4), 3 + (i % 7))}T12:00:00.000Z`
        : status === "done"
          ? `${addDays(s4Start, 1)}T12:00:00.000Z`
          : null;

    return {
      id: i + 1,
      key: d.key,
      spaceId: space.id,
      type: d.type,
      parentId: d.parent ? idByKey.get(d.parent)! : null,
      title: d.title,
      description: d.description ?? "",
      acceptanceCriteria: (d.criteria ?? []).map(([text, done]) => ({ text, done })),
      status,
      points: d.points ?? null,
      priority: d.priority ?? "medium",
      labels: [],
      rank: ranks[i]!,
      sprintId: sprint,
      createdBy: d.by ?? "me",
      createdAt: `${createdDate}T09:00:00.000Z`,
      updatedAt: completedAt ?? now,
      completedAt,
      deletedAt: null,
      previousKeys: [],
    };
  });

  // Each space hands out the number after its highest existing key.
  for (const issue of issues) {
    const space = spaces.find((s) => s.id === issue.spaceId)!;
    const n = Number(issue.key.split("-")[1]);
    space.nextNumber = Math.max(space.nextNumber, n + 1);
  }

  const issueByKey = new Map(issues.map((i) => [i.key, i]));
  const sprintIssues: SprintIssue[] = [];
  for (const [n, key, outcome] of UNFINISHED) {
    const issue = issueByKey.get(key)!;
    sprintIssues.push({
      sprintId: n,
      issueId: issue.id,
      pointsAtStart: issue.points,
      outcome,
      movedTo: outcome === "carried_over" ? n + 1 : null,
    });
  }
  for (const issue of issues) {
    if (issue.sprintId === null || issue.sprintId === 5 || issue.type === "subtask") continue;
    const finishedInPast = issue.sprintId < 4 && issue.status === "done";
    sprintIssues.push({
      sprintId: issue.sprintId,
      issueId: issue.id,
      pointsAtStart: issue.points,
      outcome: finishedInPast ? "done" : null, // Sprint 4 is active: no outcome yet
      movedTo: null,
    });
  }

  const events: IssueEvent[] = [];
  for (const issue of issues) {
    events.push({
      id: events.length + 1,
      issueId: issue.id,
      at: issue.createdAt,
      actor: issue.createdBy,
      kind: "created",
      fromValue: null,
      toValue: issue.createdBy === "claude" ? "via Claude" : "from the Create form",
    });
    if (issue.status !== "todo") {
      events.push({
        id: events.length + 1,
        issueId: issue.id,
        at: issue.completedAt ?? `${addDays(s4Start, 1)}T10:00:00.000Z`,
        actor: "me",
        kind: "status",
        fromValue: "todo",
        toValue: issue.status,
      });
    }
  }

  const settings: Settings = {
    theme: "system",
    ollamaUrl: "http://localhost:11434",
    ollamaModel: "qwen2.5:14b",
    capacityDefault: 20,
    insightSprintReview: true,
    insightCheckIn: true,
    insightPlanningHint: true,
    insightPatternReport: false,
  };

  return {
    spaces,
    issues,
    sprints,
    sprintIssues,
    events,
    insights: [
      {
        id: 1,
        kind: "sprint_review",
        sprintId: 3,
        model: "qwen2.5:14b",
        inputHash: "seed",
        body: JSON.stringify({
          achieved:
            "Core of the Cloud Run module refactor landed (GCP-22, GCP-24, GCP-25) and your Python setup is done. 22 points is your best sprint so far, up from 20.",
          notAchieved:
            "GCP-26 (5 pts) moved to Sprint 4. FR-12, the DELF mock exam, went back to the backlog for the second time.",
          worthNoticing:
            "GCP took 55% of done points and French finished nothing. Try putting FR-12 in the first week, or split it into two shorter sittings.",
        }),
        createdAt: sprints[2]!.completedAt!,
      },
    ],
    settings,
  };
}

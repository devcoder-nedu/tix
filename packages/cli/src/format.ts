// Turning issues into terminal text. Colours use Node's built-in styleText,
// which drops them automatically when output goes to a file or a pipe.

import type { Issue, IssueEvent, SpaceSummary } from "@tix/core";
import { stripVTControlCharacters, styleText } from "node:util";

export const STATUS_LABEL: Record<Issue["status"], string> = {
  todo: "To do",
  in_progress: "In progress",
  in_review: "In review",
  done: "Done",
};
const TYPE_LETTER: Record<Issue["type"], string> = {
  epic: "E",
  story: "S",
  task: "T",
  bug: "B",
  spike: "Sp",
  subtask: "st",
};

export const dim = (text: string) => styleText("dim", text);
export const bold = (text: string) => styleText("bold", text);

function status(s: Issue["status"]): string {
  const label = STATUS_LABEL[s];
  if (s === "done") return styleText("green", label);
  if (s === "todo") return dim(label);
  return styleText("blue", label);
}

/** Pad to a width, counting only visible characters (colour codes take no space). */
function pad(text: string, width: number): string {
  const visible = stripVTControlCharacters(text).length;
  return text + " ".repeat(Math.max(0, width - visible));
}

/** One line per issue, columns aligned: key, type, status, points, title. */
export function issueTable(list: Issue[]): string {
  if (list.length === 0) return dim("No issues.");
  const keyWidth = Math.max(...list.map((i) => i.key.length));
  return list
    .map((i) =>
      [
        pad(bold(i.key), keyWidth + 1),
        pad(TYPE_LETTER[i.type], 3),
        pad(status(i.status), 12),
        pad(i.points === null ? dim("-") : String(i.points), 3),
        i.title,
      ].join(" "),
    )
    .join("\n");
}

export function spaceTable(list: SpaceSummary[]): string {
  if (list.length === 0) return dim("No spaces yet. Add one with: tix space add FR French");
  return list
    .map((s) =>
      [
        pad(bold(s.key), 6),
        pad(s.name, 18),
        dim(
          `${s.openCount} open · ${s.epicCount} ${s.epicCount === 1 ? "epic" : "epics"} · ${s.percentDone}% done`,
        ),
      ].join(" "),
    )
    .join("\n");
}

function eventLine(e: IssueEvent): string {
  const when = e.at.slice(0, 10);
  const who = e.actor === "claude" ? " (via Claude)" : "";
  switch (e.kind) {
    case "created":
      return `${when}  Created ${e.toValue ?? ""}${who}`;
    case "status":
      return `${when}  ${STATUS_LABEL[e.fromValue as Issue["status"]]} -> ${STATUS_LABEL[e.toValue as Issue["status"]]}${who}`;
    case "points":
      return `${when}  Points ${e.fromValue ?? "-"} -> ${e.toValue ?? "-"}${who}`;
    case "sprint":
      return `${when}  Sprint ${e.fromValue ?? "backlog"} -> ${e.toValue ?? "backlog"}${who}`;
    case "space":
      return `${when}  Moved ${e.fromValue} -> ${e.toValue}${who}`;
    default:
      return `${when}  Updated${who}`;
  }
}

/** Everything about one issue, for `tix show`. */
export function issueDetail(
  issue: Issue,
  context: { space: string; parent: Issue | null; children: Issue[]; events: IssueEvent[] },
): string {
  const lines = [
    `${bold(issue.key)}  ${dim(`${TYPE_LETTER[issue.type]} in ${context.space}`)}`,
    bold(issue.title),
    "",
    `Status    ${status(issue.status)}`,
    `Points    ${issue.points ?? dim("unestimated")}`,
    `Priority  ${issue.priority}`,
  ];
  if (context.parent) lines.push(`Parent    ${context.parent.key} ${context.parent.title}`);
  if (issue.previousKeys.length) lines.push(`Old keys  ${issue.previousKeys.join(", ")}`);
  if (issue.description) lines.push("", issue.description);

  if (issue.acceptanceCriteria.length) {
    const done = issue.acceptanceCriteria.filter((c) => c.done).length;
    lines.push("", bold(`Acceptance criteria · ${done} of ${issue.acceptanceCriteria.length}`));
    for (const c of issue.acceptanceCriteria) lines.push(`  [${c.done ? "x" : " "}] ${c.text}`);
  }
  if (context.children.length) {
    lines.push(
      "",
      bold(issue.type === "epic" ? "Issues" : "Subtasks"),
      issueTable(context.children),
    );
  }
  if (context.events.length) {
    lines.push("", bold("Activity"), ...context.events.map((e) => dim(eventLine(e))));
  }
  return lines.join("\n");
}

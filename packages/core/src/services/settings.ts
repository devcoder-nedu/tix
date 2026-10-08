// Settings are stored one row per key; callers see one typed object, with
// defaults for anything never saved, so a fresh database works straight away.

import type { Conn } from "../db.ts";
import { settings } from "../schema.ts";
import { parse, settingsInput, type SettingsPatch } from "../validation.ts";

export interface Settings {
  theme: "system" | "light" | "dark";
  ollamaUrl: string;
  ollamaModel: string;
  capacityDefault: number;
  insightSprintReview: boolean;
  insightCheckIn: boolean;
  insightPlanningHint: boolean;
  insightPatternReport: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  ollamaUrl: "http://localhost:11434",
  ollamaModel: "qwen2.5:14b",
  capacityDefault: 20, // the doc's suggestion for a first 2 week sprint
  insightSprintReview: true,
  insightCheckIn: true,
  insightPlanningHint: true,
  insightPatternReport: false, // off by default, as in the doc
};

export function getSettings(conn: Conn): Settings {
  const saved = Object.fromEntries(
    conn
      .select()
      .from(settings)
      .all()
      .map((row) => [row.key, row.value]),
  );
  // Only known keys, so an old setting left in the table can't leak out.
  const result = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
    if (key in saved) (result as Record<string, unknown>)[key] = saved[key];
  }
  return result;
}

export function updateSettings(conn: Conn, input: SettingsPatch): Settings {
  const patch = parse(settingsInput, input);
  conn.transaction((tx) => {
    for (const [key, value] of Object.entries(patch)) {
      // Insert, or replace the value if the key is already there.
      tx.insert(settings)
        .values({ key, value })
        .onConflictDoUpdate({ target: settings.key, set: { value } })
        .run();
    }
  });
  return getSettings(conn);
}

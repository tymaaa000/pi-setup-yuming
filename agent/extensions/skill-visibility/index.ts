/**
 * skill-visibility — keep configured skills out of the model-visible skill list.
 *
 * Pi renders every discovered skill (name, description, location) into the system prompt.
 * This extension marks skills configured in the agent-dir settings.json under `skillful`
 * as `disableModelInvocation`, so Pi leaves them out of the prompt while their
 * `/skill:<name>` commands keep working.
 *
 * Config:
 *   {
 *     "skillful": {
 *       "hideAllSkills": true,
 *       "hiddenSkills": ["metrics", "iterate"]
 *     }
 *   }
 *
 * The handler mutates the mutable `systemPromptOptions.skills` exposed by
 * `before_agent_start` instead of rewriting the rendered prompt text: Pi re-renders the
 * prompt sections from those options, so this keeps working when the prompt format
 * changes and preserves Pi's section-delta behaviour.
 *
 * Regression note: the previous version replaced the rendered prompt with a
 * `\n\n`-anchored regex. Pi renders the section as `<skills>\nThe following skills…`, so
 * the pattern never matched and every hidden skill stayed in the prompt.
 */

import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  type ExtensionAPI,
  getAgentDir,
} from "@earendil-works/pi-coding-agent";
import {
  applySkillVisibility,
  NO_HIDDEN_SKILLS,
  parseSkillVisibilityConfig,
  type SkillVisibilityConfig,
} from "./core.ts";

export type { SkillVisibilityConfig } from "./core.ts";
export {
  applySkillVisibility,
  normalizeSkillName,
  parseSkillVisibilityConfig,
} from "./core.ts";

let cachedMtime = -1;
let cachedConfig: SkillVisibilityConfig = NO_HIDDEN_SKILLS;

export function readConfig(): SkillVisibilityConfig {
  const filePath = join(getAgentDir(), "settings.json");
  let mtime = -1;
  try {
    mtime = statSync(filePath).mtimeMs;
  } catch {
    return cachedConfig;
  }
  if (mtime === cachedMtime) return cachedConfig;

  try {
    cachedConfig = parseSkillVisibilityConfig(
      JSON.parse(readFileSync(filePath, "utf8")),
    );
  } catch {
    cachedConfig = NO_HIDDEN_SKILLS;
  }
  cachedMtime = mtime;
  return cachedConfig;
}

export function registerSkillVisibility(
  pi: ExtensionAPI,
  loadConfig: () => SkillVisibilityConfig = readConfig,
): void {
  pi.on("before_agent_start", (event) => {
    const options = event.systemPromptOptions;
    if (!options.skills?.length) return;

    const skills = applySkillVisibility(options.skills, loadConfig());
    if (skills) options.skills = skills;
  });
}

export default registerSkillVisibility;

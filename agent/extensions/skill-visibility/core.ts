/**
 * Pure helpers for skill-visibility. Kept free of runtime imports from the pi package so
 * unit tests can load them without pi's extension module aliasing.
 */

import type { Skill } from "@earendil-works/pi-coding-agent";

export interface SkillVisibilityConfig {
	hideAllSkills: boolean;
	hiddenSkills: Set<string>;
}

export const NO_HIDDEN_SKILLS: SkillVisibilityConfig = {
	hideAllSkills: false,
	hiddenSkills: new Set(),
};

export function normalizeSkillName(value: string): string {
	return value.trim().replace(/^skill:/, "");
}

/** Parse the `skillful` block of the agent-dir settings.json. Invalid input hides nothing. */
export function parseSkillVisibilityConfig(document: unknown): SkillVisibilityConfig {
	const skillful = (document as { skillful?: unknown } | null | undefined)?.skillful as
		| { hideAllSkills?: unknown; hiddenSkills?: unknown }
		| undefined;
	const hiddenSkills = Array.isArray(skillful?.hiddenSkills)
		? skillful.hiddenSkills.filter((name): name is string => typeof name === "string")
		: [];
	return {
		hideAllSkills: skillful?.hideAllSkills === true,
		hiddenSkills: new Set(hiddenSkills.map(normalizeSkillName)),
	};
}

/**
 * Mark configured skills as `disableModelInvocation` so Pi leaves them out of the system
 * prompt. Returns `undefined` when nothing changes, so callers can leave options untouched.
 */
export function applySkillVisibility(
	skills: readonly Skill[],
	config: SkillVisibilityConfig,
): Skill[] | undefined {
	if (!config.hideAllSkills && config.hiddenSkills.size === 0) return undefined;

	let changed = false;
	const nextSkills = skills.map((skill) => {
		const hidden = config.hideAllSkills || config.hiddenSkills.has(skill.name);
		if (!hidden || skill.disableModelInvocation) return skill;
		changed = true;
		return { ...skill, disableModelInvocation: true };
	});
	return changed ? nextSkills : undefined;
}

/**
 * Mutate the mutable `systemPromptOptions` Pi exposes on `before_agent_start`.
 * Returns true when the skill list changed. Pi re-renders the prompt sections from these
 * options, so nothing is returned to the caller and no forced system prompt is set.
 */
export function applySkillVisibilityToOptions(
	options: { skills?: readonly Skill[] },
	config: SkillVisibilityConfig,
): boolean {
	if (!options.skills?.length) return false;
	const skills = applySkillVisibility(options.skills, config);
	if (!skills) return false;
	options.skills = skills;
	return true;
}

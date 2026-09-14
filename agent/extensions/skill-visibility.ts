import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
	type ExtensionAPI,
	formatSkillsForPrompt,
	getAgentDir,
	type Skill,
} from "@earendil-works/pi-coding-agent";

const SKILLS_SECTION_PATTERN =
	/\n\nThe following skills provide specialized instructions for specific tasks\.[\s\S]*?<\/available_skills>/;

interface SkillVisibilityConfig {
	hideAllSkills: boolean;
	hiddenSkills: Set<string>;
}

let cachedMtime = -1;
let cachedConfig: SkillVisibilityConfig = {
	hideAllSkills: false,
	hiddenSkills: new Set(),
};

function normalizeSkillName(value: string): string {
	return value.trim().replace(/^skill:/, "");
}

function readConfig(): SkillVisibilityConfig {
	const filePath = join(getAgentDir(), "settings.json");
	let mtime = -1;
	try {
		mtime = statSync(filePath).mtimeMs;
	} catch {
		return cachedConfig;
	}
	if (mtime === cachedMtime) return cachedConfig;

	try {
		const document = JSON.parse(readFileSync(filePath, "utf8")) as {
			skillful?: { hideAllSkills?: unknown; hiddenSkills?: unknown };
		};
		const skillful = document.skillful;
		const hiddenSkills = Array.isArray(skillful?.hiddenSkills)
			? skillful.hiddenSkills.filter(
					(name): name is string => typeof name === "string",
				)
			: [];
		cachedConfig = {
			hideAllSkills: skillful?.hideAllSkills === true,
			hiddenSkills: new Set(hiddenSkills.map(normalizeSkillName)),
		};
		cachedMtime = mtime;
	} catch {
		cachedConfig = { hideAllSkills: false, hiddenSkills: new Set() };
		cachedMtime = mtime;
	}
	return cachedConfig;
}

export function replaceHiddenSkills(
	systemPrompt: string,
	skills: Skill[],
	config: SkillVisibilityConfig,
): string | undefined {
	if (!config.hideAllSkills && config.hiddenSkills.size === 0) return undefined;

	const filteredSkills = skills.map((skill) => {
		const hidden = config.hideAllSkills || config.hiddenSkills.has(skill.name);
		return hidden ? { ...skill, disableModelInvocation: true } : skill;
	});
	const next = systemPrompt.replace(
		SKILLS_SECTION_PATTERN,
		formatSkillsForPrompt(filteredSkills),
	);
	return next === systemPrompt ? undefined : next;
}

export default function skillVisibility(pi: ExtensionAPI) {
	pi.on("before_agent_start", (event) => {
		const options = event.systemPromptOptions;
		if (!options.skills?.length) return;

		const config = readConfig();
		const replacement = replaceHiddenSkills(
			event.systemPrompt,
			options.skills,
			config,
		);
		return replacement ? { systemPrompt: replacement } : undefined;
	});
}

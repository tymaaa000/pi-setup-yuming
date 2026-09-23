import assert from "node:assert/strict";
import { test } from "node:test";
import type { Skill } from "@earendil-works/pi-coding-agent";
import {
	applySkillVisibility,
	applySkillVisibilityToOptions,
	normalizeSkillName,
	parseSkillVisibilityConfig,
	type SkillVisibilityConfig,
} from "./core.ts";

// Wiring (pi.on("before_agent_start", …)) lives in skill-visibility.ts and is verified end
// to end with a real prompt render; everything it calls is covered here.

function skill(name: string, hidden = false): Skill {
	return {
		name,
		description: `${name} description`,
		filePath: `/tmp/skills/${name}/SKILL.md`,
		baseDir: `/tmp/skills/${name}`,
		sourceInfo: {} as Skill["sourceInfo"],
		disableModelInvocation: hidden,
	};
}

function config(hideAllSkills: boolean, hiddenSkills: string[]): SkillVisibilityConfig {
	return { hideAllSkills, hiddenSkills: new Set(hiddenSkills) };
}

test("single hidden skill is marked without touching the others", () => {
	const skills = [skill("code-review"), skill("metrics"), skill("tdd")];
	const next = applySkillVisibility(skills, config(false, ["metrics"]));

	assert.ok(next, "expected a rewritten skill list");
	assert.deepEqual(
		next.map((entry) => [entry.name, entry.disableModelInvocation]),
		[
			["code-review", false],
			["metrics", true],
			["tdd", false],
		],
	);
	// Untouched entries keep their identity so Pi can compare sections cheaply.
	assert.equal(next[0], skills[0]);
	assert.equal(next[2], skills[2]);
});

test("hideAllSkills hides every skill", () => {
	const next = applySkillVisibility(
		[skill("code-review"), skill("metrics")],
		config(true, []),
	);

	assert.ok(next);
	assert.deepEqual(
		next.map((entry) => entry.disableModelInvocation),
		[true, true],
	);
});

test("no-op config and already-hidden skills leave the list undefined", () => {
	assert.equal(applySkillVisibility([skill("metrics")], config(false, [])), undefined);
	assert.equal(
		applySkillVisibility([skill("metrics", true)], config(false, ["metrics"])),
		undefined,
	);
	assert.equal(applySkillVisibility([skill("metrics", true)], config(true, [])), undefined);
});

test("prompt options are mutated in place instead of forcing a system prompt", () => {
	const options = { skills: [skill("code-review"), skill("metrics")] as Skill[] };
	const changed = applySkillVisibilityToOptions(options, config(false, ["metrics"]));

	assert.equal(changed, true);
	assert.deepEqual(
		options.skills.map((entry) => [entry.name, entry.disableModelInvocation]),
		[
			["code-review", false],
			["metrics", true],
		],
	);
});

test("prompt options stay untouched when nothing is hidden", () => {
	const skills = [skill("metrics")];
	assert.equal(
		applySkillVisibilityToOptions({ skills }, config(false, [])),
		false,
	);
	assert.equal(
		applySkillVisibilityToOptions({ skills: [] }, config(true, [])),
		false,
	);
	assert.equal(applySkillVisibilityToOptions({}, config(true, [])), false);
});

test("settings are parsed defensively", () => {
	assert.deepEqual(parseSkillVisibilityConfig({}), config(false, []));
	assert.deepEqual(parseSkillVisibilityConfig(null), config(false, []));
	assert.deepEqual(parseSkillVisibilityConfig({ skillful: "nope" }), config(false, []));
	assert.deepEqual(
		parseSkillVisibilityConfig({ skillful: { hideAllSkills: "yes", hiddenSkills: 1 } }),
		config(false, []),
	);

	const parsed = parseSkillVisibilityConfig({
		skillful: { hideAllSkills: true, hiddenSkills: ["skill:metrics", 7, "  tdd  "] },
	});
	assert.equal(parsed.hideAllSkills, true);
	assert.deepEqual([...parsed.hiddenSkills], ["metrics", "tdd"]);
});

test("skill command prefixes are tolerated in config", () => {
	assert.equal(normalizeSkillName(" skill:metrics "), "metrics");
	assert.equal(normalizeSkillName("metrics"), "metrics");

	const next = applySkillVisibility(
		[skill("metrics")],
		parseSkillVisibilityConfig({ skillful: { hiddenSkills: ["skill:metrics"] } }),
	);
	assert.equal(next?.[0].disableModelInvocation, true);
});

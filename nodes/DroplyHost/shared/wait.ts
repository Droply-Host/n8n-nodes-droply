import type { Sleep } from './client';
import type { DroplyDeployment } from './types';

/** What the caller is waiting for. */
export type Goal =
	/** A new upload: done once it is live (or already replaced by a newer one); it can fail. */
	| 'deploy'
	/** A new upload saved as a draft: done once it is staged; it can fail. */
	| 'draft'
	/** Publishing a draft or rolling back: done once the version is live. A flip that fails leaves it as it was, so only time says so. */
	| 'flip';

export type WaitResult = { deployment: DroplyDeployment; outcome: 'done' | 'failed' | 'timeout' };

/** 1.5 s, 2, 3, 4, then every 5 s: most deploys finish in seconds, and the API allows 60 calls a minute. */
const SCHEDULE = [1500, 2000, 3000, 4000];
const STEADY = 5000;

export function isDone(deployment: DroplyDeployment, goal: Goal): boolean {
	switch (goal) {
		case 'deploy':
			return deployment.status === 'live' || deployment.status === 'superseded';
		case 'draft':
			return deployment.status === 'staged';
		case 'flip':
			return deployment.status === 'live';
	}
}

export function isFailed(deployment: DroplyDeployment, goal: Goal): boolean {
	return goal !== 'flip' && deployment.status === 'failed';
}

/**
 * Poll $get until the deployment reaches $goal, fails, or $timeoutMs runs out. Returns the last state
 * seen either way; the caller decides what a timeout means. $now and $sleep are injected so the loop
 * can be tested without waiting.
 */
export async function waitFor(
	get: () => Promise<DroplyDeployment>,
	initial: DroplyDeployment,
	goal: Goal,
	timeoutMs: number,
	sleep: Sleep,
	now: () => number = Date.now,
): Promise<WaitResult> {
	const started = now();
	let deployment = initial;

	for (let attempt = 0; ; attempt++) {
		if (isDone(deployment, goal)) {
			return { deployment, outcome: 'done' };
		}
		if (isFailed(deployment, goal)) {
			return { deployment, outcome: 'failed' };
		}

		const delay = SCHEDULE[attempt] ?? STEADY;
		if (now() - started + delay > timeoutMs) {
			return { deployment, outcome: 'timeout' };
		}

		await sleep(delay);
		deployment = await get();
	}
}

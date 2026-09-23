import type { IDataObject } from 'n8n-workflow';
import type { DroplyClient } from './client';
import { DEFAULT_TIMEOUT_SECONDS, MAX_TIMEOUT_SECONDS, MIN_TIMEOUT_SECONDS } from './constants';
import { Problem } from './problem';
import type { DroplyDeployment, Envelope } from './types';
import { waitFor, type Goal } from './wait';

export async function getDeployment(client: DroplyClient, id: string): Promise<DroplyDeployment> {
	return (
		await client.request<Envelope<DroplyDeployment>>({
			method: 'GET',
			path: `/deployments/${encodeURIComponent(id)}`,
		})
	).data;
}

/**
 * Follow a deployment until it reaches $goal, unless Wait Until Live is off. A version Droply refused
 * while processing, and a wait that ran out, both stop the item with what to do next.
 */
export async function settle(
	client: DroplyClient,
	deployment: DroplyDeployment,
	goal: Goal,
	options: IDataObject,
): Promise<DroplyDeployment> {
	if (options.waitUntilLive === false) {
		return deployment;
	}

	const seconds = Math.min(
		MAX_TIMEOUT_SECONDS,
		Math.max(
			MIN_TIMEOUT_SECONDS,
			Number(options.timeout ?? DEFAULT_TIMEOUT_SECONDS) || DEFAULT_TIMEOUT_SECONDS,
		),
	);
	const result = await waitFor(
		() => getDeployment(client, deployment.id),
		deployment,
		goal,
		seconds * 1000,
		client.sleep,
	);

	if (result.outcome === 'failed') {
		throw notPublished(result.deployment);
	}
	if (result.outcome === 'timeout') {
		throw stillWorking(result.deployment, goal);
	}

	return result.deployment;
}

export function notPublished(deployment: DroplyDeployment): Problem {
	const reason = (deployment.error_message ?? '').trim();
	const choices = deployment.index_choices?.options.map((option) => option.value) ?? [];

	const description =
		choices.length > 0
			? `It holds more than one page that could open the site. Run Deployment > Retry on deployment ${deployment.id} with 'Entry' set to one of: ${choices.join(', ')}.`
			: `Fix the content and publish again. The deployment is ${deployment.id}.`;

	return new Problem(
		reason !== ''
			? `Droply did not publish this version: ${reason}`
			: 'Droply did not publish this version',
		description,
	);
}

export function stillWorking(deployment: DroplyDeployment, goal: Goal): Problem {
	if (goal === 'flip') {
		return new Problem(
			'The change was accepted and is still being applied',
			`Droply queued it for deployment ${deployment.id}. Check it with Deployment > Get; if it is not live after a few minutes, try again.`,
		);
	}

	return new Problem(
		'Droply is still processing this version',
		`It was accepted as deployment ${deployment.id} and may still go live. Check it with Deployment > Get instead of running this again, or raise 'Timeout (Seconds)'.`,
	);
}

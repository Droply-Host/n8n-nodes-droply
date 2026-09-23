import { describe, expect, it } from 'vitest';
import { waitFor } from '../nodes/DroplyHost/shared/wait';
import type { DroplyDeployment } from '../nodes/DroplyHost/shared/types';

const deployment = (status: string): DroplyDeployment => ({
	id: 'd1',
	site_id: 's1',
	status,
	source_type: 'zip',
	original_filename: 'site.zip',
	error_message: null,
	size_bytes: null,
	file_count: null,
	uploaded_at: null,
	processed_at: null,
});

/** A clock that only moves when the code under test sleeps. */
function clock() {
	let now = 0;
	const sleeps: number[] = [];

	return {
		now: () => now,
		sleep: async (ms: number) => {
			sleeps.push(ms);
			now += ms;
		},
		sleeps,
	};
}

const sequence = (...statuses: string[]) => {
	const queue = [...statuses];
	return async () => deployment(queue.shift() ?? statuses[statuses.length - 1]);
};

describe('waitFor', () => {
	it('follows a new upload until it is live, backing off as it goes', async () => {
		const time = clock();
		const result = await waitFor(
			sequence('processing', 'scanning', 'live'),
			deployment('uploaded'),
			'deploy',
			60_000,
			time.sleep,
			time.now,
		);

		expect(result.outcome).toBe('done');
		expect(result.deployment.status).toBe('live');
		expect(time.sleeps).toEqual([1500, 2000, 3000]);
	});

	it('reports a version Droply refused while processing', async () => {
		const time = clock();
		const result = await waitFor(
			sequence('processing', 'failed'),
			deployment('uploaded'),
			'deploy',
			60_000,
			time.sleep,
			time.now,
		);

		expect(result.outcome).toBe('failed');
	});

	it('stops at staged for a draft', async () => {
		const time = clock();
		const result = await waitFor(
			sequence('processing', 'staged'),
			deployment('uploaded'),
			'draft',
			60_000,
			time.sleep,
			time.now,
		);

		expect(result.outcome).toBe('done');
		expect(result.deployment.status).toBe('staged');
	});

	it('does not mistake a rollback target for done before it is live', async () => {
		// A rollback starts from a superseded version, which a new upload would count as finished.
		const time = clock();
		const result = await waitFor(
			sequence('superseded', 'live'),
			deployment('superseded'),
			'flip',
			60_000,
			time.sleep,
			time.now,
		);

		expect(result.outcome).toBe('done');
		expect(time.sleeps).toHaveLength(2);
	});

	it('gives up without sleeping past the timeout', async () => {
		const time = clock();
		const result = await waitFor(
			sequence('processing'),
			deployment('uploaded'),
			'deploy',
			20_000,
			time.sleep,
			time.now,
		);

		expect(result.outcome).toBe('timeout');
		expect(time.sleeps.reduce((sum, ms) => sum + ms, 0)).toBeLessThanOrEqual(20_000);
	});

	it('returns at once when the version is already where it should be', async () => {
		const time = clock();
		const result = await waitFor(
			sequence('live'),
			deployment('live'),
			'flip',
			60_000,
			time.sleep,
			time.now,
		);

		expect(result.outcome).toBe('done');
		expect(time.sleeps).toEqual([]);
	});
});

import { describe, expect, it } from 'vitest';
import {
	DroplyClient,
	DroplyHttpError,
	type ApiRequest,
	type ApiResponse,
} from '../nodes/DroplyHost/shared/client';

/** A client whose server answers from $responses in order, recording every request and every wait. */
function fake(responses: ApiResponse[]) {
	const requests: ApiRequest[] = [];
	const waits: number[] = [];
	const client = new DroplyClient(
		async (request) => {
			requests.push(request);
			const response = responses.shift();
			if (response === undefined) {
				throw new Error('no more responses');
			}
			return response;
		},
		async (ms) => {
			waits.push(ms);
		},
		'https://droply.host',
	);

	return { client, requests, waits };
}

const ok: ApiResponse = { statusCode: 200, headers: {}, body: { data: { id: 'x' } } };
const status = (
	statusCode: number,
	headers = {},
	body: unknown = { message: '' },
): ApiResponse => ({ statusCode, headers, body });

describe('DroplyClient', () => {
	it('waits out a 429 that says how long, even for a POST', async () => {
		const { client, requests, waits } = fake([status(429, { 'retry-after': '2' }), ok]);

		await expect(client.request({ method: 'POST', path: '/sites', json: {} })).resolves.toEqual({
			data: { id: 'x' },
		});
		expect(requests).toHaveLength(2);
		expect(waits).toEqual([2000]);
	});

	it('gives up on a 429 without a usable Retry-After', async () => {
		for (const headers of [{}, { 'retry-after': '120' }]) {
			const { client } = fake([status(429, headers), ok]);
			await expect(client.request({ method: 'GET', path: '/sites' })).rejects.toBeInstanceOf(
				DroplyHttpError,
			);
		}
	});

	it('retries a read after a server hiccup, but never a write', async () => {
		const read = fake([status(503), status(502), ok]);
		await expect(read.client.request({ method: 'GET', path: '/sites' })).resolves.toBeDefined();
		expect(read.waits).toEqual([1000, 3000]);

		const write = fake([status(503), ok]);
		await expect(
			write.client.request({ method: 'POST', path: '/sites/abc/deployments', json: { html: 'x' } }),
		).rejects.toMatchObject({ status: 503 });
		expect(write.requests).toHaveLength(1);
	});

	it('waits for a free slot when too many deploys are still processing', async () => {
		const busy = status(
			422,
			{},
			{ errors: { deploy: ['You have too many deployments still processing.'] } },
		);
		const { client, waits } = fake([busy, busy, ok]);

		await expect(
			client.request({ method: 'POST', path: '/sites/abc/deployments', json: { html: 'x' } }),
		).resolves.toBeDefined();
		expect(waits).toEqual([5000, 5000]);
	});

	it('does not retry an ordinary refusal', async () => {
		const { client, requests } = fake([
			status(422, {}, { errors: { subdomain: ['That name is already taken.'] } }),
			ok,
		]);

		await expect(
			client.request({ method: 'POST', path: '/sites', json: { subdomain: 'x' } }),
		).rejects.toMatchObject({ status: 422 });
		expect(requests).toHaveLength(1);
	});
});

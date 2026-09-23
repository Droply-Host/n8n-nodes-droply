import { describe, expect, it } from 'vitest';
import { DroplyClient, DroplyHttpError, type ApiRequest } from '../nodes/DroplyHost/shared/client';
import { Problem } from '../nodes/DroplyHost/shared/problem';
import {
	findByHost,
	findBySubdomain,
	hostOf,
	isTakenSubdomain,
	resolveSite,
} from '../nodes/DroplyHost/shared/sites';
import type { DroplySite } from '../nodes/DroplyHost/shared/types';

const site = (subdomain: string, liveUrl = `https://${subdomain}.droply.id`): DroplySite => ({
	id: `00000000-0000-4000-8000-${subdomain.padStart(12, '0').slice(-12)}`,
	subdomain,
	name: null,
	status: 'active',
	live_url: liveUrl,
	current_deployment_id: null,
	created_at: null,
	updated_at: null,
});

/**
 * A server holding $sites, 2 per page. With $filters it honours ?subdomain= and ?host= like the current
 * API; without, it ignores them like an older one.
 */
function server(sites: DroplySite[], filters: boolean) {
	const requests: ApiRequest[] = [];
	const client = new DroplyClient(
		async (request) => {
			requests.push(request);
			let list = sites;
			if (filters && request.qs?.subdomain !== undefined) {
				list = sites.filter((s) => s.subdomain === String(request.qs?.subdomain).toLowerCase());
			}
			if (filters && request.qs?.host !== undefined) {
				list = sites.filter((s) => new URL(s.live_url).hostname === String(request.qs?.host));
			}
			const page = Number(request.qs?.page ?? 1);
			const lastPage = Math.max(1, Math.ceil(list.length / 2));

			return {
				statusCode: 200,
				headers: {},
				body: {
					data: list.slice((page - 1) * 2, page * 2),
					meta: { current_page: page, last_page: lastPage },
				},
			};
		},
		async () => undefined,
		'https://droply.host',
	);

	return { client, requests };
}

const account = [
	site('alpha'),
	site('beta'),
	site('gamma'),
	site('delta', 'https://www.delta-brand.com'),
];

describe('findBySubdomain', () => {
	it('finds the site in one call when the server filters', async () => {
		const { client, requests } = server(account, true);

		expect((await findBySubdomain(client, 'GAMMA'))?.subdomain).toBe('gamma');
		expect(requests).toHaveLength(1);
		expect(await findBySubdomain(client, 'omega')).toBeNull();
	});

	it('never takes another site for the one asked for when an older server ignores the filter', async () => {
		const { client } = server(account, false);

		expect((await findBySubdomain(client, 'gamma'))?.subdomain).toBe('gamma');
		expect(await findBySubdomain(client, 'omega')).toBeNull();
	});
});

describe('findByHost', () => {
	it('finds a site by its Droply address or its custom domain', async () => {
		for (const filters of [true, false]) {
			const { client } = server(account, filters);
			expect((await findByHost(client, 'beta.droply.id'))?.subdomain).toBe('beta');
			expect((await findByHost(client, 'www.delta-brand.com'))?.subdomain).toBe('delta');
			expect(await findByHost(client, 'nowhere.example')).toBeNull();
		}
	});
});

describe('resolveSite', () => {
	it('checks an ID before asking for it', async () => {
		const { client, requests } = server(account, true);

		await expect(resolveSite(client, { mode: 'id', value: 'alpha' })).rejects.toBeInstanceOf(
			Problem,
		);
		expect(requests).toHaveLength(0);
	});

	it('resolves a subdomain and an address', async () => {
		const { client } = server(account, true);

		expect((await resolveSite(client, { mode: 'subdomain', value: 'alpha' })).subdomain).toBe(
			'alpha',
		);
		expect(
			(await resolveSite(client, { mode: 'url', value: 'https://beta.droply.id/about.html' }))
				.subdomain,
		).toBe('beta');
		await expect(resolveSite(client, { mode: 'subdomain', value: 'omega' })).rejects.toBeInstanceOf(
			Problem,
		);
	});
});

describe('hostOf', () => {
	it('reads the host from an address, with or without a scheme', () => {
		expect(hostOf('https://Alpha.droply.id:443/page?q=1')).toBe('alpha.droply.id');
		expect(hostOf('www.example.com/path')).toBe('www.example.com');
		expect(hostOf('')).toBe('');
	});
});

describe('isTakenSubdomain', () => {
	it('recognises only a taken-subdomain refusal', () => {
		const refusal = (errors: object) =>
			new DroplyHttpError(422, { errors }, {}, { method: 'POST', path: '/sites' });

		expect(isTakenSubdomain(refusal({ subdomain: ['That name is already taken.'] }))).toBe(true);
		expect(isTakenSubdomain(refusal({ subdomain: ['That name is reserved.'] }))).toBe(false);
		expect(isTakenSubdomain(new Error('network'))).toBe(false);
	});
});

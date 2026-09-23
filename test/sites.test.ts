import { describe, expect, it } from 'vitest';
import { DroplyClient, DroplyHttpError, type ApiRequest } from '../nodes/DroplyHost/shared/client';
import { Problem } from '../nodes/DroplyHost/shared/problem';
import {
	findByHost,
	findBySubdomain,
	hostOf,
	isTakenSubdomain,
	removeCreatedSite,
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
			const applied: Record<string, string> = {};
			if (filters && request.qs?.subdomain !== undefined) {
				applied.subdomain = String(request.qs?.subdomain).toLowerCase();
				list = sites.filter((s) => s.subdomain === applied.subdomain);
			}
			if (filters && request.qs?.host !== undefined) {
				applied.host = String(request.qs?.host);
				list = sites.filter((s) => new URL(s.live_url).hostname === applied.host);
			}
			const page = Number(request.qs?.page ?? 1);
			const lastPage = Math.max(1, Math.ceil(list.length / 2));

			return {
				statusCode: 200,
				headers: {},
				body: {
					data: list.slice((page - 1) * 2, page * 2),
					meta: { current_page: page, last_page: lastPage },
					...(filters ? { filters: applied } : {}),
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

describe('findByHost on an older server', () => {
	it('never takes an account with one site for any address asked about', async () => {
		const { client } = server([site('only')], false);

		expect(await findByHost(client, 'www.someone-else.com')).toBeNull();
		expect((await findByHost(client, 'only.droply.id'))?.subdomain).toBe('only');
	});
});

describe('removeCreatedSite', () => {
	/** A site the run just created, and what the server says about it now. */
	function created(current: string | null, versions: number, deleteStatus = 204) {
		const deletes: string[] = [];
		const client = new DroplyClient(
			async (request) => {
				if (request.method === 'DELETE') {
					deletes.push(request.path);
					return { statusCode: deleteStatus, headers: {}, body: null };
				}
				if (request.path.endsWith('/deployments')) {
					return {
						statusCode: 200,
						headers: {},
						body: { data: Array.from({ length: versions }, () => ({})) },
					};
				}
				return {
					statusCode: 200,
					headers: {},
					body: { data: { ...site('fresh'), current_deployment_id: current } },
				};
			},
			async () => undefined,
			'https://droply.host',
		);

		return { client, deletes };
	}

	it('removes the site only while it is still empty', async () => {
		const empty = created(null, 0);
		expect(await removeCreatedSite(empty.client, site('fresh'))).toBe('removed');
		expect(empty.deletes).toHaveLength(1);

		// Another run found it and published to it meanwhile: its content stays.
		for (const [current, versions] of [
			['00000000-0000-4000-8000-000000000001', 1],
			[null, 1],
		] as const) {
			const busy = created(current, versions);
			expect(await removeCreatedSite(busy.client, site('fresh'))).toBe('kept');
			expect(busy.deletes).toHaveLength(0);
		}
	});

	it('reports when the clean-up itself could not be done', async () => {
		const refused = created(null, 0, 500);
		expect(await removeCreatedSite(refused.client, site('fresh'))).toBe('failed');
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

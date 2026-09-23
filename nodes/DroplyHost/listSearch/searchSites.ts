import type { ILoadOptionsFunctions, INodeListSearchResult } from 'n8n-workflow';
import { toNodeError } from '../shared/nodeErrors';
import { clientFor } from '../shared/transport';
import type { DroplySite, Page } from '../shared/types';

/** The Site picker's list: the account's sites, a page at a time, filtered by subdomain or name. */
export async function searchSites(
	this: ILoadOptionsFunctions,
	filter?: string,
	paginationToken?: string,
): Promise<INodeListSearchResult> {
	const client = await clientFor(this);
	const page = paginationToken ? Number(paginationToken) : 1;

	let response: Page<DroplySite>;
	try {
		response = await client.request<Page<DroplySite>>({
			method: 'GET',
			path: '/sites',
			qs: { page },
		});
	} catch (error) {
		throw toNodeError(this, error, client.baseUrl);
	}

	const needle = (filter ?? '').trim().toLowerCase();
	const results = response.data
		.filter(
			(site) =>
				needle === '' ||
				site.subdomain.toLowerCase().includes(needle) ||
				(site.name ?? '').toLowerCase().includes(needle),
		)
		.map((site) => ({
			name: site.name ? `${site.subdomain} (${site.name})` : site.subdomain,
			value: site.id,
			url: site.live_url,
		}));

	const last = response.meta?.last_page ?? page;

	return { results, paginationToken: page < last ? String(page + 1) : undefined };
}

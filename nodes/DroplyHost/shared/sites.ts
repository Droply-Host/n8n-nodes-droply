import type { IDataObject } from 'n8n-workflow';
import { DroplyHttpError, type DroplyClient } from './client';
import { MAX_PAGES } from './constants';
import { Problem } from './problem';
import type { DroplySite, Envelope, Page } from './types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type SiteLocator = { mode: string; value: string };

export function isUuid(value: string): boolean {
	return UUID.test(value.trim());
}

export async function getSite(client: DroplyClient, id: string): Promise<DroplySite> {
	return (
		await client.request<Envelope<DroplySite>>({
			method: 'GET',
			path: `/sites/${encodeURIComponent(id)}`,
		})
	).data;
}

/** The site a resource locator points at: picked from the list, or given by ID, subdomain or address. */
export async function resolveSite(client: DroplyClient, locator: SiteLocator): Promise<DroplySite> {
	const value = String(locator.value ?? '').trim();
	if (value === '') {
		throw new Problem(
			'Choose a site',
			"Pick one from the list, or give its URL, subdomain or ID in 'Site'.",
		);
	}

	if (locator.mode === 'subdomain') {
		const site = await findBySubdomain(client, value);
		if (site === null) {
			throw new Problem(`No site with the subdomain '${value}' was found in this Droply account`);
		}
		return site;
	}

	if (locator.mode === 'url') {
		const host = hostOf(value);
		if (host === '') {
			throw new Problem(
				`'${value}' is not a site address`,
				'Give the address the site opens at, like https://my-site.droply.id.',
			);
		}
		const site = await findByHost(client, host);
		if (site === null) {
			throw new Problem(`No site at '${host}' was found in this Droply account`);
		}
		return site;
	}

	if (!isUuid(value)) {
		throw new Problem(
			`'${value}' is not a site ID`,
			"A site ID looks like 9d1c2f3a-4b5c-4d6e-8f70-81a2b3c4d5e6. To use a subdomain, switch 'Site' to By Subdomain.",
		);
	}

	return getSite(client, value);
}

/**
 * The caller's site with this subdomain, or null. Uses the API's `subdomain` filter, and trusts only an
 * exact match: an older server that ignored the filter would return a page of other sites, and the
 * first of those must never be mistaken for the one asked for. In that case every page is walked.
 */
export async function findBySubdomain(
	client: DroplyClient,
	subdomain: string,
): Promise<DroplySite | null> {
	const wanted = subdomain.trim().toLowerCase();
	const first = await client.request<Page<DroplySite>>({
		method: 'GET',
		path: '/sites',
		qs: { subdomain: wanted },
	});
	const match = first.data.find((site) => site.subdomain.toLowerCase() === wanted);

	if (match !== undefined || first.data.every((site) => site.subdomain.toLowerCase() === wanted)) {
		return match ?? null;
	}

	return walk(client, (site) => site.subdomain.toLowerCase() === wanted);
}

/** The caller's site served at $host (its Droply address or a connected custom domain), or null. */
export async function findByHost(client: DroplyClient, host: string): Promise<DroplySite | null> {
	const wanted = host.toLowerCase();
	const first = await client.request<Page<DroplySite>>({
		method: 'GET',
		path: '/sites',
		qs: { host: wanted },
	});

	if (first.data.length <= 1) {
		return first.data[0] ?? null;
	}

	// More than one answer means the server ignored the filter: match on the address each site opens at.
	return walk(client, (site) => hostOf(site.live_url) === wanted);
}

export async function listSites(client: DroplyClient, limit: number | null): Promise<DroplySite[]> {
	return collect<DroplySite>(client, '/sites', limit);
}

/** Every item of a paginated list, newest first, up to $limit (null means all, bounded by MAX_PAGES). */
export async function collect<T>(
	client: DroplyClient,
	path: string,
	limit: number | null,
): Promise<T[]> {
	const items: T[] = [];

	for (let page = 1; page <= MAX_PAGES; page++) {
		const response = await client.request<Page<T>>({ method: 'GET', path, qs: { page } });
		items.push(...response.data);

		if (limit !== null && items.length >= limit) {
			return items.slice(0, limit);
		}
		if (!hasNextPage(response, page)) {
			break;
		}
	}

	return items;
}

export async function createSite(
	client: DroplyClient,
	subdomain: string,
	name: string,
): Promise<DroplySite> {
	const json: IDataObject = {};
	if (subdomain.trim() !== '') {
		json.subdomain = subdomain.trim().toLowerCase();
	}
	if (name.trim() !== '') {
		json.name = name.trim();
	}

	return (await client.request<Envelope<DroplySite>>({ method: 'POST', path: '/sites', json }))
		.data;
}

export async function deleteSite(client: DroplyClient, id: string, confirm: string): Promise<void> {
	await client.request<unknown>({
		method: 'DELETE',
		path: `/sites/${encodeURIComponent(id)}`,
		json: confirm.trim() !== '' ? { confirm: confirm.trim() } : undefined,
	});
}

export async function updateSettings(
	client: DroplyClient,
	id: string,
	changes: IDataObject,
): Promise<DroplySite> {
	return (
		await client.request<Envelope<DroplySite>>({
			method: 'PATCH',
			path: `/sites/${encodeURIComponent(id)}`,
			json: changes,
		})
	).data;
}

/**
 * Remove a site this run created and could not fill, so a refused first publish does not leave an empty
 * site holding one of the account's slots. Returns false when that could not be done either.
 */
export async function removeCreatedSite(client: DroplyClient, site: DroplySite): Promise<boolean> {
	try {
		await deleteSite(client, site.id, '');
		return true;
	} catch {
		return false;
	}
}

/** Whether $error is Droply refusing a new site's subdomain because it is taken. */
export function isTakenSubdomain(error: unknown): boolean {
	if (!(error instanceof DroplyHttpError) || error.status !== 422) {
		return false;
	}
	const messages = (error.body as { errors?: { subdomain?: unknown } } | null)?.errors?.subdomain;

	return Array.isArray(messages) && messages.some((message) => /taken/i.test(String(message)));
}

/** The host part of an address, lowercased, without port or trailing dot. Accepts a bare host too. */
export function hostOf(address: string): string {
	const value = address.trim();
	if (value === '') {
		return '';
	}

	try {
		const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`);
		return url.hostname.toLowerCase().replace(/\.$/, '');
	} catch {
		return '';
	}
}

async function walk(
	client: DroplyClient,
	matches: (site: DroplySite) => boolean,
): Promise<DroplySite | null> {
	for (let page = 1; page <= MAX_PAGES; page++) {
		const response = await client.request<Page<DroplySite>>({
			method: 'GET',
			path: '/sites',
			qs: { page },
		});
		const match = response.data.find(matches);
		if (match !== undefined) {
			return match;
		}
		if (!hasNextPage(response, page)) {
			return null;
		}
	}

	return null;
}

function hasNextPage(response: Page<unknown>, page: number): boolean {
	if (response.meta?.last_page !== undefined) {
		return page < response.meta.last_page;
	}

	return Boolean(response.links?.next);
}

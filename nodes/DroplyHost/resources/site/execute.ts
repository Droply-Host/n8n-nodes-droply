import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { DroplyHttpError, type DroplyClient } from '../../shared/client';
import {
	readContent,
	settingsFromCollection,
	settingsFromOptions,
	siteParameter,
} from '../../shared/input';
import { UploadTooLarge } from '../../shared/multipart';
import { toNodeError } from '../../shared/nodeErrors';
import { publishOutput } from '../../shared/output';
import { Problem } from '../../shared/problem';
import { deploy } from '../../shared/publish';
import { settle } from '../../shared/settle';
import {
	createSite,
	deleteSite,
	findBySubdomain,
	getSite,
	isTakenSubdomain,
	listSites,
	removeCreatedSite,
	resolveSite,
	updateSettings,
} from '../../shared/sites';
import { randomBoundary } from '../../shared/transport';
import type { DroplyDeployment, DroplySite, SubdomainCheck } from '../../shared/types';

export async function executeSite(
	ctx: IExecuteFunctions,
	client: DroplyClient,
	operation: string,
	i: number,
): Promise<IDataObject | IDataObject[]> {
	switch (operation) {
		case 'checkSubdomain': {
			const subdomain = String(ctx.getNodeParameter('subdomain', i)).trim();
			return await client.request<SubdomainCheck>({
				method: 'GET',
				path: '/sites/check',
				qs: { subdomain },
			});
		}

		case 'get':
			return await resolveSite(client, siteParameter(ctx, i));

		case 'getAll': {
			const returnAll = ctx.getNodeParameter('returnAll', i) as boolean;
			const limit = returnAll ? null : (ctx.getNodeParameter('limit', i) as number);
			return await listSites(client, limit);
		}

		case 'delete': {
			const site = await resolveSite(client, siteParameter(ctx, i));
			await deleteSite(
				client,
				site.id,
				String(ctx.getNodeParameter('deletionConfirmation', i, '')),
			);
			return { deleted: true };
		}

		case 'updateSettings': {
			const site = await resolveSite(client, siteParameter(ctx, i));
			const changes = settingsFromCollection(
				ctx.getNodeParameter('settings', i, {}) as IDataObject,
				ctx.getTimezone(),
			);
			return await updateSettings(client, site.id, changes);
		}

		case 'create':
		case 'upsert':
			return await publishNew(ctx, client, operation, i);

		case 'update':
			return await publishExisting(ctx, client, i);
	}

	throw new Problem(`The operation '${operation}' is not supported`);
}

/**
 * Create (always a new site) and Create or Update (the caller's site with this subdomain, or a new
 * one). Settings go on before the first upload, so a password protects the content from the start. A
 * site this run created is removed again if Droply refuses its settings or its first upload outright,
 * so a refused publish does not leave an empty site holding one of the account's slots.
 */
async function publishNew(
	ctx: IExecuteFunctions,
	client: DroplyClient,
	operation: string,
	i: number,
): Promise<IDataObject> {
	const subdomain = String(ctx.getNodeParameter('subdomain', i, '')).trim();
	const source = String(ctx.getNodeParameter('source', i));
	const options = ctx.getNodeParameter('options', i, {}) as IDataObject;
	const draft = options.draft === true;

	// Without it, every run would create another site with a name Droply picks.
	if (operation === 'upsert' && subdomain === '') {
		throw new Problem(
			"'Subdomain' is empty",
			'Create or Update publishes to the site with this subdomain, so it needs one. Use Create to let Droply pick a name.',
		);
	}

	// Everything the user supplied is read and checked before the site exists.
	const content = await readContent(ctx, i, source, options);
	const settings = settingsFromOptions(options, ctx.getTimezone());
	if (content === null && draft) {
		throw new Problem(
			"'Publish As Draft' needs something to publish",
			"Choose a Source other than 'None'.",
		);
	}

	const existing = operation === 'upsert' ? await findBySubdomain(client, subdomain) : null;
	const { site: target, created } =
		existing !== null
			? { site: existing, created: false }
			: await createSiteFor(
					ctx,
					client,
					subdomain,
					String(options.siteName ?? ''),
					operation === 'upsert',
					i,
				);
	let site = target;

	let deployment: DroplyDeployment | undefined;
	try {
		if (Object.keys(settings).length > 0) {
			site = protectedAsAsked(await updateSettings(client, site.id, settings), settings);
		}
		if (content !== null) {
			deployment = await deploy(client, site.id, content, draft, randomBoundary);
		}
	} catch (error) {
		if (created && refusedOutright(error) && (await removeCreatedSite(client, site)) === 'failed') {
			(error as { note: string }).note =
				`The empty site '${site.subdomain}' it created is still in your account; delete it from the Droply dashboard.`;
		}
		throw toNodeError(ctx, error, client.baseUrl, i);
	}

	if (deployment !== undefined) {
		deployment = await settle(client, deployment, draft ? 'draft' : 'deploy', options);
	}

	return publishOutput(await getSite(client, site.id), deployment, created);
}

/**
 * A new site for Create or Create or Update. For Create or Update, a subdomain taken between the lookup
 * and the create was made by another run of the same workflow, or belongs to someone else: look once
 * more, and say which.
 */
async function createSiteFor(
	ctx: IExecuteFunctions,
	client: DroplyClient,
	subdomain: string,
	name: string,
	upsert: boolean,
	i: number,
): Promise<{ site: DroplySite; created: boolean }> {
	try {
		return { site: await createSite(client, subdomain, name), created: true };
	} catch (error) {
		if (!upsert || !isTakenSubdomain(error)) {
			throw toNodeError(ctx, error, client.baseUrl, i);
		}
	}

	const site = await findBySubdomain(client, subdomain);
	if (site === null) {
		throw new Problem(
			`The subdomain '${subdomain}' belongs to another Droply account`,
			'Choose another subdomain, or check one first with Check Subdomain Availability.',
		);
	}

	return { site, created: false };
}

/**
 * The site Droply returned after a settings change, once it confirms the password asked for is on. The
 * upload comes next, and it must not reach a site that is still public.
 */
function protectedAsAsked(site: DroplySite, settings: IDataObject): DroplySite {
	if (settings.password !== undefined && site.password_protected !== true) {
		throw new Problem(
			'Droply did not confirm the password, so nothing was uploaded',
			'Run the workflow again. If it keeps happening, contact support@droply.host.',
		);
	}

	return site;
}

/**
 * Whether Droply refused the request outright (a 4xx other than a timeout) or the node refused it before
 * sending. Only then is the new site known to be empty: after a timeout or a server-side 5xx, the upload
 * may have landed.
 */
function refusedOutright(error: unknown): boolean {
	if (error instanceof DroplyHttpError) {
		return error.status >= 400 && error.status < 500 && error.status !== 408;
	}

	return error instanceof Problem || error instanceof UploadTooLarge;
}

/** Update: a new version of an existing site, at the same address. */
async function publishExisting(
	ctx: IExecuteFunctions,
	client: DroplyClient,
	i: number,
): Promise<IDataObject> {
	const source = String(ctx.getNodeParameter('source', i));
	const options = ctx.getNodeParameter('options', i, {}) as IDataObject;
	const draft = options.draft === true;

	const content = await readContent(ctx, i, source, options);
	const settings = settingsFromOptions(options, ctx.getTimezone());
	const site = await resolveSite(client, siteParameter(ctx, i));

	if (Object.keys(settings).length > 0) {
		protectedAsAsked(await updateSettings(client, site.id, settings), settings);
	}

	let deployment =
		content === null ? undefined : await deploy(client, site.id, content, draft, randomBoundary);
	if (deployment !== undefined) {
		deployment = await settle(client, deployment, draft ? 'draft' : 'deploy', options);
	}

	return publishOutput(await getSite(client, site.id), deployment);
}

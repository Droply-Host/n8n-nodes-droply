import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import type { DroplyClient } from '../../shared/client';
import { MAX_PAGES } from '../../shared/constants';
import { siteParameter } from '../../shared/input';
import { publishOutput } from '../../shared/output';
import { Problem } from '../../shared/problem';
import { getDeployment, settle } from '../../shared/settle';
import { collect, getSite, isUuid, resolveSite } from '../../shared/sites';
import type { DroplyDeployment, DroplySite, Envelope, Page } from '../../shared/types';

export async function executeDeployment(
	ctx: IExecuteFunctions,
	client: DroplyClient,
	operation: string,
	i: number,
): Promise<IDataObject | IDataObject[]> {
	switch (operation) {
		case 'get':
			return await getDeployment(client, deploymentId(ctx, i));

		case 'getAll': {
			const site = await resolveSite(client, siteParameter(ctx, i));
			const returnAll = ctx.getNodeParameter('returnAll', i) as boolean;
			const limit = returnAll ? null : (ctx.getNodeParameter('limit', i) as number);
			return await collect<DroplyDeployment>(
				client,
				`/sites/${encodeURIComponent(site.id)}/deployments`,
				limit,
			);
		}

		case 'retry': {
			const id = deploymentId(ctx, i);
			const entry = String(ctx.getNodeParameter('entry', i, '')).trim();
			const options = ctx.getNodeParameter('options', i, {}) as IDataObject;

			let deployment = (
				await client.request<Envelope<DroplyDeployment>>({
					method: 'POST',
					path: `/deployments/${encodeURIComponent(id)}/retry`,
					json: entry !== '' ? { entry } : undefined,
				})
			).data;
			deployment = await settle(
				client,
				deployment,
				deployment.draft === true ? 'draft' : 'deploy',
				options,
			);

			return publishOutput(await getSite(client, deployment.site_id), deployment);
		}

		case 'publish': {
			const options = ctx.getNodeParameter('options', i, {}) as IDataObject;
			const target =
				ctx.getNodeParameter('draftToPublish', i) === 'id'
					? await getDeployment(client, deploymentId(ctx, i))
					: await latestDraft(client, await resolveSite(client, siteParameter(ctx, i)));

			return await flip(client, target, 'publish', options);
		}

		case 'rollback': {
			const options = ctx.getNodeParameter('options', i, {}) as IDataObject;
			const target =
				ctx.getNodeParameter('rollbackTo', i) === 'id'
					? await getDeployment(client, deploymentId(ctx, i))
					: await previousVersion(client, await resolveSite(client, siteParameter(ctx, i)));

			return await flip(client, target, 'rollback', options);
		}
	}

	throw new Problem(`The operation '${operation}' is not supported`);
}

/** Publish a draft or roll back: queue the flip, then follow the version until it is live. */
async function flip(
	client: DroplyClient,
	target: DroplyDeployment,
	action: 'publish' | 'rollback',
	options: IDataObject,
): Promise<IDataObject> {
	let deployment = (
		await client.request<Envelope<DroplyDeployment>>({
			method: 'POST',
			path: `/deployments/${encodeURIComponent(target.id)}/${action}`,
		})
	).data;
	deployment = await settle(client, deployment, 'flip', options);

	return publishOutput(await getSite(client, deployment.site_id), deployment);
}

/** The newest draft on $site. */
async function latestDraft(client: DroplyClient, site: DroplySite): Promise<DroplyDeployment> {
	const draft = await findVersion(client, site, (deployment) => deployment.status === 'staged');
	if (draft === null) {
		throw new Problem(
			`The site '${site.subdomain}' has no draft to publish`,
			"Save one with 'Publish As Draft' on a Site operation, or choose A Specific Draft.",
		);
	}

	return draft;
}

/** The version $site served before its current one: the newest superseded version older than the live one. */
async function previousVersion(client: DroplyClient, site: DroplySite): Promise<DroplyDeployment> {
	let passedCurrent = site.current_deployment_id === null;
	const previous = await findVersion(client, site, (deployment) => {
		if (deployment.id === site.current_deployment_id) {
			passedCurrent = true;
			return false;
		}
		return passedCurrent && deployment.status === 'superseded';
	});

	if (previous === null) {
		throw new Problem(
			`The site '${site.subdomain}' has no previous version to roll back to`,
			'Older versions are kept according to your plan. Choose A Specific Version to pick one yourself.',
		);
	}

	return previous;
}

/** The first of $site's deployments, newest first, that $matches. */
async function findVersion(
	client: DroplyClient,
	site: DroplySite,
	matches: (deployment: DroplyDeployment) => boolean,
): Promise<DroplyDeployment | null> {
	for (let page = 1; page <= MAX_PAGES; page++) {
		const response = await client.request<Page<DroplyDeployment>>({
			method: 'GET',
			path: `/sites/${encodeURIComponent(site.id)}/deployments`,
			qs: { page },
		});
		const found = response.data.find(matches);
		if (found !== undefined) {
			return found;
		}
		const last = response.meta?.last_page;
		if (last !== undefined ? page >= last : !response.links?.next) {
			return null;
		}
	}

	return null;
}

function deploymentId(ctx: IExecuteFunctions, i: number): string {
	const id = String(ctx.getNodeParameter('deploymentId', i)).trim();
	if (!isUuid(id)) {
		throw new Problem(
			`'${id}' is not a deployment ID`,
			'A deployment ID looks like 3f2b8c1d-7e6a-4b5c-9d8e-1f2a3b4c5d6e.',
		);
	}

	return id;
}

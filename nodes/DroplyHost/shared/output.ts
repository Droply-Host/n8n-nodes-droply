import type { IDataObject } from 'n8n-workflow';
import type { DroplyDeployment, DroplySite } from './types';

/**
 * What a publish returns: the address and the status first, for mapping into the next node, then the
 * full site and deployment records as the API gives them.
 */
export function publishOutput(
	site: DroplySite,
	deployment?: DroplyDeployment,
	created?: boolean,
): IDataObject {
	const output: IDataObject = {
		url: site.live_url,
		status: deployment?.status ?? site.status,
	};

	if (created !== undefined) {
		output.created = created;
	}

	output.site = site;
	if (deployment !== undefined) {
		output.deployment = deployment;
	}

	return output;
}

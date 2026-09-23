import {
	NodeConnectionTypes,
	type IDataObject,
	type IExecuteFunctions,
	type INodeExecutionData,
	type INodeType,
	type INodeTypeDescription,
} from 'n8n-workflow';
import { searchSites } from './listSearch/searchSites';
import { deploymentFields, deploymentOperations } from './resources/deployment/description';
import { executeDeployment } from './resources/deployment/execute';
import { siteFields, siteOperations } from './resources/site/description';
import { executeSite } from './resources/site/execute';
import type { DroplyClient } from './shared/client';
import { toNodeError } from './shared/nodeErrors';
import { clientFor } from './shared/transport';

/**
 * Programmatic, not declarative: n8n's declarative routing cannot send binary data as a multipart
 * upload, and a publish is several dependent calls (find or create the site, set its password, upload,
 * then follow the deployment until it is live).
 */
export class DroplyHost implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Droply Host',
		name: 'droplyHost',
		icon: { light: 'file:../../icons/droply.svg', dark: 'file:../../icons/droply.dark.svg' },
		group: ['output'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Publish HTML, files and static sites on Droply',
		defaults: {
			name: 'Droply Host',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'droplyApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Deployment', value: 'deployment' },
					{ name: 'Site', value: 'site' },
				],
				default: 'site',
			},
			...siteOperations,
			...siteFields,
			...deploymentOperations,
			...deploymentFields,
		],
	};

	methods = {
		listSearch: {
			searchSites,
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		let client: DroplyClient;
		try {
			client = await clientFor(this);
		} catch (error) {
			throw toNodeError(this, error, '');
		}

		for (let i = 0; i < items.length; i++) {
			try {
				const resource = this.getNodeParameter('resource', i) as string;
				const operation = this.getNodeParameter('operation', i) as string;

				const result =
					resource === 'deployment'
						? await executeDeployment(this, client, operation, i)
						: await executeSite(this, client, operation, i);

				for (const json of (Array.isArray(result) ? result : [result]) as IDataObject[]) {
					returnData.push({ json, pairedItem: { item: i } });
				}
			} catch (error) {
				const nodeError = toNodeError(this, error, client.baseUrl, i);
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: nodeError.message, description: nodeError.description ?? null },
						pairedItem: { item: i },
					});
					continue;
				}
				throw nodeError;
			}
		}

		return [returnData];
	}
}

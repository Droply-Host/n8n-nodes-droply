import type { IDisplayOptions, INodeProperties, INodePropertyOptions } from 'n8n-workflow';
import { DEFAULT_TIMEOUT_SECONDS, MAX_TIMEOUT_SECONDS, MIN_TIMEOUT_SECONDS } from './constants';

const UUID_PATTERN =
	'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

/** The site picker: from the list, or by address, subdomain or ID. */
export function siteLocator(
	displayOptions: IDisplayOptions,
	description = 'The site to use',
): INodeProperties {
	return {
		displayName: 'Site',
		name: 'site',
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		required: true,
		description,
		displayOptions,
		modes: [
			{
				displayName: 'From List',
				name: 'list',
				type: 'list',
				placeholder: 'Select a site...',
				typeOptions: {
					searchListMethod: 'searchSites',
					searchable: true,
				},
			},
			{
				displayName: 'By URL',
				name: 'url',
				type: 'string',
				placeholder: 'e.g. https://my-site.droply.id',
				validation: [
					{
						type: 'regex',
						properties: {
							regex: '^(https?://)?[A-Za-z0-9.-]+\\.[A-Za-z]{2,}(:\\d+)?(/.*)?$',
							errorMessage: 'Not a site address',
						},
					},
				],
			},
			{
				displayName: 'By Subdomain',
				name: 'subdomain',
				type: 'string',
				placeholder: 'e.g. my-portfolio',
				validation: [
					{
						type: 'regex',
						properties: {
							regex: '^[A-Za-z0-9][A-Za-z0-9-]{1,61}[A-Za-z0-9]$',
							errorMessage: 'Use 3 to 63 letters, numbers or hyphens',
						},
					},
				],
			},
			{
				displayName: 'By ID',
				name: 'id',
				type: 'string',
				placeholder: 'e.g. 9d1c2f3a-4b5c-4d6e-8f70-81a2b3c4d5e6',
				validation: [
					{
						type: 'regex',
						properties: { regex: UUID_PATTERN, errorMessage: 'Not a site ID' },
					},
				],
			},
		],
	};
}

/** Wait Until Live and its timeout, for the options collection of anything that changes what a site serves. */
export const waitOptions: INodeProperties[] = [
	{
		displayName: 'Timeout (Seconds)',
		name: 'timeout',
		type: 'number',
		default: DEFAULT_TIMEOUT_SECONDS,
		typeOptions: { minValue: MIN_TIMEOUT_SECONDS, maxValue: MAX_TIMEOUT_SECONDS },
		description:
			'How long to wait for the version to go live. Droply keeps processing after this; only the waiting stops.',
	},
	{
		displayName: 'Wait Until Live',
		name: 'waitUntilLive',
		type: 'boolean',
		default: true,
		description:
			'Whether to wait until Droply has processed the version and the site serves it, so the output has the final status',
	},
];

export function returnAllAndLimit(show: IDisplayOptions['show']): INodeProperties[] {
	return [
		{
			displayName: 'Return All',
			name: 'returnAll',
			type: 'boolean',
			default: false,
			description: 'Whether to return all results or only up to a given limit',
			displayOptions: { show },
		},
		{
			displayName: 'Limit',
			name: 'limit',
			type: 'number',
			default: 50,
			typeOptions: { minValue: 1 },
			description: 'Max number of results to return',
			displayOptions: { show: { ...show, returnAll: [false] } },
		},
	];
}

export const deploymentIdField = (
	show: IDisplayOptions['show'],
	description: string,
): INodeProperties => ({
	displayName: 'Deployment ID',
	name: 'deploymentId',
	type: 'string',
	required: true,
	default: '',
	placeholder: 'e.g. 3f2b8c1d-7e6a-4b5c-9d8e-1f2a3b4c5d6e',
	description,
	displayOptions: { show },
});

export const sourceOptions: INodePropertyOptions[] = [
	{
		name: 'File',
		value: 'file',
		description:
			'One binary file: an HTML page, a ZIP of a whole site, a PDF, an image or another document',
	},
	{
		name: 'HTML',
		value: 'html',
		description: 'A page written as HTML text',
	},
	{
		name: 'Multiple Files',
		value: 'files',
		description: 'Several binary files published together as one site',
	},
];

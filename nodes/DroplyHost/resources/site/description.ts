import type { INodeProperties } from 'n8n-workflow';
import {
	returnAllAndLimit,
	siteLocator,
	sourceOptions,
	waitOptions,
} from '../../shared/descriptions';

const PUBLISHING = ['create', 'upsert', 'update'];

export const siteOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['site'] } },
		options: [
			{
				name: 'Check Subdomain Availability',
				value: 'checkSubdomain',
				description: 'Check whether a subdomain is free to use',
				action: 'Check whether a subdomain is available',
			},
			{
				name: 'Create',
				value: 'create',
				description: 'Create a new site and publish content to it',
				action: 'Create a site',
			},
			{
				name: 'Create or Update',
				value: 'upsert',
				description: 'Create a new record, or update the current one if it already exists (upsert)',
				action: 'Create or update a site',
			},
			{
				name: 'Delete',
				value: 'delete',
				description:
					'Delete a site permanently. Sites in a space protected against accidental deletion are deleted from the Droply dashboard only.',
				action: 'Delete a site',
			},
			{
				name: 'Get',
				value: 'get',
				description: 'Retrieve a site',
				action: 'Get a site',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'Retrieve a list of sites',
				action: 'Get many sites',
			},
			{
				name: 'Update',
				value: 'update',
				description: 'Publish new content to a site, at the same address',
				action: 'Update a site',
			},
			{
				name: 'Update Settings',
				value: 'updateSettings',
				description: "Change a site's name, password or expiry",
				action: 'Update site settings',
			},
		],
		default: 'upsert',
	},
];

export const siteFields: INodeProperties[] = [
	siteLocator({
		show: { resource: ['site'], operation: ['update', 'updateSettings', 'delete', 'get'] },
	}),

	// ----- Subdomain ------------------------------------------------------------------------------
	{
		displayName: 'Subdomain',
		name: 'subdomain',
		type: 'string',
		default: '',
		placeholder: 'e.g. my-portfolio',
		description:
			'The subdomain to publish at, the first part of the address. Leave empty and Droply picks a free one.',
		displayOptions: { show: { resource: ['site'], operation: ['create'] } },
	},
	{
		displayName: 'Subdomain',
		name: 'subdomain',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. weekly-report',
		description:
			'The subdomain to publish at, the first part of the address. Publishes to your site with this subdomain, or creates it.',
		displayOptions: { show: { resource: ['site'], operation: ['upsert'] } },
	},
	{
		displayName: 'Subdomain',
		name: 'subdomain',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. my-portfolio',
		description: 'The subdomain to check',
		displayOptions: { show: { resource: ['site'], operation: ['checkSubdomain'] } },
	},

	// ----- Content --------------------------------------------------------------------------------
	{
		displayName: 'Source',
		name: 'source',
		type: 'options',
		noDataExpression: true,
		options: [
			{
				name: 'File',
				value: 'file',
				description:
					'One binary file: an HTML page, a ZIP of a whole site, a PDF, an image or another document',
			},
			{ name: 'HTML', value: 'html', description: 'A page written as HTML text' },
			{
				name: 'Multiple Files',
				value: 'files',
				description: 'Several binary files published together as one site',
			},
			{
				name: 'None',
				value: 'none',
				description: 'Reserve the address without publishing anything yet',
			},
		],
		default: 'html',
		description: 'What to publish',
		displayOptions: { show: { resource: ['site'], operation: ['create'] } },
	},
	{
		displayName: 'Source',
		name: 'source',
		type: 'options',
		noDataExpression: true,
		options: sourceOptions,
		default: 'html',
		description: 'What to publish',
		displayOptions: { show: { resource: ['site'], operation: ['upsert', 'update'] } },
	},
	{
		displayName: 'HTML',
		name: 'html',
		type: 'string',
		typeOptions: { rows: 10 },
		required: true,
		default: '',
		placeholder: 'e.g. <!doctype html><title>Hello</title><h1>Hello</h1>',
		description:
			'The page to publish, as a complete HTML document. It becomes the index.html of the site.',
		displayOptions: { show: { resource: ['site'], operation: PUBLISHING, source: ['html'] } },
	},
	{
		displayName: 'Input Binary Field',
		name: 'binaryPropertyName',
		type: 'string',
		required: true,
		default: 'data',
		placeholder: 'e.g. data',
		hint: 'The name of the input field holding the file',
		description:
			'A .zip is published as a whole site, .html as a page, .pdf with a document viewer. The extension decides.',
		displayOptions: { show: { resource: ['site'], operation: PUBLISHING, source: ['file'] } },
	},
	{
		displayName: 'Input Binary Fields',
		name: 'binaryPropertyNames',
		type: 'string',
		default: '',
		placeholder: 'e.g. html, css, logo',
		description:
			'Comma-separated names of the input fields holding the files. Leave empty to publish every binary field on the item. To combine files from several items, put an Aggregate node (with Include Binaries) before this one.',
		displayOptions: { show: { resource: ['site'], operation: PUBLISHING, source: ['files'] } },
	},

	// ----- Publishing options ---------------------------------------------------------------------
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: { show: { resource: ['site'], operation: PUBLISHING } },
		options: [
			{
				displayName: 'Expire After (Hours)',
				name: 'expireAfterHours',
				type: 'number',
				default: 24,
				typeOptions: { minValue: 1 },
				description: "Take the site offline behind a 'link expired' page after this many hours",
			},
			{
				displayName: 'Expire At',
				name: 'expireAt',
				type: 'dateTime',
				default: '',
				description: "Take the site offline behind a 'link expired' page at this moment",
			},
			{
				displayName: 'File Name',
				name: 'fileName',
				type: 'string',
				default: '',
				placeholder: 'e.g. site.zip',
				description:
					'The name to upload the file under, instead of its own. The extension decides how Droply serves it.',
				displayOptions: { show: { '/source': ['file'] } },
			},
			{
				displayName: 'Keep Folder Structure',
				name: 'keepFolders',
				type: 'boolean',
				default: true,
				description:
					'Whether files keep their folders, relative to the folder they share (as Read Files From Disk reads them). When off, every file goes to the root under its own name.',
				displayOptions: { show: { '/source': ['files'] } },
			},
			{
				displayName: 'Password',
				name: 'password',
				type: 'string',
				typeOptions: { password: true },
				default: '',
				description:
					'Protect the site with this visitor password. It is set before anything is uploaded, so the content is never public without it.',
			},
			{
				displayName: 'Publish As Draft',
				name: 'draft',
				type: 'boolean',
				default: false,
				description:
					'Whether to save this version as a draft instead of making it live. Publish it later with Deployment > Publish Draft.',
			},
			{
				displayName: 'Site Name',
				name: 'siteName',
				type: 'string',
				default: '',
				placeholder: 'e.g. Spring launch',
				description: 'A name for the site in your Droply dashboard. Used when the site is created.',
				displayOptions: { show: { '/operation': ['create', 'upsert'] } },
			},
			...waitOptions,
		],
	},

	// ----- Update Settings ------------------------------------------------------------------------
	{
		displayName: 'Settings',
		name: 'settings',
		type: 'collection',
		placeholder: 'Add Setting',
		default: {},
		displayOptions: { show: { resource: ['site'], operation: ['updateSettings'] } },
		options: [
			{
				displayName: 'Expire After (Hours)',
				name: 'expireAfterHours',
				type: 'number',
				default: 24,
				typeOptions: { minValue: 1 },
				description: "Take the site offline behind a 'link expired' page after this many hours",
			},
			{
				displayName: 'Expire At',
				name: 'expireAt',
				type: 'dateTime',
				default: '',
				description: "Take the site offline behind a 'link expired' page at this moment",
			},
			{
				displayName: 'Name',
				name: 'name',
				type: 'string',
				default: '',
				description: 'The name of the site in your Droply dashboard',
			},
			{
				displayName: 'Password',
				name: 'password',
				type: 'string',
				typeOptions: { password: true },
				default: '',
				description: 'Protect the site with this visitor password, or replace the one it has',
			},
			{
				displayName: 'Remove Expiry',
				name: 'removeExpiry',
				type: 'boolean',
				default: true,
				description:
					'Whether to remove the auto-expiry timer. A site that already expired comes back online.',
			},
			{
				displayName: 'Remove Password',
				name: 'removePassword',
				type: 'boolean',
				default: true,
				description:
					'Whether to remove the visitor password, so anyone with the address can open the site',
			},
		],
	},

	// ----- Get Many -------------------------------------------------------------------------------
	...returnAllAndLimit({ resource: ['site'], operation: ['getAll'] }),
];

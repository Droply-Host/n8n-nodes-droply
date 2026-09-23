import type { INodeProperties } from 'n8n-workflow';
import {
	deploymentIdField,
	returnAllAndLimit,
	siteLocator,
	waitOptions,
} from '../../shared/descriptions';

export const deploymentOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['deployment'] } },
		options: [
			{
				name: 'Get',
				value: 'get',
				description: 'Retrieve a deployment and its status',
				action: 'Get a deployment',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: "Retrieve a list of a site's deployments, newest first",
				action: 'Get many deployments',
			},
			{
				name: 'Publish Draft',
				value: 'publish',
				description: 'Make a draft the version the site serves',
				action: 'Publish a draft',
			},
			{
				name: 'Retry',
				value: 'retry',
				description: 'Process a failed deployment again, optionally choosing the page it opens on',
				action: 'Retry a deployment',
			},
			{
				name: 'Roll Back',
				value: 'rollback',
				description: 'Make a previous version live again, at the same address',
				action: 'Roll back a site',
			},
		],
		default: 'get',
	},
];

export const deploymentFields: INodeProperties[] = [
	deploymentIdField({ resource: ['deployment'], operation: ['get'] }, 'The deployment to retrieve'),
	deploymentIdField(
		{ resource: ['deployment'], operation: ['retry'] },
		'The failed deployment to process again',
	),

	// ----- Publish Draft --------------------------------------------------------------------------
	{
		displayName: 'Draft',
		name: 'draftToPublish',
		type: 'options',
		noDataExpression: true,
		options: [
			{
				name: 'Latest Draft of a Site',
				value: 'latest',
				description:
					'The newest draft on the site, whoever saved it. In an approval flow use A Specific Draft, so only the version that was approved goes live.',
			},
			{ name: 'A Specific Draft', value: 'id', description: 'A draft given by its deployment ID' },
		],
		default: 'id',
		description: 'Which draft to publish',
		displayOptions: { show: { resource: ['deployment'], operation: ['publish'] } },
	},
	siteLocator(
		{ show: { resource: ['deployment'], operation: ['publish'], draftToPublish: ['latest'] } },
		'The site whose newest draft to publish',
	),
	deploymentIdField(
		{ resource: ['deployment'], operation: ['publish'], draftToPublish: ['id'] },
		'The draft to publish',
	),

	// ----- Roll Back ------------------------------------------------------------------------------
	{
		displayName: 'Roll Back To',
		name: 'rollbackTo',
		type: 'options',
		noDataExpression: true,
		options: [
			{
				name: 'The Previous Version',
				value: 'previous',
				description: 'The version the site served before the current one',
			},
			{
				name: 'A Specific Version',
				value: 'id',
				description: 'A previous version given by its deployment ID',
			},
		],
		default: 'previous',
		description: 'Which version to make live again',
		displayOptions: { show: { resource: ['deployment'], operation: ['rollback'] } },
	},
	siteLocator(
		{ show: { resource: ['deployment'], operation: ['rollback'], rollbackTo: ['previous'] } },
		'The site to roll back',
	),
	deploymentIdField(
		{ resource: ['deployment'], operation: ['rollback'], rollbackTo: ['id'] },
		'The previous version to make live again',
	),

	// ----- Get Many -------------------------------------------------------------------------------
	siteLocator(
		{ show: { resource: ['deployment'], operation: ['getAll'] } },
		'The site whose deployments to list',
	),
	...returnAllAndLimit({ resource: ['deployment'], operation: ['getAll'] }),

	// ----- Retry ----------------------------------------------------------------------------------
	{
		displayName: 'Entry',
		name: 'entry',
		type: 'string',
		default: '',
		placeholder: 'e.g. about.html',
		description:
			"The page the site should open on, for a deployment that failed because it could not tell. Use one of the values in the failed deployment's index_choices.",
		displayOptions: { show: { resource: ['deployment'], operation: ['retry'] } },
	},

	// ----- Waiting --------------------------------------------------------------------------------
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: {
			show: { resource: ['deployment'], operation: ['publish', 'rollback', 'retry'] },
		},
		options: waitOptions,
	},
];

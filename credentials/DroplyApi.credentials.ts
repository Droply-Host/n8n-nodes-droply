import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class DroplyApi implements ICredentialType {
	name = 'droplyApi';

	displayName = 'Droply API';

	icon: Icon = { light: 'file:../icons/droply.svg', dark: 'file:../icons/droply.dark.svg' };

	documentationUrl = 'https://droply.host/docs/integrations/n8n#connect';

	properties: INodeProperties[] = [
		{
			displayName: 'API Token',
			name: 'apiToken',
			type: 'string',
			typeOptions: { password: true },
			required: true,
			default: '',
			description:
				'A Full access token from API tokens in your Droply dashboard. API access is included on Pro and higher plans.',
		},
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://droply.host',
			description: 'Leave as it is unless Droply support asks you to change it',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiToken}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			// Tolerates a trailing slash or a pasted /api/v1, as the node's own requests do.
			baseURL:
				'={{$credentials.baseUrl.trim().replace(/\\/+$/, "").replace(/\\/api\\/v1$/, "")}}/api/v1',
			url: '/user',
			method: 'GET',
		},
	};
}

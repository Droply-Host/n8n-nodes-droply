import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';
import { DEFAULT_BASE_URL, DROPLY_ORIGIN, LOCAL_ORIGIN } from '../nodes/DroplyHost/shared/baseUrl';

/** The Base URL as the node tidies it: trimmed, lowercased, without a trailing slash or /api/v1. */
const ORIGIN =
	'($credentials.baseUrl || "").trim().replace(/[/]+$/, "").replace(/[/]api[/]v1$/i, "").toLowerCase()';

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
			default: DEFAULT_BASE_URL,
			description:
				'Leave as it is. Droply support will never ask you to change it. Only droply.host addresses (and local addresses, for development) are accepted.',
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

	// Same rule as the node: the token is only ever sent to a Droply address. Anything else is tested
	// against https://droply.host instead, where a token meant for another host simply fails.
	test: ICredentialTestRequest = {
		request: {
			baseURL: `={{ /${DROPLY_ORIGIN}/.test(${ORIGIN}) || /${LOCAL_ORIGIN}/.test(${ORIGIN}) ? ${ORIGIN} : "${DEFAULT_BASE_URL}" }}/api/v1`,
			url: '/user',
			method: 'GET',
		},
	};
}

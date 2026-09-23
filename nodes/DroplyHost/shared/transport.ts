import { randomBytes } from 'crypto';
import {
	sleep,
	type IDataObject,
	type IExecuteFunctions,
	type IHttpRequestOptions,
	type ILoadOptionsFunctions,
	type IN8nHttpFullResponse,
} from 'n8n-workflow';
import { normalizeBaseUrl, parseBody } from './baseUrl';
import { DroplyClient, type ApiRequest, type ApiResponse } from './client';
import { API_PREFIX, CLIENT_HEADER, CLIENT_NAME, CREDENTIAL_TYPE } from './constants';
import { newBoundary } from './multipart';

type Context = IExecuteFunctions | ILoadOptionsFunctions;

/**
 * A client for the credential's Droply. The token only ever travels to the credential's Base URL (the
 * credential's `authenticate` adds it), and redirects are never followed, so it cannot be carried to
 * another host.
 */
export async function clientFor(ctx: Context): Promise<DroplyClient> {
	const credentials = await ctx.getCredentials(CREDENTIAL_TYPE);
	const baseUrl = normalizeBaseUrl(String(credentials.baseUrl ?? ''));
	const signal = 'getExecutionCancelSignal' in ctx ? ctx.getExecutionCancelSignal() : undefined;

	return new DroplyClient(
		(request) => send(ctx, baseUrl, request),
		async (ms) => await sleep(ms, signal),
		baseUrl,
	);
}

export function randomBoundary(): string {
	return newBoundary(randomBytes(16).toString('hex'));
}

async function send(ctx: Context, baseUrl: string, request: ApiRequest): Promise<ApiResponse> {
	const headers: IDataObject = { Accept: 'application/json', [CLIENT_HEADER]: CLIENT_NAME };
	const options: IHttpRequestOptions = {
		method: request.method,
		url: `${baseUrl}${API_PREFIX}${request.path}`,
		qs: request.qs,
		headers,
		returnFullResponse: true,
		ignoreHttpStatusErrors: true,
		disableFollowRedirect: true,
		// An upload of up to 100 MB can take a while on a slow line; everything else answers in seconds.
		timeout: request.body !== undefined ? 300_000 : 60_000,
	};

	if (request.json !== undefined) {
		options.body = request.json;
		options.json = true;
	} else if (request.body !== undefined) {
		options.body = request.body;
		headers['Content-Type'] = request.contentType ?? 'application/octet-stream';
	}

	const response = (await ctx.helpers.httpRequestWithAuthentication.call(
		ctx,
		CREDENTIAL_TYPE,
		options,
	)) as IN8nHttpFullResponse;

	return {
		statusCode: response.statusCode,
		headers: (response.headers ?? {}) as IDataObject,
		body: parseBody(response.body),
	};
}

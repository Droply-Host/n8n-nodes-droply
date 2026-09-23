import type { IDataObject } from 'n8n-workflow';

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export type ApiRequest = {
	method: HttpMethod;
	/** Under /api/v1, starting with a slash: '/sites', '/deployments/{id}'. */
	path: string;
	qs?: IDataObject;
	/** A JSON body. */
	json?: IDataObject;
	/** A raw body (a multipart upload), sent with $contentType. */
	body?: Buffer;
	contentType?: string;
};

export type ApiResponse = {
	statusCode: number;
	headers: IDataObject;
	body: unknown;
};

/** Sends one request and returns the response whatever its status; throws only when nothing came back. */
export type Send = (request: ApiRequest) => Promise<ApiResponse>;

export type Sleep = (ms: number) => Promise<void>;

/** Droply answered, with a status that is not a success. */
export class DroplyHttpError extends Error {
	/** Added when a clean-up after this refusal also went wrong, so the user knows what was left behind. */
	note = '';

	constructor(
		readonly status: number,
		readonly body: unknown,
		readonly headers: IDataObject,
		readonly request: Pick<ApiRequest, 'method' | 'path'>,
	) {
		super(`Droply answered ${status} to ${request.method} ${request.path}`);
	}
}

/** The longest Retry-After the client waits out by itself. Past this, the user decides. */
const MAX_RETRY_AFTER_SECONDS = 60;

/**
 * Talks to /api/v1 through $send and retries only where retrying cannot do anything twice:
 *
 * - 429 with Retry-After: the throttle refused before the server did anything, so even a POST is safe.
 * - 5xx on a GET: reads have no side effects. A POST is NEVER retried, because the API has no
 *   idempotency key and a deploy that did land would be made twice.
 * - A deploy refused because too many are still processing (422 on `deploy`): refused before anything
 *   was stored, so it is waited out a few times.
 */
export class DroplyClient {
	constructor(
		private readonly send: Send,
		/** Waits between polls and retries; stops early when the execution is cancelled. */
		readonly sleep: Sleep,
		readonly baseUrl: string,
	) {}

	async request<T>(request: ApiRequest): Promise<T> {
		for (let attempt = 0; ; attempt++) {
			const response = await this.send(request);

			if (response.statusCode >= 200 && response.statusCode < 300) {
				return response.body as T;
			}

			const wait = retryDelay(request, response, attempt);
			if (wait === null) {
				throw new DroplyHttpError(response.statusCode, response.body, response.headers, request);
			}

			await this.sleep(wait);
		}
	}
}

/** Milliseconds to wait before trying $request again, or null to give up now. */
export function retryDelay(
	request: ApiRequest,
	response: ApiResponse,
	attempt: number,
): number | null {
	const status = response.statusCode;

	if (status === 429) {
		const seconds = retryAfterSeconds(response.headers);
		return attempt < 3 && seconds !== null && seconds <= MAX_RETRY_AFTER_SECONDS
			? Math.max(1, seconds) * 1000
			: null;
	}

	if (status >= 500 && request.method === 'GET') {
		return attempt < 2 ? [1000, 3000][attempt] : null;
	}

	if (status === 422 && isDeployRequest(request) && hasFieldError(response.body, 'deploy')) {
		return attempt < 3 ? 5000 : null;
	}

	return null;
}

export function retryAfterSeconds(headers: IDataObject): number | null {
	const raw = headers['retry-after'] ?? headers['Retry-After'];
	const seconds = Number(Array.isArray(raw) ? raw[0] : raw);

	return Number.isFinite(seconds) && seconds >= 0 ? Math.ceil(seconds) : null;
}

function isDeployRequest(request: ApiRequest): boolean {
	return request.method === 'POST' && /^\/sites\/[^/]+\/deployments$/.test(request.path);
}

function hasFieldError(body: unknown, field: string): boolean {
	const errors = (body as { errors?: Record<string, unknown> } | null)?.errors;

	return errors !== undefined && errors !== null && typeof errors === 'object' && field in errors;
}

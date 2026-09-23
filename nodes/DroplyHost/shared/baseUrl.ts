import { Problem } from './problem';

/**
 * The only places the token may be sent. A free-form Base URL would let anyone who can edit the
 * credential, or a message posing as support, send the token to a host of their choosing, so the node
 * and the credential test accept only Droply's own addresses and a Droply running on this machine.
 * Written with [/] rather than \/ so the same text works as a regex literal in the credential's test
 * expression.
 */
export const DROPLY_ORIGIN = '^https:[/][/]([a-z0-9-]+[.])*droply[.]host$';

/** http:// or https:// to a Droply on this machine or a private test host, for development. */
export const LOCAL_ORIGIN =
	'^https?:[/][/](localhost|127[.]0[.]0[.]1|host[.]docker[.]internal|([a-z0-9-]+[.])+(localhost|test|localtest[.]me))(:[0-9]+)?$';

export const DEFAULT_BASE_URL = 'https://droply.host';

/**
 * The credential's Base URL, tidied (a trailing slash or a pasted /api/v1 is dropped) and checked
 * against the addresses above.
 */
export function normalizeBaseUrl(raw: string): string {
	const origin = (raw.trim() || DEFAULT_BASE_URL)
		.replace(/\/+$/, '')
		.replace(/\/api\/v1$/i, '')
		.toLowerCase();

	if (!new RegExp(DROPLY_ORIGIN).test(origin) && !new RegExp(LOCAL_ORIGIN).test(origin)) {
		throw new Problem(
			`'${raw.trim()}' is not a Droply address`,
			"Set the Droply API credential's Base URL to https://droply.host. Droply support will never ask you to change it.",
		);
	}

	return origin;
}

/** n8n hands back JSON as an object, a string or a Buffer depending on the request; read all three. */
export function parseBody(body: unknown): unknown {
	const text = Buffer.isBuffer(body)
		? body.toString('utf8')
		: typeof body === 'string'
			? body
			: null;
	if (text === null) {
		return body;
	}
	// Empty, or an HTML error page from a proxy in front of the API: nothing worth showing as a message.
	if (text.trim() === '' || text.trimStart().startsWith('<')) {
		return null;
	}

	try {
		return JSON.parse(text);
	} catch {
		return { message: text.slice(0, 500) };
	}
}

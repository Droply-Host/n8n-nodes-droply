import { Problem } from './problem';

/** http:// is only for a Droply running on this machine or a private test host. */
const LOCAL_HOST =
	/^(localhost|127\.0\.0\.1|\[::1\]|host\.docker\.internal)$|\.(localhost|test|localtest\.me)$/i;

/**
 * The credential's Base URL, tidied: a trailing slash or a pasted /api/v1 is dropped, and anything but
 * https is refused unless it points at this machine, so the token never crosses the network in clear.
 */
export function normalizeBaseUrl(raw: string): string {
	const value = (raw.trim() || 'https://droply.host')
		.replace(/\/+$/, '')
		.replace(/\/api\/v1$/i, '');

	const url = URL.canParse(value) ? new URL(value) : null;
	if (url === null) {
		throw new Problem(
			`'${raw}' is not a valid Base URL`,
			"Set the Droply API credential's Base URL to https://droply.host.",
		);
	}

	if (url.protocol !== 'https:' && !(url.protocol === 'http:' && LOCAL_HOST.test(url.hostname))) {
		throw new Problem(
			'The Base URL must start with https://',
			"Set the Droply API credential's Base URL to https://droply.host.",
		);
	}

	return `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/, '')}`;
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

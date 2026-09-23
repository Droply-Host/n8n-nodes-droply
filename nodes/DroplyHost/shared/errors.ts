import { retryAfterSeconds } from './client';
import type { IDataObject } from 'n8n-workflow';

export type Explanation = { message: string; description: string };

/** What the user sees for each parameter the API names in a 422. */
const FIELD_LABELS: Record<string, string> = {
	subdomain: 'Subdomain',
	name: 'Site Name',
	html: 'HTML',
	file: 'File',
	upload: 'File',
	deploy: 'Deploy',
	password: 'Password',
	password_protected: 'Remove Password',
	expires_at: 'Expire At',
	confirm: 'Deletion Confirmation',
	entry: 'Entry',
	draft: 'Publish As Draft',
	host: 'Site URL',
};

/**
 * Turn a non-success answer from Droply into a message that says what happened and a description that
 * says what to do. Follows n8n's UX guidelines: no "error", "problem" or "failure" in the message, and
 * a fix in the description. Nothing here echoes the token or a password: the API never returns them.
 */
export function explain(
	status: number,
	body: unknown,
	headers: IDataObject,
	baseUrl: string,
): Explanation {
	const serverMessage = messageOf(body);
	const tokensPage = `${baseUrl}/dashboard/api-tokens`;
	const billingPage = `${baseUrl}/dashboard/billing`;

	if (status === 401) {
		return {
			message: 'Droply did not accept the API token',
			description: `Create a Full access token under API tokens (${tokensPage}) and paste it into the Droply API credential.`,
		};
	}

	if (status === 403) {
		if (/plan does not include/i.test(serverMessage)) {
			return {
				message: serverMessage,
				description: `This is included on Pro and higher plans. Upgrade at ${billingPage}, then run the workflow again.`,
			};
		}
		if (/not permitted/i.test(serverMessage)) {
			return {
				message: serverMessage,
				description: `Create a Full access token under API tokens (${tokensPage}). Tokens made by the browser or editor extensions can only deploy.`,
			};
		}
		if (/confirm your email/i.test(serverMessage)) {
			return {
				message: serverMessage,
				description: 'Open the confirmation email Droply sent you, then run the workflow again.',
			};
		}

		return {
			message: serverMessage || 'Droply refused this request for this account or token',
			description:
				'Check that the token belongs to the account that owns this site, and that the account is active.',
		};
	}

	if (status === 404) {
		return {
			message: 'The site or version was not found in this Droply account',
			description:
				"Check the ID, subdomain or address. Sites shared with you by a team are only reachable with their owner's token.",
		};
	}

	if (status === 409) {
		return {
			message: serverMessage || 'That version is not in a state this action applies to',
			description: 'Nothing was changed. Get the deployment to see its current status.',
		};
	}

	if (status === 413) {
		return {
			message: 'The upload is larger than Droply accepts in one request',
			description:
				'One upload can be at most 100 MB, including the request framing. Publish fewer or smaller files.',
		};
	}

	if (status === 422) {
		const fields = fieldMessages(body);
		const first = fields[0]?.text ?? serverMessage ?? 'Droply could not accept these values';
		const lines = fields.map(
			(field) => `'${FIELD_LABELS[field.field] ?? field.field}': ${field.text}`,
		);
		const hints: string[] = [];

		if (fields.some((field) => field.field === 'confirm')) {
			hints.push(
				"This site is in a space protected against accidental deletion: type its subdomain in 'Deletion Confirmation'.",
			);
		}
		if (fields.some((field) => /upgrade/i.test(field.text))) {
			hints.push(`Upgrade at ${billingPage}.`);
		}

		return {
			message: first,
			description: [...lines, ...hints].join(' ') || 'Check the values sent and try again.',
		};
	}

	if (status === 429) {
		const seconds = retryAfterSeconds(headers);

		return {
			message: "Droply's rate limit was reached",
			description:
				(seconds !== null
					? `Wait ${seconds} seconds and try again. `
					: 'Wait a minute and try again. ') +
				'Each token may make 60 requests a minute, and drafts can be published or rolled back 30 times an hour. Give a busy workflow its own token.',
		};
	}

	if (status >= 300 && status < 400) {
		return {
			message: 'The Base URL redirected somewhere else',
			description: "Set the Droply API credential's Base URL to https://droply.host.",
		};
	}

	if (status >= 500) {
		return {
			message: 'Droply could not complete the request',
			description:
				'Try again in a few minutes. If it keeps happening, contact support@droply.host.',
		};
	}

	return {
		message: serverMessage || `Droply answered with status ${status}`,
		description: 'Check the values sent and try again.',
	};
}

export function messageOf(body: unknown): string {
	const message = (body as { message?: unknown } | null)?.message;

	return typeof message === 'string' ? message.trim() : '';
}

function fieldMessages(body: unknown): Array<{ field: string; text: string }> {
	const errors = (body as { errors?: unknown } | null)?.errors;
	if (errors === null || typeof errors !== 'object') {
		return [];
	}

	const out: Array<{ field: string; text: string }> = [];
	for (const [field, value] of Object.entries(errors as Record<string, unknown>)) {
		for (const text of Array.isArray(value) ? value : [value]) {
			if (typeof text === 'string' && text.trim() !== '') {
				out.push({ field: field.split('.')[0], text: text.trim() });
			}
		}
	}

	return out;
}

import type { IExecuteFunctions, INode } from 'n8n-workflow';
import { describe, expect, it } from 'vitest';
import { DroplyHttpError } from '../nodes/DroplyHost/shared/client';
import { toNodeError } from '../nodes/DroplyHost/shared/nodeErrors';

const node: INode = {
	id: 'node-1',
	name: 'Droply Host',
	type: 'n8n-nodes-droply.droplyHost',
	typeVersion: 1,
	position: [0, 0],
	parameters: {},
};
const ctx = { getNode: () => node } as unknown as IExecuteFunctions;

describe('toNodeError', () => {
	it('keeps the name an older Droply asked for out of every part of a protected-delete error', () => {
		// An older Droply refused a protected delete with the subdomain to send back. An AI agent
		// using the node as a tool must not find it anywhere in the error it is handed.
		const refusal = new DroplyHttpError(
			422,
			{
				message: 'This is in a space protected against accidental deletion.',
				errors: {
					confirm: [
						'This is in a space protected against accidental deletion. Send its name in "confirm" to delete it: acme-portfolio',
					],
				},
			},
			{},
			{ method: 'DELETE', path: '/sites/9d1c2f3a-4b5c-4d6e-8f70-81a2b3c4d5e6' },
		);

		const error = toNodeError(ctx, refusal, 'https://droply.host');

		expect(error.message).toBe('This site is in a space protected against accidental deletion');
		for (const part of [
			error.message,
			error.description ?? '',
			JSON.stringify(error),
			// n8n keeps the answer it was given here, and shows it in the error details.
			JSON.stringify((error as { errorResponse?: unknown }).errorResponse ?? null),
			JSON.stringify((error as { messages?: unknown }).messages ?? null),
		]) {
			expect(part).not.toContain('acme-portfolio');
		}
	});

	it('still carries the server answer for other refusals', () => {
		const refusal = new DroplyHttpError(
			409,
			{ message: 'Only a draft version can be published.' },
			{},
			{ method: 'POST', path: '/deployments/x/publish' },
		);

		expect(JSON.stringify(toNodeError(ctx, refusal, 'https://droply.host'))).toContain(
			'Only a draft version can be published.',
		);
	});
});

import { describe, expect, it } from 'vitest';
import { explain } from '../nodes/DroplyHost/shared/errors';

const base = 'https://droply.host';

describe('explain', () => {
	it('sends a rejected token to the API tokens page', () => {
		const result = explain(401, { message: 'Unauthenticated.' }, {}, base);

		expect(result.message).toBe('Droply did not accept the API token');
		expect(result.description).toContain(`${base}/dashboard/api-tokens`);
	});

	it('offers the upgrade when the plan lacks API access or a feature', () => {
		for (const message of [
			'Your plan does not include API access. Upgrade to enable it.',
			'Your plan does not include drafts. Upgrade to publish this version.',
		]) {
			const result = explain(403, { message }, {}, base);
			expect(result.message).toBe(message);
			expect(result.description).toContain(`${base}/dashboard/billing`);
		}
	});

	it('asks for a Full access token when the token is too narrow', () => {
		const result = explain(
			403,
			{ message: 'This token is not permitted to delete sites.' },
			{},
			base,
		);

		expect(result.description).toContain('Full access token');
	});

	it('says what to do about an unconfirmed email', () => {
		const result = explain(
			403,
			{ message: 'Confirm your email address to use the API.' },
			{},
			base,
		);

		expect(result.description).toContain('confirmation email');
	});

	it('names every field a 422 refused, with the parameter the user sees', () => {
		const result = explain(
			422,
			{
				message: 'That name is already taken. (and 1 more error)',
				errors: {
					subdomain: ['That name is already taken.'],
					html: ['The html field is required.'],
				},
			},
			{},
			base,
		);

		expect(result.message).toBe('That name is already taken.');
		expect(result.description).toContain("'Subdomain': That name is already taken.");
		expect(result.description).toContain("'HTML': The html field is required.");
	});

	it('sends a protected delete to the dashboard without repeating the name to send', () => {
		const answers = [
			// Droply now: nothing sent through the API unlocks a protected site.
			explain(
				403,
				{
					message:
						'This site is in a space protected against accidental deletion, so it can only be deleted from the dashboard. To delete it through the API, turn off deletion protection for its space first.',
				},
				{},
				base,
			),
			// An older Droply asked for the subdomain in `confirm`, and named it.
			explain(
				422,
				{
					errors: {
						confirm: [
							'This is in a space protected against accidental deletion. Send its name in "confirm" to delete it: acme-portfolio',
						],
					},
				},
				{},
				base,
			),
		];

		for (const answer of answers) {
			expect(answer.message).toBe('This site is in a space protected against accidental deletion');
			expect(answer.description).toContain('Droply dashboard');
			expect(`${answer.message} ${answer.description}`).not.toContain('acme-portfolio');
		}
	});

	it('points a plan limit at billing', () => {
		expect(
			explain(
				422,
				{ errors: { subdomain: ['Your plan allows 5 project(s). Upgrade to add more.'] } },
				{},
				base,
			).description,
		).toContain(`${base}/dashboard/billing`);
	});

	it('gives the wait from Retry-After on a rate limit', () => {
		expect(
			explain(429, { message: 'Too Many Attempts.' }, { 'retry-after': '17' }, base).description,
		).toContain('Wait 17 seconds');
	});

	it('explains conflicts, size, redirects and server trouble without the words n8n asks nodes to avoid', () => {
		const cases = [
			explain(409, { message: 'Only a draft version can be published.' }, {}, base),
			explain(413, null, {}, base),
			explain(302, null, {}, base),
			explain(502, null, {}, base),
			explain(404, { message: '' }, {}, base),
		];

		for (const result of cases) {
			expect(result.message).not.toMatch(/error|problem|failure|mistake/i);
			expect(result.description).not.toBe('');
		}
		expect(cases[0].message).toBe('Only a draft version can be published.');
	});
});

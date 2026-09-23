import { describe, expect, it } from 'vitest';
import { hoursFromNow, toUtc } from '../nodes/DroplyHost/shared/dates';
import {
	expiryFrom,
	settingsFromCollection,
	settingsFromOptions,
} from '../nodes/DroplyHost/shared/input';
import { Problem } from '../nodes/DroplyHost/shared/problem';
import { normalizeBaseUrl, parseBody } from '../nodes/DroplyHost/shared/baseUrl';

describe('toUtc', () => {
	it("reads the picker's wall-clock time in the workflow's time zone", () => {
		expect(toUtc('2026-10-01T18:00:00', 'America/Sao_Paulo')).toBe('2026-10-01T21:00:00Z');
		expect(toUtc('2026-07-01T12:00:00', 'Europe/Berlin')).toBe('2026-07-01T10:00:00Z');
		expect(toUtc('2026-01-15 09:30', 'UTC')).toBe('2026-01-15T09:30:00Z');
	});

	it('lands right on a daylight-saving change', () => {
		// Berlin moves from UTC+1 to UTC+2 at 02:00 local on 2026-03-29.
		expect(toUtc('2026-03-29T01:30:00', 'Europe/Berlin')).toBe('2026-03-29T00:30:00Z');
		expect(toUtc('2026-03-29T03:30:00', 'Europe/Berlin')).toBe('2026-03-29T01:30:00Z');
	});

	it('keeps a moment that already carries its offset', () => {
		expect(toUtc('2026-10-01T18:00:00-03:00', 'Europe/Berlin')).toBe('2026-10-01T21:00:00Z');
		expect(toUtc('2026-10-01T18:00:00.000Z', 'Europe/Berlin')).toBe('2026-10-01T18:00:00Z');
	});

	it('refuses what is not a date', () => {
		expect(toUtc('tomorrow', 'UTC')).toBeNull();
		expect(toUtc('', 'UTC')).toBeNull();
	});
});

describe('hoursFromNow', () => {
	it('adds the hours in UTC', () => {
		expect(hoursFromNow(2, Date.UTC(2026, 0, 1, 23, 0, 0))).toBe('2026-01-02T01:00:00Z');
	});
});

describe('expiryFrom', () => {
	it('takes one of the two ways to set a timer, never both', () => {
		expect(expiryFrom({}, 'UTC')).toBeUndefined();
		expect(expiryFrom({ expireAt: '2030-01-01T00:00:00' }, 'UTC')).toBe('2030-01-01T00:00:00Z');
		expect(() =>
			expiryFrom({ expireAfterHours: 2, expireAt: '2030-01-01T00:00:00' }, 'UTC'),
		).toThrow(Problem);
		expect(() => expiryFrom({ expireAfterHours: 0 }, 'UTC')).toThrow(Problem);
		expect(() => expiryFrom({ expireAt: 'soon' }, 'UTC')).toThrow(Problem);
	});
});

describe('settingsFromOptions', () => {
	it('turns publishing options into the settings sent before the upload', () => {
		expect(settingsFromOptions({ password: 'hunter22', waitUntilLive: true }, 'UTC')).toEqual({
			password: 'hunter22',
		});
		expect(settingsFromOptions({ draft: true }, 'UTC')).toEqual({});
	});
});

describe('settingsFromCollection', () => {
	it('maps removals to what the API expects', () => {
		expect(settingsFromCollection({ removePassword: true, removeExpiry: true }, 'UTC')).toEqual({
			password_protected: false,
			expires_at: null,
		});
		expect(settingsFromCollection({ name: '  ' }, 'UTC')).toEqual({ name: null });
	});

	it('refuses contradictions and an empty change', () => {
		expect(() =>
			settingsFromCollection({ password: 'hunter22', removePassword: true }, 'UTC'),
		).toThrow(Problem);
		expect(() =>
			settingsFromCollection({ expireAfterHours: 3, removeExpiry: true }, 'UTC'),
		).toThrow(Problem);
		expect(() => settingsFromCollection({ removePassword: false }, 'UTC')).toThrow(Problem);
	});
});

describe('normalizeBaseUrl', () => {
	it('accepts https and a local Droply, and trims what people paste', () => {
		expect(normalizeBaseUrl('https://droply.host/')).toBe('https://droply.host');
		expect(normalizeBaseUrl(' https://droply.host/api/v1 ')).toBe('https://droply.host');
		expect(normalizeBaseUrl('')).toBe('https://droply.host');
		expect(normalizeBaseUrl('http://host.docker.internal:8000')).toBe(
			'http://host.docker.internal:8000',
		);
		expect(normalizeBaseUrl('http://droply.test')).toBe('http://droply.test');
	});

	it('refuses plain http to anything but this machine, and nonsense', () => {
		expect(() => normalizeBaseUrl('http://droply.host')).toThrow(Problem);
		expect(() => normalizeBaseUrl('not a url')).toThrow(Problem);
	});
});

describe('parseBody', () => {
	it('reads JSON however n8n hands it back, and drops HTML error pages', () => {
		expect(parseBody('{"data":1}')).toEqual({ data: 1 });
		expect(parseBody(Buffer.from('{"data":2}'))).toEqual({ data: 2 });
		expect(parseBody({ data: 3 })).toEqual({ data: 3 });
		expect(parseBody('<html><body>413 Request Entity Too Large</body></html>')).toBeNull();
		expect(parseBody('')).toBeNull();
	});
});

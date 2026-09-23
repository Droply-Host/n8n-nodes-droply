/**
 * Expiry moments for the API, which takes ISO 8601 WITH an offset. Built on Intl rather than a date
 * library, because verified n8n nodes may not depend on one.
 */

/** "now plus $hours", in UTC. */
export function hoursFromNow(hours: number, now: number = Date.now()): string {
	return new Date(now + hours * 3_600_000).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * A moment from n8n's date and time picker, in UTC. The picker gives a wall-clock time with no offset
 * ("2026-10-01T18:00:00"), meant in the workflow's time zone; an expression may give one with an
 * offset. Returns null when $value is not a date.
 */
export function toUtc(value: string, timeZone: string): string | null {
	const text = value.trim();
	if (text === '') {
		return null;
	}

	if (/(Z|[+-]\d{2}:?\d{2})$/i.test(text)) {
		const parsed = Date.parse(text);
		return Number.isNaN(parsed) ? null : iso(parsed);
	}

	const match = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?$/.exec(
		text,
	);
	if (match === null) {
		return null;
	}

	const [, y, mo, d, h = '0', mi = '0', s = '0'] = match;
	const wall = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));

	// The zone's offset at that moment, measured twice so a date on a daylight-saving change lands right.
	let utc = wall - offsetMinutes(wall, timeZone) * 60_000;
	utc = wall - offsetMinutes(utc, timeZone) * 60_000;

	return iso(utc);
}

/** Minutes $timeZone is ahead of UTC at $instant. UTC when the zone is unknown. */
export function offsetMinutes(instant: number, timeZone: string): number {
	let parts: Intl.DateTimeFormatPart[];
	try {
		parts = new Intl.DateTimeFormat('en-US', {
			timeZone: timeZone || 'UTC',
			hourCycle: 'h23',
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
		}).formatToParts(new Date(instant));
	} catch {
		return 0;
	}

	const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
	const asUtc = Date.UTC(
		get('year'),
		get('month') - 1,
		get('day'),
		get('hour'),
		get('minute'),
		get('second'),
	);

	return Math.round((asUtc - Math.floor(instant / 1000) * 1000) / 60_000);
}

function iso(instant: number): string {
	return new Date(instant).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

import type { IDataObject, IExecuteFunctions, INodeParameterResourceLocator } from 'n8n-workflow';
import { toUtc, hoursFromNow } from './dates';
import { entryPath, isJunk, sitePaths, uploadName, type BinaryMeta } from './files';
import { Problem } from './problem';
import type { Content } from './publish';
import type { SiteLocator } from './sites';
import type { ZipEntry } from './zip';

/** The node's Site parameter as a plain locator. */
export function siteParameter(ctx: IExecuteFunctions, i: number): SiteLocator {
	const locator = ctx.getNodeParameter('site', i) as INodeParameterResourceLocator;

	return { mode: String(locator.mode ?? 'id'), value: String(locator.value ?? '') };
}

/**
 * What to publish, read from the item. Everything the user supplied is checked here, before anything
 * is created on Droply. Returns null for Source "None".
 */
export async function readContent(
	ctx: IExecuteFunctions,
	i: number,
	source: string,
	options: IDataObject,
): Promise<Content | null> {
	if (source === 'none') {
		return null;
	}

	if (source === 'html') {
		const html = String(ctx.getNodeParameter('html', i, ''));
		if (html.trim() === '') {
			throw new Problem("'HTML' is empty", 'Map the page you want to publish into the HTML field.');
		}
		return { kind: 'html', html };
	}

	if (source === 'file') {
		const field = String(ctx.getNodeParameter('binaryPropertyName', i, 'data')).trim();
		const binary = ctx.helpers.assertBinaryData(i, field);
		const data = await ctx.helpers.getBinaryDataBuffer(i, field);
		if (data.length === 0) {
			throw new Problem(
				`The file in '${field}' is empty`,
				'Check the node that produced the file.',
			);
		}
		const name = uploadName(binary, String(options.fileName ?? ''), field);

		return { kind: 'file', name, mimeType: binary.mimeType, data };
	}

	return { kind: 'files', entries: await readFiles(ctx, i, options.keepFolders !== false) };
}

/**
 * Publishing options that are site settings, as the API's PATCH body. Empty when there are none.
 *
 * An option that was added but came out empty stops the item: an expression that finds no password
 * must not publish in the clear the content it was meant to protect.
 */
export function settingsFromOptions(options: IDataObject, timeZone: string): IDataObject {
	const changes: IDataObject = {};

	const password = passwordFrom(options);
	if (password !== undefined) {
		changes.password = password;
	}

	const expiry = expiryFrom(options, timeZone);
	if (expiry !== undefined) {
		changes.expires_at = expiry;
	}

	return changes;
}

/** The Update Settings collection as the API's PATCH body. Contradictions are refused before any call. */
export function settingsFromCollection(settings: IDataObject, timeZone: string): IDataObject {
	const changes: IDataObject = {};

	if (settings.name !== undefined) {
		changes.name = String(settings.name).trim() === '' ? null : String(settings.name).trim();
	}

	const password = passwordFrom(settings);
	const removePassword = settings.removePassword === true;
	if (password !== undefined && removePassword) {
		throw new Problem("Set 'Password' or 'Remove Password', not both");
	}
	if (password !== undefined) {
		changes.password = password;
	}
	if (removePassword) {
		changes.password_protected = false;
	}

	const expiry = expiryFrom(settings, timeZone);
	const removeExpiry = settings.removeExpiry === true;
	if (expiry !== undefined && removeExpiry) {
		throw new Problem("Set an expiry or 'Remove Expiry', not both");
	}
	if (expiry !== undefined) {
		changes.expires_at = expiry;
	}
	if (removeExpiry) {
		changes.expires_at = null;
	}

	if (Object.keys(changes).length === 0) {
		throw new Problem('There is nothing to change', "Add a setting under 'Settings'.");
	}

	return changes;
}

/**
 * The Password option or setting, or undefined when it was not added. Added but empty is refused, so a
 * missing value never quietly means "no protection".
 */
export function passwordFrom(values: IDataObject): string | undefined {
	if (!('password' in values)) {
		return undefined;
	}

	const password = String(values.password ?? '');
	if (password.trim() === '') {
		throw new Problem(
			"'Password' is empty",
			'It was added, so the site would have been published without the protection asked for. Give it a value, or remove the option.',
		);
	}

	return password;
}

/**
 * Expire After (Hours) or Expire At, as the UTC moment the API takes; undefined when neither was added.
 * One that was added must hold a real value.
 */
export function expiryFrom(values: IDataObject, timeZone: string): string | undefined {
	const hasHours = 'expireAfterHours' in values;
	const hasAt = 'expireAt' in values;

	if (hasHours && hasAt) {
		throw new Problem("Set 'Expire After (Hours)' or 'Expire At', not both");
	}

	if (hasHours) {
		const raw = values.expireAfterHours;
		const hours = raw === null || raw === '' ? Number.NaN : Number(raw);
		if (!Number.isFinite(hours) || hours <= 0) {
			throw new Problem("'Expire After (Hours)' must be a number of hours above zero");
		}
		return hoursFromNow(hours);
	}

	if (hasAt) {
		const at = String(values.expireAt ?? '');
		const utc = toUtc(at, timeZone);
		if (utc === null) {
			throw new Problem(
				at.trim() === '' ? "'Expire At' is empty" : `'${at}' is not a date and time`,
				"Pick a moment in 'Expire At', or remove the option.",
			);
		}
		return utc;
	}

	return undefined;
}

async function readFiles(
	ctx: IExecuteFunctions,
	i: number,
	keepFolders: boolean,
): Promise<ZipEntry[]> {
	const listed = String(ctx.getNodeParameter('binaryPropertyNames', i, ''))
		.split(',')
		.map((name) => name.trim())
		.filter((name) => name !== '');
	const fields = listed.length > 0 ? listed : Object.keys(ctx.getInputData()[i]?.binary ?? {});

	if (fields.length === 0) {
		throw new Problem(
			'This item has no files to publish',
			'Add files with a node like Read Files From Disk or HTTP Request. To combine files from several items, use Aggregate with Include Binaries.',
		);
	}

	const metas: BinaryMeta[] = [];
	const buffers: Buffer[] = [];
	for (const field of fields) {
		const binary = ctx.helpers.assertBinaryData(i, field);
		metas.push({ ...binary, fileName: binary.fileName || uploadName(binary, '', field) });
		buffers.push(await ctx.helpers.getBinaryDataBuffer(i, field));
	}

	const entries: ZipEntry[] = [];
	const seen = new Set<string>();
	sitePaths(metas, keepFolders).forEach((raw, index) => {
		const path = entryPath(raw);
		if (isJunk(path)) {
			return;
		}
		if (seen.has(path.toLowerCase())) {
			throw new Problem(
				`Two files would both be published as '${path}'`,
				"Rename one of them, or turn on 'Keep Folder Structure'.",
			);
		}
		seen.add(path.toLowerCase());
		entries.push({ path, data: buffers[index] });
	});

	if (entries.length === 0) {
		throw new Problem(
			'None of the files can be published',
			'Only system files like .DS_Store were found.',
		);
	}

	return entries;
}

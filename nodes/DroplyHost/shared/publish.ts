import type { IDataObject } from 'n8n-workflow';
import type { DroplyClient } from './client';
import { MAX_HTML_TEXT_BYTES, MAX_JSON_BODY_BYTES } from './constants';
import { contentTypeFor } from './files';
import { buildMultipart } from './multipart';
import type { DroplyDeployment, Envelope } from './types';
import { buildZip, type ZipEntry } from './zip';

/** What one publish sends. */
export type Content =
	| { kind: 'html'; html: string }
	| { kind: 'file'; name: string; mimeType?: string; data: Buffer }
	| { kind: 'files'; entries: ZipEntry[] };

/**
 * Send $content to a site as a new version (a draft when $draft), and return the deployment Droply
 * made. Processing continues on Droply's side; wait.ts follows it.
 *
 * - HTML goes as JSON text when it fits the API's text limit, and as an index.html file when it does
 *   not (the API's rule: big content travels as files). Both are served identically.
 * - One file goes as itself, so a lone PDF still gets the PDF viewer.
 * - Several files go as one ZIP built here: the API takes exactly one file per deploy.
 */
export async function deploy(
	client: DroplyClient,
	siteId: string,
	content: Content,
	draft: boolean,
	boundary: () => string,
	now: Date = new Date(),
): Promise<DroplyDeployment> {
	const path = `/sites/${encodeURIComponent(siteId)}/deployments`;
	const fields: Record<string, string> = draft ? { draft: '1' } : {};

	if (content.kind === 'html') {
		const json: IDataObject = { html: content.html };
		if (draft) {
			json.draft = true;
		}
		if (fitsAsText(content.html)) {
			return (await client.request<Envelope<DroplyDeployment>>({ method: 'POST', path, json }))
				.data;
		}

		return upload(
			client,
			path,
			fields,
			'index.html',
			'text/html',
			Buffer.from(content.html, 'utf8'),
			boundary,
		);
	}

	if (content.kind === 'file') {
		return upload(
			client,
			path,
			fields,
			content.name,
			contentTypeFor(content.name, content.mimeType),
			content.data,
			boundary,
		);
	}

	if (content.entries.length === 1) {
		const [only] = content.entries;
		const name = only.path.slice(only.path.lastIndexOf('/') + 1);
		return upload(client, path, fields, name, contentTypeFor(name), only.data, boundary);
	}

	const zip = buildZip(content.entries, now);
	return upload(client, path, fields, 'site.zip', 'application/zip', zip.chunks, boundary);
}

/** HTML small enough for the API's JSON text path, escaping included. */
export function fitsAsText(html: string): boolean {
	return (
		Buffer.byteLength(html, 'utf8') <= MAX_HTML_TEXT_BYTES &&
		Buffer.byteLength(JSON.stringify({ html, draft: true }), 'utf8') <= MAX_JSON_BODY_BYTES
	);
}

async function upload(
	client: DroplyClient,
	path: string,
	fields: Record<string, string>,
	filename: string,
	contentType: string,
	data: Buffer | Buffer[],
	boundary: () => string,
): Promise<DroplyDeployment> {
	const body = buildMultipart(fields, { field: 'file', filename, contentType, data }, boundary);

	return (
		await client.request<Envelope<DroplyDeployment>>({
			method: 'POST',
			path,
			body: body.body,
			contentType: body.contentType,
		})
	).data;
}

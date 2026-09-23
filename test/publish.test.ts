import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { DroplyClient, type ApiRequest } from '../nodes/DroplyHost/shared/client';
import { MAX_HTML_TEXT_BYTES } from '../nodes/DroplyHost/shared/constants';
import { deploy } from '../nodes/DroplyHost/shared/publish';

function recorder() {
	const requests: ApiRequest[] = [];
	const client = new DroplyClient(
		async (request) => {
			requests.push(request);
			return {
				statusCode: 202,
				headers: {},
				body: { data: { id: 'd1', site_id: 's1', status: 'uploaded' } },
			};
		},
		async () => undefined,
		'https://droply.host',
	);

	return { client, requests };
}

const boundary = () => 'BOUNDARY';

/** The file part of a multipart body this module built. */
function filePart(request: ApiRequest): { name: string; type: string; data: Buffer } {
	const body = request.body as Buffer;
	const header = /filename="([^"]+)"\r\nContent-Type: ([^\r]+)\r\n\r\n/.exec(
		body.toString('latin1'),
	);
	if (header === null) {
		throw new Error('no file part');
	}
	const start = body.indexOf('\r\n\r\n', body.indexOf('filename="')) + 4;
	const end = body.lastIndexOf('\r\n--BOUNDARY--');

	return { name: header[1], type: header[2], data: body.subarray(start, end) };
}

describe('deploy', () => {
	it('sends HTML as JSON text, with the draft flag when asked', async () => {
		const { client, requests } = recorder();

		await deploy(client, 's1', { kind: 'html', html: '<h1>Hi</h1>' }, true, boundary);

		expect(requests[0]).toMatchObject({
			method: 'POST',
			path: '/sites/s1/deployments',
			json: { html: '<h1>Hi</h1>', draft: true },
		});
	});

	it('sends HTML too large for the text path as an index.html file', async () => {
		const { client, requests } = recorder();
		const html = `<p>${'a'.repeat(MAX_HTML_TEXT_BYTES)}</p>`;

		await deploy(client, 's1', { kind: 'html', html }, false, boundary);

		expect(requests[0].json).toBeUndefined();
		const part = filePart(requests[0]);
		expect(part.name).toBe('index.html');
		expect(part.type).toBe('text/html');
		expect(part.data.length).toBe(Buffer.byteLength(html));
	});

	it('sends one file as itself, under its own name', async () => {
		const { client, requests } = recorder();

		await deploy(
			client,
			's1',
			{
				kind: 'file',
				name: 'report.pdf',
				mimeType: 'application/pdf',
				data: Buffer.from('%PDF-1.7'),
			},
			false,
			boundary,
		);

		expect(requests[0].contentType).toBe('multipart/form-data; boundary=BOUNDARY');
		expect(filePart(requests[0])).toMatchObject({ name: 'report.pdf', type: 'application/pdf' });
		expect((requests[0].body as Buffer).toString()).not.toContain('name="draft"');
	});

	it('sends a single file from Multiple Files as itself, and several as one ZIP', async () => {
		const single = recorder();
		await deploy(
			single.client,
			's1',
			{ kind: 'files', entries: [{ path: 'docs/guide.pdf', data: Buffer.from('%PDF') }] },
			false,
			boundary,
		);
		expect(filePart(single.requests[0]).name).toBe('guide.pdf');

		const several = recorder();
		const entries = [
			{ path: 'index.html', data: Buffer.from('<h1>Hi</h1>') },
			{ path: 'css/style.css', data: Buffer.from('h1{}') },
		];
		await deploy(several.client, 's1', { kind: 'files', entries }, true, boundary);

		const part = filePart(several.requests[0]);
		expect(part).toMatchObject({ name: 'site.zip', type: 'application/zip' });
		const files = unzipSync(new Uint8Array(part.data));
		expect(Buffer.from(files['css/style.css']).toString()).toBe('h1{}');
		expect((several.requests[0].body as Buffer).toString('latin1')).toContain(
			'name="draft"\r\n\r\n1\r\n',
		);
	});
});

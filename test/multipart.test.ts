import { describe, expect, it } from 'vitest';
import { MAX_REQUEST_BYTES } from '../nodes/DroplyHost/shared/constants';
import { buildMultipart, quote, UploadTooLarge } from '../nodes/DroplyHost/shared/multipart';

const boundaries = (...values: string[]) => {
	const queue = [...values];
	return () => queue.shift() ?? 'fallback';
};

describe('buildMultipart', () => {
	it('frames text fields and one file exactly', () => {
		const result = buildMultipart(
			{ draft: '1' },
			{
				field: 'file',
				filename: 'index.html',
				contentType: 'text/html',
				data: Buffer.from('<h1>Hi</h1>'),
			},
			boundaries('B1'),
		);

		expect(result.contentType).toBe('multipart/form-data; boundary=B1');
		expect(result.body.toString()).toBe(
			'--B1\r\nContent-Disposition: form-data; name="draft"\r\n\r\n1\r\n' +
				'--B1\r\nContent-Disposition: form-data; name="file"; filename="index.html"\r\nContent-Type: text/html\r\n\r\n' +
				'<h1>Hi</h1>\r\n--B1--\r\n',
		);
	});

	it('joins the pieces of a file built in chunks', () => {
		const result = buildMultipart(
			{},
			{
				field: 'file',
				filename: 'site.zip',
				contentType: 'application/zip',
				data: [Buffer.from('ab'), Buffer.from('cd')],
			},
			boundaries('B1'),
		);

		expect(result.body.toString()).toContain('\r\n\r\nabcd\r\n--B1--');
	});

	it('draws another boundary when the data contains the first one', () => {
		const result = buildMultipart(
			{},
			{
				field: 'file',
				filename: 'a.txt',
				contentType: 'text/plain',
				data: Buffer.from('xx--B1xx'),
			},
			boundaries('B1', 'B2'),
		);

		expect(result.contentType).toBe('multipart/form-data; boundary=B2');
	});

	it('refuses a body over the request limit before building it', () => {
		const megabyte = Buffer.alloc(1024 * 1024);
		const pieces = Array.from({ length: MAX_REQUEST_BYTES / megabyte.length }, () => megabyte);

		expect(() =>
			buildMultipart(
				{},
				{ field: 'file', filename: 'big.zip', contentType: 'application/zip', data: pieces },
				boundaries('B1'),
			),
		).toThrow(UploadTooLarge);
	});
});

describe('quote', () => {
	it('keeps a file name from ending the header early', () => {
		expect(quote('a"b\r\nc.html')).toBe('a%22b%0D%0Ac.html');
		expect(quote('relatório final.pdf')).toBe('relatório final.pdf');
	});
});

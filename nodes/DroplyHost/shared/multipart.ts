import { MAX_REQUEST_BYTES } from './constants';

export type MultipartFile = {
	field: string;
	filename: string;
	contentType: string;
	/** One buffer, or the pieces of one (a ZIP built by buildZip), copied into the body exactly once. */
	data: Buffer | Buffer[];
};

export type Multipart = { body: Buffer; contentType: string };

/**
 * A multipart/form-data body with text fields and one file, built by hand: verified n8n nodes may not
 * depend on a form-data library, and n8n's declarative routing cannot send binary data at all.
 *
 * $boundary must be random (see newBoundary); if the data happens to contain it, the caller is asked
 * for another through $nextBoundary rather than sending a body the server would cut short.
 */
export function buildMultipart(
	fields: Record<string, string>,
	file: MultipartFile,
	nextBoundary: () => string,
): Multipart {
	const parts = Array.isArray(file.data) ? file.data : [file.data];
	const dataLength = parts.reduce((sum, part) => sum + part.length, 0);

	let boundary = nextBoundary();
	for (let attempt = 0; parts.some((part) => part.includes(`--${boundary}`)); attempt++) {
		if (attempt >= 5) {
			throw new Error('Could not frame the upload. Run the workflow again.');
		}
		boundary = nextBoundary();
	}

	let head = '';
	for (const [name, value] of Object.entries(fields)) {
		head += `--${boundary}\r\nContent-Disposition: form-data; name="${quote(name)}"\r\n\r\n${value}\r\n`;
	}
	head +=
		`--${boundary}\r\n` +
		`Content-Disposition: form-data; name="${quote(file.field)}"; filename="${quote(file.filename)}"\r\n` +
		`Content-Type: ${mediaType(file.contentType)}\r\n\r\n`;
	const tail = `\r\n--${boundary}--\r\n`;

	const length = Buffer.byteLength(head) + dataLength + Buffer.byteLength(tail);
	if (length > MAX_REQUEST_BYTES) {
		throw new UploadTooLarge(length);
	}

	return {
		body: Buffer.concat([Buffer.from(head), ...parts, Buffer.from(tail)], length),
		contentType: `multipart/form-data; boundary=${boundary}`,
	};
}

export function newBoundary(randomHex: string): string {
	return `----DroplyN8n${randomHex}`;
}

/**
 * Quote a field or file name the way browsers do (WHATWG): a quote or a line break cannot end the
 * header early and smuggle in another one. Everything else, UTF-8 included, is sent as it is.
 */
export function quote(value: string): string {
	return value.replace(/"/g, '%22').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

export class UploadTooLarge extends Error {
	/** Added when a clean-up after this refusal also went wrong, so the user knows what was left behind. */
	note = '';

	constructor(readonly bytes: number) {
		super(
			`This upload would be ${megabytes(bytes)} MB, and Droply accepts at most ${megabytes(MAX_REQUEST_BYTES)} MB in one upload`,
		);
	}
}

/** A bare type/subtype, or octet-stream: a MIME type from the binary must not carry anything else into the header. */
export function mediaType(value: string): string {
	return /^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+$/.test(value)
		? value
		: 'application/octet-stream';
}

function megabytes(bytes: number): string {
	return (bytes / 1024 / 1024).toFixed(1).replace(/\.0$/, '');
}

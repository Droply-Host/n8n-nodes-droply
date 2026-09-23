import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { MAX_ZIP_ENTRIES } from '../nodes/DroplyHost/shared/constants';
import { crc32 } from '../nodes/DroplyHost/shared/crc32';
import { buildZip, type ZipEntry } from '../nodes/DroplyHost/shared/zip';

const fixed = new Date(Date.UTC(2026, 8, 23, 14, 30, 10));

const entries = (): ZipEntry[] => [
	{ path: 'index.html', data: Buffer.from('<!doctype html><h1>Hi</h1>') },
	{ path: 'css/style.css', data: Buffer.from('h1 { color: purple; }') },
	{ path: 'docs/über uns.txt', data: Buffer.from('Grüße') },
	{ path: 'empty.txt', data: Buffer.alloc(0) },
];

const bytes = (zip: { chunks: Buffer[]; length: number }) => Buffer.concat(zip.chunks, zip.length);

describe('crc32', () => {
	it('matches the standard check values', () => {
		expect(crc32(Buffer.from('123456789'))).toBe(0xcbf43926);
		expect(crc32(Buffer.from('The quick brown fox jumps over the lazy dog'))).toBe(0x414fa339);
		expect(crc32(Buffer.alloc(0))).toBe(0);
	});
});

describe('buildZip', () => {
	it('writes an archive a standard reader extracts byte for byte', () => {
		const zip = buildZip(entries(), fixed);
		const out = bytes(zip);

		expect(out.length).toBe(zip.length);

		const files = unzipSync(new Uint8Array(out));
		expect(Object.keys(files).sort()).toEqual([
			'css/style.css',
			'docs/über uns.txt',
			'empty.txt',
			'index.html',
		]);
		for (const entry of entries()) {
			expect(Buffer.from(files[entry.path]).equals(entry.data)).toBe(true);
		}
	});

	it('stores entries uncompressed with UTF-8 names', () => {
		const out = bytes(buildZip(entries(), fixed));

		expect(out.readUInt32LE(0)).toBe(0x04034b50);
		expect(out.readUInt16LE(6) & 0x0800).toBe(0x0800); // UTF-8 flag
		expect(out.readUInt16LE(8)).toBe(0); // stored
		expect(out.readUInt32LE(18)).toBe(out.readUInt32LE(22)); // compressed size == size
	});

	it('ends with a directory record that counts and locates every entry', () => {
		const out = bytes(buildZip(entries(), fixed));
		const end = out.subarray(out.length - 22);

		expect(end.readUInt32LE(0)).toBe(0x06054b50);
		expect(end.readUInt16LE(10)).toBe(4);
		const centralOffset = end.readUInt32LE(16);
		expect(out.readUInt32LE(centralOffset)).toBe(0x02014b50);
		expect(centralOffset + end.readUInt32LE(12)).toBe(out.length - 22);
	});

	it('gives the same bytes for the same input and moment', () => {
		expect(bytes(buildZip(entries(), fixed)).equals(bytes(buildZip(entries(), fixed)))).toBe(true);
	});

	it('refuses an empty archive and one over the file limit', () => {
		expect(() => buildZip([], fixed)).toThrow();

		const tooMany = Array.from({ length: MAX_ZIP_ENTRIES + 1 }, (_, i) => ({
			path: `f${i}.txt`,
			data: Buffer.from('x'),
		}));
		expect(() => buildZip(tooMany, fixed)).toThrow(/at most/);
	});
});

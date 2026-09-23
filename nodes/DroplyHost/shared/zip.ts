import { MAX_ZIP_ENTRIES } from './constants';
import { crc32 } from './crc32';

export type ZipEntry = { path: string; data: Buffer };

export type Chunks = { chunks: Buffer[]; length: number };

const LOCAL_HEADER = 0x04034b50;
const CENTRAL_HEADER = 0x02014b50;
const END_OF_CENTRAL = 0x06054b50;
const VERSION = 20; // 2.0: plain stored entries
const UTF8_NAMES = 0x0800; // general purpose flag bit 11: names are UTF-8
const STORED = 0; // no compression: Droply's extractor inflates nothing, and a ratio of 1 is never a "zip bomb"

/**
 * Build an uncompressed ZIP of $entries, in memory, with no dependencies (verified n8n nodes may not
 * have any). Returns the pieces and their total length, so the caller copies the bytes only once, when
 * it frames the upload. Paths must already be clean (see files.ts); this only writes them.
 *
 * No ZIP64: one upload is at most 100 MB and 5,000 files, far inside the classic format's limits.
 */
export function buildZip(entries: ZipEntry[], date: Date = new Date()): Chunks {
	if (entries.length === 0) {
		throw new Error('There are no files to put in the archive.');
	}
	if (entries.length > MAX_ZIP_ENTRIES) {
		throw new Error(`One upload can hold at most ${MAX_ZIP_ENTRIES} files.`);
	}

	const { time, day } = dosDateTime(date);
	const chunks: Buffer[] = [];
	const central: Buffer[] = [];
	let offset = 0;

	for (const entry of entries) {
		const name = Buffer.from(entry.path, 'utf8');
		const crc = crc32(entry.data);
		const size = entry.data.length;

		const local = Buffer.alloc(30);
		local.writeUInt32LE(LOCAL_HEADER, 0);
		local.writeUInt16LE(VERSION, 4);
		local.writeUInt16LE(UTF8_NAMES, 6);
		local.writeUInt16LE(STORED, 8);
		local.writeUInt16LE(time, 10);
		local.writeUInt16LE(day, 12);
		local.writeUInt32LE(crc, 14);
		local.writeUInt32LE(size, 18);
		local.writeUInt32LE(size, 22);
		local.writeUInt16LE(name.length, 26);
		local.writeUInt16LE(0, 28);

		const header = Buffer.alloc(46);
		header.writeUInt32LE(CENTRAL_HEADER, 0);
		header.writeUInt16LE(VERSION, 4); // made by
		header.writeUInt16LE(VERSION, 6); // needed to extract
		header.writeUInt16LE(UTF8_NAMES, 8);
		header.writeUInt16LE(STORED, 10);
		header.writeUInt16LE(time, 12);
		header.writeUInt16LE(day, 14);
		header.writeUInt32LE(crc, 16);
		header.writeUInt32LE(size, 20);
		header.writeUInt32LE(size, 24);
		header.writeUInt16LE(name.length, 28);
		header.writeUInt16LE(0, 30); // extra length
		header.writeUInt16LE(0, 32); // comment length
		header.writeUInt16LE(0, 34); // disk number
		header.writeUInt16LE(0, 36); // internal attributes
		header.writeUInt32LE(0, 38); // external attributes
		header.writeUInt32LE(offset, 42);

		chunks.push(local, name, entry.data);
		central.push(header, name);
		offset += local.length + name.length + size;
	}

	const centralSize = central.reduce((sum, part) => sum + part.length, 0);

	const end = Buffer.alloc(22);
	end.writeUInt32LE(END_OF_CENTRAL, 0);
	end.writeUInt16LE(0, 4); // this disk
	end.writeUInt16LE(0, 6); // disk holding the central directory
	end.writeUInt16LE(entries.length, 8);
	end.writeUInt16LE(entries.length, 10);
	end.writeUInt32LE(centralSize, 12);
	end.writeUInt32LE(offset, 16);
	end.writeUInt16LE(0, 20); // comment length

	chunks.push(...central, end);

	return { chunks, length: offset + centralSize + end.length };
}

/** MS-DOS date and time, read in UTC so the same input always gives the same bytes. */
function dosDateTime(date: Date): { time: number; day: number } {
	const year = Math.max(1980, Math.min(2107, date.getUTCFullYear()));

	return {
		time:
			(date.getUTCHours() << 11) |
			(date.getUTCMinutes() << 5) |
			Math.floor(date.getUTCSeconds() / 2),
		day: ((year - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate(),
	};
}

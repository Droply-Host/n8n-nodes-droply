/**
 * How n8n binary data becomes what Droply receives. Droply decides how to serve an upload from its
 * file name's EXTENSION: a .zip is extracted as a site, .html is a page,
 * .pdf gets the viewer, and so on. So every upload must carry a real name with an extension.
 */

import { Problem } from './problem';

export type BinaryMeta = {
	fileName?: string;
	fileExtension?: string;
	mimeType?: string;
	directory?: string;
};

const EXTENSION_BY_MIME: Record<string, string> = {
	'text/html': 'html',
	'application/xhtml+xml': 'html',
	'application/zip': 'zip',
	'application/x-zip-compressed': 'zip',
	'application/pdf': 'pdf',
	'image/png': 'png',
	'image/jpeg': 'jpg',
	'image/gif': 'gif',
	'image/webp': 'webp',
	'image/svg+xml': 'svg',
	'image/avif': 'avif',
	'text/css': 'css',
	'text/javascript': 'js',
	'application/javascript': 'js',
	'application/json': 'json',
	'text/plain': 'txt',
	'text/markdown': 'md',
	'text/csv': 'csv',
	'video/mp4': 'mp4',
	'audio/mpeg': 'mp3',
};

const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
	html: 'text/html',
	htm: 'text/html',
	zip: 'application/zip',
	pdf: 'application/pdf',
	png: 'image/png',
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	gif: 'image/gif',
	webp: 'image/webp',
	svg: 'image/svg+xml',
	css: 'text/css',
	js: 'text/javascript',
	json: 'application/json',
	txt: 'text/plain',
	md: 'text/markdown',
};

/**
 * The name to upload one binary under: the File Name option, else the binary's own name, else the
 * field name. Only the last path segment is kept. When the name has no extension, one is taken from
 * the binary's extension or MIME type; with neither, the caller is told to name the file.
 */
export function uploadName(binary: BinaryMeta, override: string, fieldName: string): string {
	const chosen =
		[override, binary.fileName ?? '', fieldName].map(lastSegment).find((name) => name !== '') ?? '';

	if (extensionOf(chosen) !== '') {
		return chosen;
	}

	const extension =
		(binary.fileExtension ?? '').replace(/^\./, '').toLowerCase() ||
		EXTENSION_BY_MIME[baseMime(binary.mimeType)];
	if (!extension) {
		throw new Problem(
			`Droply needs a file name with an extension to know how to serve '${chosen || fieldName}', like site.zip or page.html. Set 'File Name' in the options.`,
		);
	}

	return `${chosen || 'upload'}.${extension}`;
}

/** The Content-Type to send a file with: its MIME type when n8n knows it, else one from its extension. */
export function contentTypeFor(name: string, mimeType?: string): string {
	const known = baseMime(mimeType);
	if (known !== '' && known !== 'application/octet-stream') {
		return known;
	}

	return CONTENT_TYPE_BY_EXTENSION[extensionOf(name)] ?? 'application/octet-stream';
}

/**
 * A path inside the ZIP, relative to the site root. Backslashes become slashes and a leading "./" or
 * "/" is dropped; anything that could climb out of the site or name no file (.., a drive letter, an
 * empty or "." segment, a control character) is refused. The server's extractor checks every entry
 * again; refusing here tells the user which file is wrong before anything is sent.
 */
export function entryPath(raw: string): string {
	let path = raw
		.trim()
		.replace(/\\/g, '/')
		.replace(/\/{2,}/g, '/');
	while (path.startsWith('./') || path.startsWith('/')) {
		path = path.startsWith('./') ? path.slice(2) : path.slice(1);
	}

	if (path === '') {
		throw new Problem('A file has no name.');
	}
	// eslint-disable-next-line no-control-regex
	if (/[\u0000-\u001f\u007f]/.test(path)) {
		throw new Problem(
			`The file name '${printable(path)}' contains characters that are not allowed.`,
		);
	}
	if (path.length > 1024) {
		throw new Problem(`The file path '${path.slice(0, 60)}...' is longer than 1024 characters.`);
	}

	const segments = path.split('/');
	if (/^[A-Za-z]:$/.test(segments[0])) {
		throw new Problem(
			`The file path '${path}' must be relative to the site, without a drive letter.`,
		);
	}
	if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
		throw new Problem(
			`The file path '${path}' must stay inside the site, without empty, '.' or '..' parts.`,
		);
	}

	return path;
}

/** Files a computer leaves behind that nobody means to publish. */
export function isJunk(path: string): boolean {
	const segments = path.split('/');
	const name = segments[segments.length - 1];

	return (
		segments.includes('__MACOSX') ||
		name === '.DS_Store' ||
		name === 'Thumbs.db' ||
		name.startsWith('._')
	);
}

/**
 * Where each file goes inside the site. With $keepFolders, binaries that carry a directory (the Read
 * Files From Disk node sets one) keep their place relative to the folder they all share; otherwise
 * every file lands at the root under its own name (a name may itself contain a folder, like
 * "assets/app.css").
 */
export function sitePaths(files: BinaryMeta[], keepFolders: boolean): string[] {
	const directories = files.map((file) => normalizeDirectory(file.directory ?? ''));
	const common = keepFolders ? commonPrefix(directories) : [];

	return files.map((file, index) => {
		const name = (file.fileName ?? '').replace(/\\/g, '/');
		const folder = keepFolders ? directories[index].slice(common.length) : [];

		return [...folder, name].filter((part) => part !== '').join('/');
	});
}

export function extensionOf(name: string): string {
	const dot = name.lastIndexOf('.');

	return dot > 0 && dot < name.length - 1 ? name.slice(dot + 1).toLowerCase() : '';
}

function lastSegment(value: string): string {
	const parts = value.trim().replace(/\\/g, '/').split('/');

	// eslint-disable-next-line no-control-regex
	return (parts[parts.length - 1] ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim();
}

function baseMime(mimeType?: string): string {
	return (mimeType ?? '').split(';')[0].trim().toLowerCase();
}

function normalizeDirectory(directory: string): string[] {
	return directory
		.replace(/\\/g, '/')
		.split('/')
		.filter((part) => part !== '' && part !== '.');
}

function commonPrefix(paths: string[][]): string[] {
	if (paths.length === 0) {
		return [];
	}

	const prefix: string[] = [];
	for (let i = 0; i < paths[0].length; i++) {
		const part = paths[0][i];
		if (!paths.every((path) => path[i] === part)) {
			break;
		}
		prefix.push(part);
	}

	return prefix;
}

function printable(value: string): string {
	// eslint-disable-next-line no-control-regex
	return value.replace(/[\u0000-\u001f\u007f]/g, '?');
}

import { describe, expect, it } from 'vitest';
import {
	contentTypeFor,
	entryPath,
	isJunk,
	sitePaths,
	uploadName,
} from '../nodes/DroplyHost/shared/files';
import { Problem } from '../nodes/DroplyHost/shared/problem';

describe('uploadName', () => {
	it('prefers the File Name option, then the binary name, keeping only the last segment', () => {
		expect(uploadName({ fileName: 'page.html' }, 'site.zip', 'data')).toBe('site.zip');
		expect(uploadName({ fileName: 'C:\\exports\\report.pdf' }, '', 'data')).toBe('report.pdf');
		expect(uploadName({ fileName: 'dist/index.html' }, '', 'data')).toBe('index.html');
	});

	it('adds an extension from the binary when the name has none', () => {
		expect(uploadName({ fileName: 'report', fileExtension: 'pdf' }, '', 'data')).toBe('report.pdf');
		expect(
			uploadName({ fileName: 'landing', mimeType: 'text/html; charset=utf-8' }, '', 'data'),
		).toBe('landing.html');
		expect(uploadName({ mimeType: 'application/zip' }, '', 'data')).toBe('data.zip');
	});

	it('asks for a name when nothing says how the file should be served', () => {
		expect(() =>
			uploadName({ fileName: 'mystery', mimeType: 'application/octet-stream' }, '', 'data'),
		).toThrow(Problem);
	});
});

describe('contentTypeFor', () => {
	it('uses the known MIME type, else the extension', () => {
		expect(contentTypeFor('a.bin', 'image/png')).toBe('image/png');
		expect(contentTypeFor('site.zip', 'application/octet-stream')).toBe('application/zip');
		expect(contentTypeFor('unknown.xyz')).toBe('application/octet-stream');
	});
});

describe('entryPath', () => {
	it('normalizes separators and leading markers', () => {
		expect(entryPath('./css/style.css')).toBe('css/style.css');
		expect(entryPath('/index.html')).toBe('index.html');
		expect(entryPath('assets\\img\\logo.png')).toBe('assets/img/logo.png');
		expect(entryPath('a//b.txt')).toBe('a/b.txt');
	});

	it('refuses paths that leave the site or name no file', () => {
		for (const path of [
			'../secret.txt',
			'a/../../b',
			'C:/windows/x.dll',
			'a/./b',
			'',
			'bad\u0000name',
		]) {
			expect(() => entryPath(path), path).toThrow(Problem);
		}
	});
});

describe('isJunk', () => {
	it('skips files a computer leaves behind', () => {
		expect(isJunk('.DS_Store')).toBe(true);
		expect(isJunk('__MACOSX/index.html')).toBe(true);
		expect(isJunk('img/._logo.png')).toBe(true);
		expect(isJunk('index.html')).toBe(false);
	});
});

describe('sitePaths', () => {
	const files = [
		{ fileName: 'index.html', directory: '/data/site' },
		{ fileName: 'style.css', directory: '/data/site/css' },
		{ fileName: 'logo.png', directory: '/data/site/img' },
	];

	it('keeps folders relative to the folder the files share', () => {
		expect(sitePaths(files, true)).toEqual(['index.html', 'css/style.css', 'img/logo.png']);
	});

	it('puts every file at the root when folders are not kept', () => {
		expect(sitePaths(files, false)).toEqual(['index.html', 'style.css', 'logo.png']);
	});

	it('uses a name that already holds a folder', () => {
		expect(sitePaths([{ fileName: 'index.html' }, { fileName: 'assets/app.css' }], true)).toEqual([
			'index.html',
			'assets/app.css',
		]);
	});
});

/** The API's records, as /api/v1 returns them (snake_case, ids are UUID strings). */

export type DroplySite = {
	id: string;
	subdomain: string;
	name: string | null;
	status: string | null;
	live_url: string;
	current_deployment_id: string | null;
	password_protected?: boolean;
	expires_at?: string | null;
	created_at: string | null;
	updated_at: string | null;
};

export type IndexChoices = {
	kind: 'page' | 'folder';
	options: Array<{ value: string; label: string }>;
};

export type DroplyDeployment = {
	id: string;
	site_id: string;
	status: string;
	draft?: boolean;
	source_type: string;
	original_filename: string | null;
	error_message: string | null;
	index_choices?: IndexChoices;
	entry_choice?: string | null;
	size_bytes: number | null;
	file_count: number | null;
	uploaded_at: string | null;
	processed_at: string | null;
	live_url?: string;
};

export type SubdomainCheck = {
	subdomain: string;
	available: boolean;
	reason: string | null;
};

export type Envelope<T> = { data: T };

export type Page<T> = {
	data: T[];
	links?: { next?: string | null };
	meta?: { current_page?: number; last_page?: number; total?: number };
};

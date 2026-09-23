/**
 * Every limit here mirrors one the Droply API enforces, so the node can refuse a request the API would
 * refuse, before sending it and with a clearer message.
 */

export const CREDENTIAL_TYPE = 'droplyApi';

export const API_PREFIX = '/api/v1';

/** Names this client to Droply, which counts the deploys made from n8n. */
export const CLIENT_HEADER = 'X-Droply-Client';
export const CLIENT_NAME = 'n8n';

/** The most one upload request may carry, multipart framing included (100 MiB). */
export const MAX_REQUEST_BYTES = 100 * 1024 * 1024;

/** The most HTML the API accepts as JSON text. Larger pages are sent as a file. */
export const MAX_HTML_TEXT_BYTES = 12 * 1024 * 1024;

/** The most a JSON request body to the deploy endpoint may carry. */
export const MAX_JSON_BODY_BYTES = 16 * 1024 * 1024;

/** The most files one deployment may hold. */
export const MAX_ZIP_ENTRIES = 5000;

/** Items per page in the API's lists. */
export const PAGE_SIZE = 20;

/** Walking a list never goes further than this, whatever the server says. */
export const MAX_PAGES = 100;

/** Wait Until Live defaults, in seconds. */
export const DEFAULT_TIMEOUT_SECONDS = 120;
export const MIN_TIMEOUT_SECONDS = 10;
export const MAX_TIMEOUT_SECONDS = 600;

/**
 * Every limit here mirrors a value on the Droply server. The comment names where it lives in the
 * Droply app, so a change there is easy to follow here.
 */

export const CREDENTIAL_TYPE = 'droplyApi';

export const API_PREFIX = '/api/v1';

/** Names this client to Droply, which labels its deploys "n8n" in its own numbers (DeployChannel). */
export const CLIENT_HEADER = 'X-Droply-Client';
export const CLIENT_NAME = 'n8n';

/**
 * The most one request may carry, framing included: RequestBodyLimit::FILE_BYTES, nginx
 * client_max_body_size 100M and PHP post_max_size=100M on the deploy route.
 */
export const MAX_REQUEST_BYTES = 100 * 1024 * 1024;

/** UploadLimits::maxApiHtmlBytes(): the most HTML the API accepts as JSON text. */
export const MAX_HTML_TEXT_BYTES = 12 * 1024 * 1024;

/** RequestBodyLimit::TEXT_BYTES: the ceiling for a JSON body on the deploy route. */
export const MAX_JSON_BODY_BYTES = 16 * 1024 * 1024;

/** hosting.extract.max_files: the most files one deployment may hold. */
export const MAX_ZIP_ENTRIES = 5000;

/** SiteController / DeploymentController paginate(20). */
export const PAGE_SIZE = 20;

/** Walking a list never goes further than this, whatever the server says. */
export const MAX_PAGES = 100;

/** Wait Until Live defaults, in seconds. */
export const DEFAULT_TIMEOUT_SECONDS = 120;
export const MIN_TIMEOUT_SECONDS = 10;
export const MAX_TIMEOUT_SECONDS = 600;

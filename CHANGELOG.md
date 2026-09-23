# Changelog

## 0.1.2

- **Delete** no longer has a Deletion Confirmation field. Droply now keeps sites in a space protected
  against accidental deletion out of reach of the API: they are deleted from the Droply dashboard, and
  the node says so instead of asking for the subdomain.
- The error for such a delete no longer carries Droply's raw answer, which on older servers named the
  subdomain to send.

## 0.1.1

No change in behaviour.

- Clearer help text for the credential's Base URL.
- README: `npm run dev` needs no Docker.

## 0.1.0

First release.

- **Site:** Create, Create or Update, Update, Update Settings, Delete, Get, Get Many, and Check Subdomain
  Availability.
- **Deployment:** Get, Get Many, Retry, Publish Draft and Roll Back.
- Publishes HTML, one file, or several files packed into one site. Waits until the version is live.
- Sets a password and auto-expiry before the first upload. Saves drafts.
- Works as an AI Agent tool.

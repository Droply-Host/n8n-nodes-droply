# n8n-nodes-droply

An [n8n](https://n8n.io) community node for [Droply](https://droply.host). It publishes HTML pages,
files and whole static sites to a live address, and manages them from your workflows.

- **Publish anything.** Publish HTML text, one file (a ZIP of a site, an HTML page, a PDF, an image or a
  document) or several files at once, which the node packs into one site for you.
- **Create or Update by subdomain.** The same workflow run again updates the same address.
- **Waits until live.** The node follows the upload until Droply serves it, and returns the real status
  and the address.
- **Drafts, publish and roll back.** You can save a version without making it live, publish it later, or
  go back to the previous version.
- **Passwords and expiring links.** Both are set before anything is uploaded, so the content is never
  public without its password.
- **Works as an AI Agent tool.** An agent can publish the page it just wrote.

## Requirements

- A Droply account on the **Pro plan or higher**, which includes API access.
- n8n, self-hosted or n8n Cloud.

## Installation

**Self-hosted n8n:**

1. Go to **Settings > Community Nodes** and choose **Install**.
2. Enter `n8n-nodes-droply` and confirm.

In queue mode or a custom Docker image, run `npm install n8n-nodes-droply` in `~/.n8n/nodes` and restart
n8n. See n8n's guide to
[installing community nodes](https://docs.n8n.io/integrations/community-nodes/installation/).

**n8n Cloud:** search for **Droply Host** in the nodes panel. The node is available there once n8n has
verified it.

## Credentials

1. In Droply, go to **Integrations > API tokens** and create a token. Tokens made there have **Full
   access**. Copy it now: it is shown only once.
2. In n8n, create a **Droply API** credential and paste the token. Leave **Base URL** as
   `https://droply.host`. Droply support will never ask you to change it, and the node only sends the
   token to droply.host (or to a local address, for development).

The credential test reads your account. A token on a plan without API access fails the test with "Your
plan does not include API access".

## Operations

**Site**

| Operation                    | What it does                                                                                |
| ---------------------------- | ------------------------------------------------------------------------------------------- |
| Check Subdomain Availability | Says whether a subdomain is free to use.                                                    |
| Create                       | Creates a site and publishes content to it. Leave **Subdomain** empty and Droply picks one. |
| Create or Update             | Publishes to your site with this subdomain, and creates it the first time.                  |
| Update                       | Publishes new content to a site at the same address.                                        |
| Update Settings              | Changes a site's name, password or auto-expiry.                                             |
| Delete                       | Deletes a site permanently.                                                                 |
| Get / Get Many               | Returns one site, or all your sites.                                                        |

**Deployment** (each version of a site is a deployment)

| Operation      | What it does                                                                                |
| -------------- | ------------------------------------------------------------------------------------------- |
| Get / Get Many | Returns one deployment, or a site's deployments with the newest first.                      |
| Retry          | Processes a failed deployment again, optionally choosing the page the site opens on.        |
| Publish Draft  | Makes a draft the version the site serves: the newest draft of a site, or a specific one.   |
| Roll Back      | Makes a previous version live again: the one before the current version, or a specific one. |

You choose the site from a list, or give its address (`https://my-site.droply.id` or a connected custom
domain), its subdomain or its ID.

## Publishing content

Choose a **Source** for Create, Create or Update, and Update:

- **HTML:** a complete HTML document, which becomes the site's `index.html`. Pages over 12 MB are sent as
  a file automatically.
- **File:** one binary file from an earlier node. **Droply decides how to serve a file from its
  extension**: `.zip` becomes a whole site, `.html` a page, `.pdf` opens in a document viewer, images
  display as images. The node sends the file's own name. If the file has no name, set **File Name** in
  the options.
- **Multiple Files:** several binary files published together as one site. By default these are all the
  binary fields on the item; you can list the ones you want instead. To combine files from several items,
  put an **Aggregate** node with **Include Binaries** before this one.
  - With **Keep Folder Structure**, files keep their folders as Read Files From Disk reads them. A name
    like `assets/app.css` also puts a file in a folder.
  - Name the home page `index.html`.
- **None** (Create only): reserves the address without publishing anything yet.

### Waiting until live

By default the node waits until Droply has processed the version, for up to **Timeout** (120 seconds by
default).

- If Droply refuses the version, the item fails with Droply's reason.
- If a ZIP holds several pages that could open the site, the message lists them. Run **Deployment >
  Retry** with **Entry** set to the one you want.
- If the wait runs out, the version is still processing on Droply. Check it with **Deployment > Get**
  rather than running the workflow again, which would upload it a second time.

### Drafts, publishing and rolling back

- Turn on **Publish As Draft** to save a version without changing what the site serves.
- Publish it later with **Deployment > Publish Draft** and **A Specific Draft**, passing the draft's
  deployment ID from the step that saved it (`{{ $('Save draft').item.json.deployment.id }}`). **Latest
  Draft of a Site** publishes whichever draft is newest, whoever saved it, so keep it out of approval flows.
- **Deployment > Roll Back** makes the previous version live again, at the same address and without
  uploading anything.

Drafts and rollback are included on the Pro plan and higher.

### Passwords and expiry

- **Password** protects the site with a visitor password.
- **Expire After (Hours)** or **Expire At** takes the site offline behind a "link expired" page at that
  moment. The content is kept, so you can bring it back.
- On Create and Create or Update, both settings are applied before the upload. An option you added that
  comes out empty (an expression that finds no password) stops the item rather than publishing without it.
- **Site > Update Settings** changes or removes either setting later.
- The password is stored in the workflow like any other parameter: anyone who can open the workflow or its
  executions can read it.

### Output

Create, Create or Update, Update, Retry, Publish Draft and Roll Back return:

```json
{
	"url": "https://weekly-report.droply.id",
	"status": "live",
	"created": false,
	"site": {
		"id": "…",
		"subdomain": "weekly-report",
		"live_url": "https://weekly-report.droply.id",
		"password_protected": false,
		"expires_at": null
	},
	"deployment": {
		"id": "…",
		"status": "live",
		"draft": false,
		"source_type": "zip",
		"file_count": 12
	}
}
```

`created` is only present for Create and Create or Update. The other operations return Droply's records
as the API gives them. Delete returns `{ "deleted": true }`.

## Example workflows

**An AI-written page, live in one step**

1. Chat Trigger.
2. AI Agent, which writes the HTML.
3. Droply Host: Site, Create or Update, Source HTML, Subdomain `daily-brief`.
4. Gmail, sending `{{ $json.url }}`.

**Publish a site when its ZIP lands in Google Drive**

1. Google Drive Trigger, on a file created in a folder.
2. Google Drive, downloading the file.
3. Droply Host: Site, Update, Source File.

**Review before it goes live**

1. Droply Host, named Save draft: Site, Update, with Publish As Draft on.
2. Slack: Send and Wait for approval.
3. If approved, Droply Host: Deployment, Publish Draft, A Specific Draft, Deployment ID
   `{{ $('Save draft').item.json.deployment.id }}`. Only the version that was approved goes live.

## Using it as an AI Agent tool

- Attach **Droply Host** to an AI Agent as a tool, with **Source: HTML**, and let the model fill **HTML**
  with `$fromAI()`.
- **Choose the site yourself** in the node: a fixed subdomain for Create or Update, or a fixed site for
  Update. A chat can carry instructions written by someone else, and a model allowed to choose could be
  talked into publishing over any site in your account. If the model must pick the name, use **Create**,
  which never touches an existing site.
- Agents cannot pass binary files, so File and Multiple Files are for ordinary workflows.
- On self-hosted n8n, set `N8N_COMMUNITY_PACKAGES_ALLOW_TOOL_USAGE=true` to use community nodes as tools.
- Don't give an agent the Delete operation.

## Limits

| Limit                          | Value                                       |
| ------------------------------ | ------------------------------------------- |
| One upload                     | 100 MB, including the request framing       |
| HTML sent as text              | 12 MB (larger pages go as a file)           |
| Files per upload               | 5,000                                       |
| API requests per token         | 60 a minute                                 |
| Deployments processing at once | 5                                           |
| Draft publishes and rollbacks  | 30 an hour                                  |
| Password changes               | 30 an hour (resending the same one is free) |
| Expiry changes                 | 30 an hour                                  |

Your plan's storage, number of sites and daily deploys also apply. When Droply asks the node to slow
down, the node waits and retries by itself.

## Troubleshooting

| Message                                               | What to do                                                                                       |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Droply did not accept the API token                   | Create a new token under API tokens and update the credential.                                   |
| Your plan does not include API access                 | The API is included on Pro and higher.                                                           |
| This token is not permitted to...                     | Use a Full access token from the API tokens page, not one made by a browser or editor extension. |
| Droply needs a file name with an extension            | Set **File Name** in the options, for example `site.zip`.                                        |
| The subdomain '...' belongs to another Droply account | Choose another subdomain.                                                                        |
| Deleting a site in a protected space                  | Type the site's subdomain in **Deletion Confirmation**.                                          |

## Development

```bash
npm install
npm run build
npm run lint
npm test
npm run dev   # runs n8n with this node at http://localhost:5678
```

## Resources

- [Droply's n8n guide](https://droply.host/docs/integrations/n8n)
- [Droply API reference](https://droply.host/docs/api)
- [n8n community nodes](https://docs.n8n.io/integrations/community-nodes/)

## License

[MIT](LICENSE.md)

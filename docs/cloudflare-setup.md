# Cloudflare Setup

This guide is for people who want the easiest path to a working Cloudflare DDNS Worker, especially new or non-technical Synology NAS users.

You will use Cloudflare's Deploy to Cloudflare flow, connect a GitHub or GitLab account, enter a few values, wait for the Worker to deploy, and then move to the DSM guide.

You do not need Node.js, pnpm, or Wrangler for this guide, but you do need a GitHub or GitLab account because Cloudflare creates a repository copy and deploys from it with Workers Builds.

## What you will have at the end

When you finish this guide, you should have:

- a deployed Worker URL, for example `https://cloudflare-ddns.your-name.workers.dev`
- a shared secret you will paste into Synology DSM as the password
- one or more hostnames the Worker is allowed to update

After that, continue to [synology-setup.md](./synology-setup.md) to finish the NAS side.

If you want to understand the trust model before deploying, read [security-model.md](./security-model.md). It explains the current shared-secret design, what it protects, and where its limits are.

## Before you click Deploy to Cloudflare

Have these ready first:

| Item | What it means | Example |
|---|---|---|
| Hostname | The DNS name you want your NAS to keep updated. | `nas.example.com` |
| GitHub or GitLab account | A Git account Cloudflare can connect to so it can create a repository copy and deploy the Worker. | `GitHub` |
| Cloudflare API token | A token with permission to edit DNS records for your zone. The easiest option is Cloudflare's `Edit Zone DNS` template. | `CF_API_TOKEN` |
| Zone ID | The Cloudflare zone ID for your domain. | `CF_ZONE_ID` |
| Shared secret | A long random password that your NAS will send to the Worker. | `DDNS_SHARED_SECRET` |
| Allowed hostnames | A comma-separated list of names this Worker may update. | `nas.example.com` |

These helper links are the fastest way to gather the Cloudflare values:

- [API token templates](https://developers.cloudflare.com/fundamentals/api/reference/template/) for the `Edit Zone DNS` template
- [Create API token](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/) if you want Cloudflare's step-by-step token flow
- [Find account and zone IDs](https://developers.cloudflare.com/fundamentals/account/find-account-and-zone-ids/) if you do not know where the zone ID is shown
- [1Password password generator](https://1password.com/password-generator/) or [Bitwarden password generator](https://bitwarden.com/password-generator/) if you want a browser-based way to generate the shared secret

If you still need the token, zone ID, or shared secret, gather them now in this order.

### Get your API token

From the Cloudflare dashboard, open the account menu in the top-right corner and choose **Profile**.

![Cloudflare dashboard account menu with Profile highlighted in the top-right user menu.](<../assets/cloudflare-account-menu-profile.png>)

Open **API Tokens**, then click **Create Token**.

![Cloudflare user profile page with API Tokens selected in the left sidebar and Create Token highlighted.](<../assets/cloudflare-api-tokens-create-token.png>)

Choose the **Edit zone DNS** template.

![Cloudflare Create API Token page with the Edit zone DNS template highlighted in the token template list.](<../assets/cloudflare-api-token-template-edit-zone-dns.png>)

Restrict the token to your own domain, then continue.

![Cloudflare Edit zone DNS token form with Specific zone selected and Continue to summary highlighted.](<../assets/cloudflare-api-token-zone-scope.png>)

Review the summary, then create the token.

![Cloudflare API token summary page for Edit zone DNS with the Create Token button highlighted.](<../assets/cloudflare-api-token-summary-create.png>)

Copy the token immediately. Cloudflare shows it only once.

![Cloudflare token created page showing the one-time API token value and copy button.](<../assets/cloudflare-api-token-copy-value.png>)

### Copy your zone ID

Open **Domains > Overview**, then use the domain action menu to copy the zone ID.

![Cloudflare Domains Overview page with the domain action menu open and Copy zone ID highlighted.](<../assets/cloudflare-domain-overview-copy-zone-id.png>)

### Generate a shared secret

Generate a long random password for `DDNS_SHARED_SECRET`. Aim for at least 32 random characters.

![Password generator page showing a long random password with symbols enabled and the Copy password button highlighted.](<../assets/ddns-shared-secret-password-generator.png>)

If you want one update to refresh both `nas.example.com` and `*.nas.example.com`, set `DDNS_ALLOWED_HOSTNAMES` to `nas.example.com,*.nas.example.com`.

## Step 1: Open the deploy flow

Use the button in [README.md](../README.md) or open the direct deploy URL:

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/okikio/cloudflare-ddns)

Cloudflare's deploy flow creates a copy of the repository in your GitHub or GitLab account and deploys the Worker from there.

## Step 2: Connect your Git account

If the deploy form asks for a Git account and the list is empty, create a new GitHub connection. GitLab also works, but this guide uses GitHub.

![Deploy to Cloudflare form with the Git account dropdown open and New GitHub Connection highlighted.](<../assets/cloudflare-deploy-form-new-github-connection.png>)

After you authorize GitHub, return to the deploy form and select the connected account from the Git account dropdown.

![Deploy to Cloudflare form with an available Git account selected in the Git account dropdown.](<../assets/cloudflare-deploy-form-select-git-account.png>)

This Git connection is required. Cloudflare needs it to create a repository copy and run Workers Builds for your deployment.

## Step 3: Fill in the required values

When Cloudflare asks for variables and secrets, use the values you gathered earlier:

| Name | What to enter |
|---|---|
| `CF_API_TOKEN` | Your Cloudflare API token for this zone |
| `CF_ZONE_ID` | Your Cloudflare zone ID |
| `DDNS_SHARED_SECRET` | Your shared secret |
| `DDNS_ALLOWED_HOSTNAMES` | Your hostname list, for example `nas.example.com` |

For most NAS setups, leave the other settings at their defaults.

The most important defaults are:

- `DDNS_PROXIED=false`, because direct NAS access usually needs DNS-only mode rather than Cloudflare proxying.
- `DDNS_TTL=1`, which lets Cloudflare manage the TTL automatically.
- `DDNS_LOG_RETENTION_DAYS=30`, which keeps a month of audit history in D1.
- `DDNS_RATE_LIMIT_MAX_REQUESTS=10` and `DDNS_RATE_LIMIT_WINDOW_SECONDS=60`, which limit each client IP to 10 update requests per minute by default.

This is the screen where those values go:

![Deploy to Cloudflare setup form for cloudflare-ddns showing the D1 database section and the fields for CF_API_TOKEN, CF_ZONE_ID, DDNS_SHARED_SECRET, and DDNS_ALLOWED_HOSTNAMES.](<../assets/cloudflare-deploy-form-secrets-and-vars.png>)

## Step 4: Finish the deployment

Submit the form and wait for Cloudflare to finish building and deploying the Worker.

This template's deploy command runs the remote D1 migrations before `wrangler deploy`, so the first Deploy to Cloudflare build provisions the D1 database and applies the SQL schema in the same flow.

When the deploy finishes, copy the Worker URL. It usually looks like `https://<worker-name>.<subdomain>.workers.dev`.

## Step 5: Continue to Synology DSM

Once you have the Worker URL and shared secret, continue to [synology-setup.md](./synology-setup.md).

That guide shows the exact DSM fields to fill in and what success should look like.

## Common questions

### Do I need to create the DNS record first?

No. The Worker can create the record when the NAS sends its first successful update.

### Do I need local development tools for this path?

No. The Deploy to Cloudflare flow handles the build and deployment for you.

### Do I need a GitHub account for this path?

You need a GitHub or GitLab account. Deploy to Cloudflare creates a repository copy in that account and uses Workers Builds to deploy the Worker.

### What if I want to manage the project from my own machine?

Use the advanced local setup in [README.md](../README.md#advanced-local-setup).

### What should I do if the shared secret is compromised?

Rotate it immediately.

1. Generate a new long random value for `DDNS_SHARED_SECRET`.
2. Open the deployed Worker in Cloudflare and update the `DDNS_SHARED_SECRET` secret.
3. Redeploy if Cloudflare does not apply the secret change automatically in your flow.
4. Update every client that calls the Worker, including Synology DSM and any scripts using `POST /update`.
5. Run a manual update and confirm you get `good <ip>` or `nochg <ip>` again.

If you already enabled D1 logging, check the recent DDNS log rows before and after the rotation. Unexpected update attempts, repeated bad-auth requests, or rapid-fire retries from unfamiliar IPs are good reasons to rotate the secret.
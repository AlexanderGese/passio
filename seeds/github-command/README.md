# github-command — $49

Full GitHub remote. Create + comment + close issues, review and merge PRs, cut releases, manage repos, read/write files, gists, notifications, stars.

Auth: fine-grained PAT (https://github.com/settings/tokens?type=beta) with the repos you need + `workflow`. Paste into Settings along with your license key.

Every tool is agent-callable — "Passio, close stale issues in owner/repo and label them as stale" works.

Autopilot: nightly tick auto-labels open issues older than 30 days as `stale` in the configured target repos. Off + dry-run on by default.

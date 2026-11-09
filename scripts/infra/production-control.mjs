// Bootstrap only: close native Git deploy paths before merging schema-dependent
// changes. This edits no credentials, application vars, databases, or user data.
import { appendFile } from 'node:fs/promises';
import { cloudflareClient, assertProduction, assertOnlyNativeDeployChange, PROJECT } from './cloudflare.mjs';
const api = cloudflareClient();
const path = `/pages/projects/${PROJECT}`;
const before = await api(path);
assertProduction(before);
if (!before.source?.config || before.source.type !== 'github') throw Error('Expected an existing GitHub-connected Pages project');
const previous = {
  production_deployments_enabled: before.source.config.production_deployments_enabled,
  preview_deployment_setting: before.source.config.preview_deployment_setting,
};
if (typeof previous.production_deployments_enabled !== 'boolean') throw Error('Native production deploy state not returned; no changes made');
console.log(JSON.stringify({ previousGitDeploymentSettings: previous, registrationClosed: true }));
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `\nPrior native Git deployment settings (recovery metadata):\n\n\`\`\`json\n${JSON.stringify(previous, null, 2)}\n\`\`\`\n`);
const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}${path}`, {
  method: 'PATCH', headers: { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ source: { type: 'github', config: { production_deployments_enabled: false, preview_deployment_setting: 'none' } } }),
  signal: AbortSignal.timeout(30000),
});
if (!response.ok || (await response.json()).success !== true) throw Error('Native Git deployment update failed; response body suppressed');
const after = await api(path);
assertProduction(after);
if (after.source?.config?.production_deployments_enabled !== false || after.source?.config?.preview_deployment_setting !== 'none') throw Error('Native Git deployment settings were not persisted');
assertOnlyNativeDeployChange(before, after);
console.log('Production and preview native Git auto-deploy disabled. Dedicated protected workflows now control publication; registration remains closed.');

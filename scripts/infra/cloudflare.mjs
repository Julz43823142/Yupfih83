import { isDeepStrictEqual } from 'node:util';
// Never log API responses: Pages config may contain secret values and D1 exports
// contain a short-lived download URL that is itself a bearer credential.
export const PRODUCTION_AUTH_DB = '82e07afa-79eb-47e5-aa77-5bac6fb5bbdf';
export const PREVIEW_AUTH_DB = 'e1d84922-0f74-414f-8fe5-2c3ac48f7884';
export const PROJECT = 'fairplaychess';
export const idOf = binding => binding?.id || binding?.database_id;

export function cloudflareClient(env = process.env, fetchImpl = fetch) {
  const account = env.CLOUDFLARE_ACCOUNT_ID;
  const token = env.CLOUDFLARE_API_TOKEN;
  if (!/^[a-f0-9]{32}$/i.test(account || '') || !token) throw Error('Cloudflare credentials missing or invalid');
  return async (path, body) => {
    const response = await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${account}${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(120000),
    });
    if (!response.ok) throw Error(`Cloudflare request failed (HTTP ${response.status})`);
    const result = await response.json();
    if (result.success !== true || result.result?.some?.(x => x.success === false)) throw Error('Cloudflare request was rejected');
    return result.result;
  };
}

export function assertProduction(project) {
  const production = project?.deployment_configs?.production;
  const preview = project?.deployment_configs?.preview;
  if (project?.name !== PROJECT || project.production_branch !== 'main' ||
      idOf(production?.d1_databases?.AUTH_DB) !== PRODUCTION_AUTH_DB ||
      idOf(preview?.d1_databases?.AUTH_DB) !== PREVIEW_AUTH_DB) throw Error('Production/preview targets do not match the reviewed configuration');
  const vars = production.env_vars || {};
  if (vars.PUBLIC_SIGNUP_ENABLED?.value !== 'false' || vars.PASSKEY_LOGIN_ENABLED?.value !== 'true' ||
      vars.PASSKEY_RP_ID?.value !== 'eloscanner.com' || !vars.BETTER_AUTH_SECRET) {
    throw Error('Production must keep registration closed and preserve existing authentication settings');
  }
  return production;
}

export function assertOnlyNativeDeployChange(before, after) {
  const withoutSwitches = source => {
    const copy = structuredClone(source);
    delete copy.config.production_deployments_enabled;
    delete copy.config.preview_deployment_setting;
    return copy;
  };
  if (!isDeepStrictEqual(withoutSwitches(before.source), withoutSwitches(after.source)) ||
      !isDeepStrictEqual(before.deployment_configs, after.deployment_configs)) {
    throw Error('Unexpected repository, source, or application configuration change; inspect Cloudflare before release');
  }
}

export function assertPreviewIsolation(project) {
  const prod = project.deployment_configs?.production || {};
  const preview = project.deployment_configs?.preview || {};
  const prodD1 = new Set(Object.values(prod.d1_databases || {}).map(idOf));
  const prodServices = new Set(Object.values(prod.services || {}).map(x => `${x?.service || ''}:${x?.environment || 'production'}`));
  const prodDurableObjects = new Set(Object.values(prod.durable_object_namespaces || {}).map(x => x?.namespace_id));
  if (Object.values(preview.d1_databases || {}).some(x => prodD1.has(idOf(x))) ||
      Object.values(preview.services || {}).some(x => prodServices.has(`${x?.service || ''}:${x?.environment || 'production'}`)) ||
      Object.values(preview.durable_object_namespaces || {}).some(x => x?.namespace_id && prodDurableObjects.has(x.namespace_id))) {
    throw Error('Preview can reach a production database or service; isolate or remove those preview bindings before release');
  }
}

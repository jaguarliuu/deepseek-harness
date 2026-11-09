/** Scope the desktop plugin manager's TLS exception to the internal npm repository. */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Patch the pinned pnpm registry dispatcher before the payload is sealed.
 * @param directory - Copied pnpm package directory.
 * @returns Nothing. A changed pnpm layout fails the payload build.
 */
export function patchPnpmIntranetTls(directory: string): void {
  const entry = join(directory, 'dist', 'pnpm.mjs')
  let source = readFileSync(entry, 'utf8')
  const replacements = [
    [
      '  const originalOrigin = urlObject.origin;\n  while (true) {\n    const dispatcherOptions = {',
      `  const originalOrigin = urlObject.origin;
  const zhiweiRegistryTls = process.env.DSH_ZHIWEI_PLUGIN_PNPM === "1"
    && ["add", "install", "i", "view"].includes(process.argv[2]);
  while (true) {
    const dispatcherOptions = {`,
    ],
    [
      '      strictSsl: defaultOpts.strictSsl ?? true,',
      `      zhiweiRegistryTls,
      strictSsl: zhiweiRegistryTls ? !isZhiweiNpmRequest(urlObject) : defaultOpts.strictSsl ?? true,`,
    ],
    [
      'function removeCredentialHeaders(headers) {',
      `function isZhiweiNpmRequest(url) {
  if (url.origin !== "https://25.75.3.1" || url.username || url.password)
    return false;
  try {
    const path = decodeURIComponent(url.pathname);
    const registry = url.pathname.startsWith("/repository/npm/");
    const proxyTarball = url.pathname.startsWith("/repository/npm-proxy/") && path.endsWith(".tgz");
    if (!registry && !proxyTarball) return false;
    return !path.includes("%") && !path.includes("\\\\") && !path.split("/").some(segment => segment === "." || segment === "..");
  } catch (error) {
    if (error instanceof URIError) return false;
    throw error;
  }
}
function removeCredentialHeaders(headers) {`,
    ],
    [
      'return Boolean(opts3.httpProxy || opts3.httpsProxy || opts3.ca',
      'return Boolean(opts3.zhiweiRegistryTls || opts3.httpProxy || opts3.httpsProxy || opts3.ca',
    ],
    [
      '    `strict-ssl:${isHttps ? Boolean(opts3.strictSsl).toString() : ">no-strict-ssl<"}`,',
      '    `strict-ssl:${isHttps ? Boolean(opts3.strictSsl).toString() : ">no-strict-ssl<"}`,\n    `zhiwei-registry-tls:${opts3.zhiweiRegistryTls === true}`,',
    ],
    [
      '    proxyTls: {\n      ca: opts3.ca,\n      rejectUnauthorized: opts3.strictSsl ?? true\n',
      '    proxyTls: {\n      ca: opts3.ca,\n      rejectUnauthorized: opts3.zhiweiRegistryTls ? true : opts3.strictSsl ?? true\n',
    ],
  ] as const
  for (const [original, replacement] of replacements) {
    if (source.split(original).length !== 2) throw new Error('primary runtime: pnpm intranet TLS replacement site changed: ' + original)
    source = source.replace(original, () => replacement)
  }
  writeFileSync(entry, source)
}

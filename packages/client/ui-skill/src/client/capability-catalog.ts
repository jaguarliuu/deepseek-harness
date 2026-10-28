/** Catalog identity admission adapted from Anywhere Labs Community Market install/service.ts.
 * Copyright (c) 2026 Anywhere Labs. MIT; see THIRD-PARTY-NOTICES.json and ANYWHERE-LABS-LICENSE.
 * Local policy uses Host-provided pinned targets instead of resolving public npm latest.
 */
const PACKAGE_NAME_PATTERN = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u
const EXACT_VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u

/** Admit only an exact npm identity supplied by the host catalog, never a provider command.
 * @param name - Host-owned package identity.
 * @param target - Exact offered install target.
 * @returns Whether identity and pinned version match.
 */
export function isPinnedCatalogTarget(name: string, target: { spec: string; version: string } | undefined): boolean {
  return target !== undefined && PACKAGE_NAME_PATTERN.test(name)
    && EXACT_VERSION_PATTERN.test(target.version) && target.spec === `${name}@${target.version}`
}

/** Curated office titles; unmatched skill names retain their real catalog identity. */
export const OFFICE_SKILL_TITLES = {
  'gov-doc-writing': 'center.skillTitleGov',
  'meeting-recap': 'center.skillTitleMeeting',
  'work-report-writer': 'center.skillTitleReport',
  'dataset-health-audit': 'center.skillTitleQuality',
  'data-viz-gen': 'center.skillTitleViz',
} as const

/** Keep the office facet deterministic and independent of translated descriptions.
 * @param name - Catalog skill name.
 * @returns Whether the skill belongs to the office facet.
 */
export function isOfficeSkill(name: string): boolean {
  return Object.hasOwn(OFFICE_SKILL_TITLES, name) || name === 'office' || name.startsWith('office-')
}

import { describe, expect, it } from 'vitest'
import { isOfficeSkill, isPinnedCatalogTarget } from '../src/client/capability-catalog.ts'

describe('internal capability catalog identity', () => {
  it('admits an exact host package version including the bundled prerelease', () => {
    expect(isPinnedCatalogTarget('@deepseek-ai/dsh-example', { spec: '@deepseek-ai/dsh-example@0.2.1-rc.3', version: '0.2.1-rc.3' })).toBe(true)
  })
  it.each(['latest', '^1.0.0', '1.0', '1.0.0 && echo bad', '01.0.0'])('rejects unpinned or executable version %s', (version) => {
    expect(isPinnedCatalogTarget('example', { spec: `example@${version}`, version })).toBe(false)
  })
  it('rejects mismatched package identities and missing targets', () => {
    expect(isPinnedCatalogTarget('example', { spec: 'other@1.0.0', version: '1.0.0' })).toBe(false)
    expect(isPinnedCatalogTarget('example;cmd', { spec: 'example;cmd@1.0.0', version: '1.0.0' })).toBe(false)
    expect(isPinnedCatalogTarget('example', undefined)).toBe(false)
  })
  it('classifies office workflows without misclassifying unrelated skills', () => {
    expect(isOfficeSkill('gov-doc-writing')).toBe(true)
    expect(isOfficeSkill('office-docx')).toBe(true)
    expect(isOfficeSkill('office')).toBe(true)
    expect(isOfficeSkill('custom-office-copy')).toBe(false)
  })
})

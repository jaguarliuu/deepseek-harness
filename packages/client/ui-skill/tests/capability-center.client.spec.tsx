// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { CapabilityCenter } from '../src/client/CapabilityCenter.tsx'
import { zh } from '../src/client/locales.ts'

type Props = Parameters<typeof CapabilityCenter>[0]
afterEach(cleanup)

function fixture(): Props {
  return {
    t: makeTranslate(zh),
    useSessions: select => select({ ids: [], byId: {}, projectionsBySession: {}, phase: 'ready' }),
    useResource: (() => ({ status: 'live', failure: undefined, reload: vi.fn(), value: { skills: [
      { name: 'meeting-recap', description: '整理会议记录并生成 Word', modelInvocable: true },
      { name: 'custom-tool', description: '开发辅助', modelInvocable: true },
    ] } })) as Props['useResource'],
    catalogStatus: 'ready',
    catalog: [{ name: 'example-plugin', title: '资料检索', description: '搜索资料', installed: false,
      availability: 'missing', official: false, enabled: false, rows: [],
      installTarget: { spec: 'example-plugin@1.2.3', version: '1.2.3' } }],
    install: vi.fn(), openPackage: vi.fn(),
  } as Props
}

describe('capability center', () => {
  it('searches plugins and skills in one catalog and filters office workflows', () => {
    render(<CapabilityCenter {...fixture()} />)
    expect(screen.getByRole('button', { name: '资料检索 · 查看详情' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '会议纪要 · 查看详情' })).toBeTruthy()
    fireEvent.change(screen.getByRole('textbox', { name: zh['center.search'] }), { target: { value: '会议' } })
    expect(screen.queryByRole('button', { name: '资料检索 · 查看详情' })).toBeNull()
    fireEvent.change(screen.getByRole('textbox', { name: zh['center.search'] }), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: '办公场景' }))
    expect(screen.queryByRole('button', { name: 'custom-tool · 查看详情' })).toBeNull()
    expect(screen.getByRole('button', { name: '会议纪要 · 查看详情' })).toBeTruthy()
  })
  it('does not install until the exact version is confirmed', () => {
    const props = fixture()
    render(<CapabilityCenter {...props} />)
    fireEvent.click(screen.getByRole('button', { name: '资料检索 · 查看详情' }))
    fireEvent.click(screen.getByRole('button', { name: '安装此版本' }))
    expect(props.install).not.toHaveBeenCalled()
    expect(screen.getByText('example-plugin@1.2.3')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '确认安装' }))
    expect(props.install).toHaveBeenCalledExactlyOnceWith({ spec: 'example-plugin@1.2.3', version: '1.2.3', title: '资料检索' })
  })
  it('shows a full skill description and an explicit command without invoking it', () => {
    const props = fixture()
    render(<CapabilityCenter {...props} />)
    fireEvent.click(screen.getByRole('button', { name: '会议纪要 · 查看详情' }))
    expect(screen.getByRole('textbox', { name: '调用指令' })).toHaveProperty('value', '/meeting-recap')
    expect(props.install).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '关闭' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

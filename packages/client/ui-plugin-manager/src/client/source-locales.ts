/** Copy for the intranet source settings page. */
export const sourceEn = {
  title: 'Intranet sources', intro: 'State Grid · Zhiwei Little C',
  description: 'Configure package sources for this application. Each card saves independently.',
  npm: 'npm plugin source', python: 'Python package source',
  npmHint: 'Used by plugin installation and version lookup. Saving clears fallback registries. An explicitly selected installation source takes precedence.',
  pythonHint: 'Used by pip in newly launched local processes, including Agent commands. Existing processes and system-wide settings are unchanged; explicit pip options take precedence.',
  address: 'Source address', invalid: 'Enter an HTTP(S) URL without credentials, query, or fragment',
  reset: 'Restore default', overridden: 'Configured', save: 'Save source', saving: 'Saving…',
  unavailable: 'Configuration is not available', readOnly: 'This deployment is read-only',
  saveFailed: 'Could not save. Your edits are retained; reload the page or retry.',
  effective: 'Saved source', inherited: 'Use deployment or environment default',
  note: 'Python indexes commonly end with /simple/. Clearing a field restores its default. This configures package sources; it does not block other network requests.',
}

/** Simplified Chinese copy with the same keys as English. */
export const sourceZh: Record<keyof typeof sourceEn, string> = {
  title: '内网源', intro: '国家电网 · 智维小 C',
  description: '统一配置应用使用的软件包来源，两项配置分别保存',
  npm: 'npm 插件源', python: 'Python 依赖源',
  npmHint: '用于插件安装和版本查询，保存时清空备用源。安装时主动选择的其他源优先',
  pythonHint: '用于应用新启动的本地进程中的 pip，包括 Agent 命令。已运行进程和系统全局配置不变，显式 pip 参数优先',
  address: '源地址', invalid: '请输入 HTTP(S) 地址，不包含账号密码、查询参数或片段',
  reset: '恢复默认', overridden: '已配置', save: '保存源配置', saving: '正在保存…',
  unavailable: '当前无法读取配置', readOnly: '当前部署为只读',
  saveFailed: '保存失败，已保留修改，请重新打开页面或重试',
  effective: '已保存的源', inherited: '使用部署或环境默认值',
  note: 'Python 源通常以 /simple/ 结尾。清空后保存可恢复默认。这些配置控制软件包来源，不阻断其他网络请求',
}

/** Keys owned by this settings page. */
export type SourceKey = keyof typeof sourceEn

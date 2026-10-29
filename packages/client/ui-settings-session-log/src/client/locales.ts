/** Copy for the API Session-log upload preference. */
export const en = {
  title: 'Upload Session Log when using the official model API',
  description: 'When enabled, session logs are sent to the provider with official model requests.',
  saved: 'Preference saved',
  failed: 'Could not save preference',
}

/** Chinese preference copy. */
export const zh: Record<keyof typeof en, string> = {
  title: '在使用官方模型 API 时上传 Session Log',
  description: '开启后，会话日志将随官方模型请求发送给对应提供商',
  saved: '设置已保存',
  failed: '无法保存设置',
}

/** Japanese copy, checked against the English keys. */
export const ja = {
  'title': '公式モデル API 使用時にセッションログをアップロード',
  'description': '有効にすると、公式モデルへのリクエストとともにセッションログがプロバイダーに送信されます。',
  'saved': '設定を保存しました',
  'failed': '設定を保存できませんでした',
} satisfies Record<keyof typeof en, string>

/** Spanish dictionary, checked against the English keys. */
export const es = {
  title: 'Cargar registro de sesión cuando utilice el modelo oficial API',
  description: 'Al activarlo, los registros de sesión se envían al proveedor con las solicitudes del modelo oficial.',
  saved: 'Preferencia guardada',
  failed: 'No se pudo guardar la preferencia',
} satisfies Record<keyof typeof en, string>

/** French dictionary, checked against the English keys. */
export const fr = {
  title: "Téléchargez le journal de session lors de l'utilisation du modèle officiel API",
  description: 'Lorsque cette option est activée, les journaux de session sont envoyés au fournisseur avec les requêtes du modèle officiel.',
  saved: 'Préférence enregistrée',
  failed: "Impossible d'enregistrer la préférence",
} satisfies Record<keyof typeof en, string>

/** German dictionary, checked against the English keys. */
export const de = {
  title: 'Laden Sie das Sitzungsprotokoll hoch, wenn Sie das offizielle Modell API verwenden',
  description: 'Bei Aktivierung werden Sitzungsprotokolle mit offiziellen Modellanfragen an den Anbieter gesendet.',
  saved: 'Präferenz gespeichert',
  failed: 'Präferenz konnte nicht gespeichert werden',
} satisfies Record<keyof typeof en, string>

/** Russian dictionary, checked against the English keys. */
export const ru = {
  title: 'Загрузить журнал сеансов при использовании официальной модели API',
  description: 'При включении журналы сессии отправляются поставщику вместе с запросами к официальной модели.',
  saved: 'Предпочтение сохранено.',
  failed: 'Не удалось сохранить предпочтения.',
} satisfies Record<keyof typeof en, string>

/** Portuguese dictionary, checked against the English keys. */
export const pt = {
  title: 'Carregar log de sessão ao usar o modelo oficial API',
  description: 'Quando ativado, os registros de sessão são enviados ao provedor com as solicitações do modelo oficial.',
  saved: 'Preferência salva',
  failed: 'Não foi possível salvar a preferência',
} satisfies Record<keyof typeof en, string>

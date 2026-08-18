/* ============================================================
 * OFFICIAL SHOP ADMINISTRATION — js/config.js
 *
 * Este é o ÚNICO ficheiro autorizado a conter a Publishable Key.
 * NUNCA colocar aqui (ou em qualquer outro ficheiro do projeto):
 *   - service_role
 *   - secret key
 *   - qualquer chave administrativa
 *
 * Nenhum outro ficheiro pode duplicar esta chave.
 * ============================================================ */

const CONFIG = {
  supabase: {
    url: 'https://veojzfnyctihrhehbjqm.supabase.co',

    /*
     * ⚠️ AÇÃO OBRIGATÓRIA ANTES DE USAR O SISTEMA:
     *
     * Substitua o valor abaixo pela PUBLISHABLE KEY do projeto:
     *   Supabase Dashboard → Project Settings → API Keys
     *   → "Publishable key" (formato "sb_publishable_...")
     *   (ou a chave "anon" legacy, formato "eyJ...")
     *
     * Sem esta chave, NENHUMA operação funcionará — e o
     * diagnóstico do sistema irá mostrar esse erro abertamente.
     */
    publishableKey: 'sb_publishable_oW7MzC4Xxu0CSOMpXqwHCg_DsMGXJL9'
  },

  app: {
    name: 'OFFICIAL SHOP ADMINISTRATION',
    currency: 'MZN',        // Metical moçambicano
    locale: 'pt-MZ',
    pageSize: 10,
    sessionKey: 'officialshop.session'
  }
};

/* Verifica se a configuração mínima do Supabase está presente. */
function isSupabaseConfigured() {
  return typeof CONFIG.supabase.url === 'string'
      && CONFIG.supabase.url.indexOf('https://') === 0
      && typeof CONFIG.supabase.publishableKey === 'string'
      && CONFIG.supabase.publishableKey.length > 20
      && CONFIG.supabase.publishableKey !== 'SUBSTITUIR_PELA_PUBLISHABLE_KEY';
}

/* ============================================================
 * OSA — OFFICIAL SHOP ADMINISTRATOR
 * js/config.js
 *
 * ÚNICO ficheiro autorizado a conter a Publishable Key.
 *
 * NUNCA colocar aqui:
 *   - service_role
 *   - secret key
 *   - chave administrativa
 *
 * A Publishable Key pode ficar no frontend.
 * A proteção dos dados deve ser feita através das RLS Policies.
 * ============================================================ */

const CONFIG = {

  supabase: {

    url: 'https://veojzfnyctihrhehbjqm.supabase.co',

    /*
     * Publishable Key do projeto Supabase.
     *
     * Esta chave é pública por natureza.
     * A segurança NÃO depende de esconder esta chave.
     * A segurança depende das RLS Policies do banco.
     */

    publishableKey:
      'sb_publishable_oW7MzC4Xxu0CSOMpXqwHCg_DsMGXJL9'
  },

  app: {

    name: 'OSA — Official Shop Administrator',

    shortName: 'OSA',

    currency: 'MZN',

    locale: 'pt-MZ',

    pageSize: 10,

    /*
     * Nome exclusivo da sessão do OSA.
     */

    sessionKey: 'osa.session'
  }

};


/* ============================================================
 * Verificação da configuração mínima
 * ============================================================ */

function isSupabaseConfigured() {

  return (

    typeof CONFIG === 'object' &&

    CONFIG.supabase &&

    typeof CONFIG.supabase.url === 'string' &&

    CONFIG.supabase.url.indexOf('https://') === 0 &&

    typeof CONFIG.supabase.publishableKey === 'string' &&

    CONFIG.supabase.publishableKey.length > 20 &&

    CONFIG.supabase.publishableKey !==
      'SUBSTITUIR_PELA_PUBLISHABLE_KEY'

  );

}

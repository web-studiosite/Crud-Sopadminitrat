/* ============================================================
 * OFFICIAL SHOP ADMINISTRATION — js/supabase.js
 *
 * ÚNICA camada responsável pela comunicação HTTP com o Supabase.
 * Nenhum outro módulo executa fetch() contra o Supabase.
 *
 * Função central: apiRequest(endpoint, options)
 * Responsabilidades:
 *   1. montar URL;
 *   2. adicionar "apikey";
 *   3. adicionar "Authorization";
 *   4. adicionar "Content-Type" quando necessário;
 *   5. executar fetch;
 *   6. interpretar resposta;
 *   7. detetar HTTP errors;
 *   8. detetar erros Supabase;
 *   9. retornar dados;
 *  10. retornar informações de erro completas.
 *
 * REGRA: erros NUNCA são escondidos.
 * ============================================================ */

const SupabaseClient = (() => {
  'use strict';

  /* O token de acesso é obtido por injeção (auth.js regista o provider).
   * Assim supabase.js não depende de auth.js e a arquitetura fica limpa. */
  let tokenProvider = null;

  function setTokenProvider(fn) { tokenProvider = fn; }

  function currentToken() {
    try { return tokenProvider ? tokenProvider() : null; }
    catch (e) { return null; }
  }

  /**
   * Executa um pedido HTTP contra o Supabase.
   * Retorna SEMPRE um objeto:
   *   { ok, status, data, error, contentRange }
   * - ok === true  → operação aceite pelo Supabase
   * - ok === false → error contém { type, message, code, hint, detail }
   */
  async function request(url, options) {
    options = options || {};
    const method = options.method || 'GET';

    const headers = Object.assign(
      { 'apikey': CONFIG.supabase.publishableKey },
      options.headers || {}
    );

    const token = currentToken();
    if (token && !headers['Authorization']) {
      headers['Authorization'] = 'Bearer ' + token;
    }

    let body;
    if (options.body !== undefined && options.body !== null) {
      if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';
      body = JSON.stringify(options.body);
    }

    let response;
    try {
      response = await fetch(url, { method: method, headers: headers, body: body });
    } catch (networkError) {
      return {
        ok: false,
        status: 0,
        data: null,
        contentRange: null,
        error: {
          type: 'network',
          message: 'Falha de rede ao contactar o Supabase (' + url + '). Verifique a ligação à internet e a URL do projeto.',
          detail: String(networkError)
        }
      };
    }

    const rawText = await response.text();
    let data = null;
    if (rawText) {
      try { data = JSON.parse(rawText); }
      catch (parseErr) { data = rawText; }
    }

    if (!response.ok) {
      const message =
        (data && (data.message || data.error_description || data.error || data.msg)) ||
        (typeof data === 'string' && data ? data : null) ||
        ('HTTP ' + response.status);
      return {
        ok: false,
        status: response.status,
        data: null,
        contentRange: response.headers.get('content-range'),
        error: {
          type: 'supabase',
          message: message,
          code: (data && data.code) ? data.code : null,
          hint: (data && data.hint) ? data.hint : null,
          detail: data
        }
      };
    }

    return {
      ok: true,
      status: response.status,
      data: data,
      error: null,
      contentRange: response.headers.get('content-range')
    };
  }

  /** Pedido à REST API (PostgREST): endpoint ex. "products?select=*" */
  function apiRequest(endpoint, options) {
    const base = CONFIG.supabase.url.replace(/\/+$/, '');
    return request(base + '/rest/v1/' + endpoint, options);
  }

  /** Pedido à Auth REST API (GoTrue): path ex. "token?grant_type=password" */
  function authRequest(path, options) {
    const base = CONFIG.supabase.url.replace(/\/+$/, '');
    return request(base + '/auth/v1/' + path, options);
  }

  return { apiRequest, authRequest, setTokenProvider };
})();

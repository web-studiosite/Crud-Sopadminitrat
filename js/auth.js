/* ============================================================
 * OFFICIAL SHOP ADMINISTRATION — js/auth.js
 *
 * Autenticação REAL via Supabase Auth REST API.
 * Comunica exclusivamente através de SupabaseClient (supabase.js).
 *
 * Funções públicas:
 *   login(email, password)
 *   logout()
 *   getSession()
 *   getCurrentUser()
 *   getCurrentProfile()
 *   requireAuth()
 *   requireRole(roles)
 *   requestPasswordReset(email)
 *
 * REGRAS:
 * - Palavras-passe vivem em auth.users — NUNCA em public.users,
 *   NUNCA em localStorage, NUNCA no código.
 * - Apenas tokens/sessão são guardados (localStorage).
 * - A sessão é SEMPRE validada pelo Supabase, nunca "confiada"
 *   só porque existe algo no frontend.
 * ============================================================ */

const Auth = (() => {
  'use strict';

  const STORAGE_KEY = CONFIG.app.sessionKey;
  let cachedProfile = null;

  /* ---------- sessão (apenas tokens) ---------- */

  function saveSession(session) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  }

  function loadSession() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function clearSession() {
    localStorage.removeItem(STORAGE_KEY);
    cachedProfile = null;
  }

  /* supabase.js obtém o token daqui (injeção de dependência). */
  SupabaseClient.setTokenProvider(() => {
    const s = loadSession();
    return s && s.access_token ? s.access_token : null;
  });

  /* ---------- login / logout ---------- */

  async function login(email, password) {
    if (!isSupabaseConfigured()) {
      return { ok: false, status: 0, error: { message: 'Publishable Key não configurada em js/config.js.' } };
    }

    const res = await SupabaseClient.authRequest('token?grant_type=password', {
      method: 'POST',
      body: { email: email, password: password }
    });
    if (!res.ok) return { ok: false, status: res.status, error: res.error };

    const s = res.data;
    saveSession({
      access_token: s.access_token,
      refresh_token: s.refresh_token,
      token_type: s.token_type || 'bearer',
      expires_at: Date.now() + ((s.expires_in || 3600) * 1000),
      user: s.user || null
    });

    /* Identificação do perfil/role — obrigatória após autenticação. */
    const profile = await getCurrentProfile(true);
    if (!profile.ok) {
      clearSession();
      return {
        ok: false,
        status: profile.status,
        error: {
          message: 'Autenticado, mas o perfil em public.users não foi encontrado: ' + profile.error.message,
          detail: profile.error
        }
      };
    }
    if (profile.data.active === false) {
      clearSession();
      return { ok: false, status: 403, error: { message: 'Esta conta está desativada. Contacte o administrador.' } };
    }

    return { ok: true, user: loadSession().user, profile: profile.data };
  }

  async function logout() {
    const s = loadSession();
    if (s && s.access_token) {
      /* Tenta invalidar a sessão no servidor; mesmo que falhe,
       * a sessão local é limpa e o utilizador sai. */
      await SupabaseClient.authRequest('logout', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + s.access_token }
      });
    }
    clearSession();
    window.location.replace('login.html');
  }

  /* ---------- sessão: obter / renovar ---------- */

  async function refreshSession() {
    const s = loadSession();
    if (!s || !s.refresh_token) {
      return { ok: false, error: { message: 'Sem sessão para renovar.' } };
    }
    const res = await SupabaseClient.authRequest('token?grant_type=refresh_token', {
      method: 'POST',
      body: { refresh_token: s.refresh_token }
    });
    if (!res.ok) {
      clearSession();
      return { ok: false, status: res.status, error: res.error };
    }
    const d = res.data;
    saveSession({
      access_token: d.access_token,
      refresh_token: d.refresh_token || s.refresh_token,
      token_type: d.token_type || 'bearer',
      expires_at: Date.now() + ((d.expires_in || 3600) * 1000),
      user: d.user || s.user || null
    });
    return { ok: true };
  }

  /** Devolve a sessão local válida; renova-a no Supabase se estiver quase a expirar. */
  async function getSession() {
    const s = loadSession();
    if (!s) return null;
    if (s.expires_at && (s.expires_at - Date.now()) < 60 * 1000) {
      const r = await refreshSession();
      if (!r.ok) return null;
      return loadSession();
    }
    return s;
  }

  async function getAccessToken() {
    const s = await getSession();
    return s ? s.access_token : null;
  }

  /* ---------- utilizador / perfil ---------- */

  /** Valida o utilizador JUNTO DO SUPABASE (GET /auth/v1/user). */
  async function getCurrentUser() {
    const token = await getAccessToken();
    if (!token) {
      return { ok: false, status: 401, error: { message: 'Sessão inexistente ou expirada.' } };
    }
    const res = await SupabaseClient.authRequest('user', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) clearSession();
      return res;
    }
    return { ok: true, data: res.data };
  }

  /** Perfil complementar em public.users (name, role, active). */
  async function getCurrentProfile(forceRefresh) {
    if (cachedProfile && !forceRefresh) return { ok: true, data: cachedProfile };

    const userRes = await getCurrentUser();
    if (!userRes.ok) return userRes;

    const authId = userRes.data.id;
    const res = await SupabaseClient.apiRequest(
      'users?auth_user_id=eq.' + encodeURIComponent(authId) + '&select=*&limit=1'
    );
    if (!res.ok) return res;
    if (!Array.isArray(res.data) || res.data.length === 0) {
      return {
        ok: false,
        status: 404,
        error: { message: 'Perfil não encontrado em public.users para auth_user_id=' + authId }
      };
    }
    cachedProfile = res.data[0];
    return { ok: true, data: cachedProfile };
  }

  /* ---------- proteção de páginas ---------- */

  function redirectToLogin() {
    window.location.replace('login.html');
  }

  /** Exige sessão validada pelo Supabase; caso contrário redireciona. */
  async function requireAuth() {
    const user = await getCurrentUser();
    if (!user.ok) {
      redirectToLogin();
      return null;
    }
    return user.data;
  }

  /**
   * Exige sessão + role autorizada.
   * Se falhar: NENHUM dado protegido é carregado.
   * (A segurança real vem do RLS no banco — isto é apenas a porta.)
   */
  async function requireRole(allowedRoles) {
    const user = await requireAuth();
    if (!user) return null;

    const prof = await getCurrentProfile();
    if (!prof.ok) {
      redirectToLogin();
      return null;
    }
    if (prof.data.active === false) {
      clearSession();
      redirectToLogin();
      return null;
    }
    if (allowedRoles.indexOf(prof.data.role) === -1) {
      blockPage(prof.data);
      return null;
    }
    return prof.data;
  }

  function blockPage(profile) {
    const role = profile && profile.role ? profile.role : 'desconhecida';
    document.body.innerHTML =
      '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;' +
      'background:#0f172a;color:#e2e8f0;font-family:system-ui,sans-serif;padding:24px;">' +
      '<div style="max-width:460px;text-align:center;background:#1e293b;border:1px solid #334155;' +
      'border-radius:16px;padding:40px 32px;">' +
      '<div style="font-size:44px;margin-bottom:12px;">🔒</div>' +
      '<h1 style="font-size:20px;margin:0 0 8px;">Acesso bloqueado</h1>' +
      '<p style="color:#94a3b8;font-size:14px;margin:0 0 20px;">A sua role (<strong>' + role + '</strong>) ' +
      'não tem permissão para aceder a esta página. Nenhum dado protegido foi carregado.</p>' +
      '<button onclick="Auth.logout()" style="background:#4f46e5;color:#fff;border:none;border-radius:10px;' +
      'padding:10px 22px;font-size:14px;cursor:pointer;">Terminar sessão</button>' +
      '</div></div>';
  }

  /* ---------- recuperação de palavra-passe ---------- */

  async function requestPasswordReset(email) {
    const res = await SupabaseClient.authRequest('recover', {
      method: 'POST',
      body: { email: email }
    });
    if (!res.ok) return res;
    return { ok: true };
  }

  return {
    login,
    logout,
    getSession,
    getAccessToken,
    getCurrentUser,
    getCurrentProfile,
    requireAuth,
    requireRole,
    requestPasswordReset,
    clearSession
  };
})();

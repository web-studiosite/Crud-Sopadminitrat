/* ============================================================
 * OSA — OFFICIAL SHOP ADMINISTRATOR
 * js/auth.js
 *
 * AUTENTICAÇÃO REAL VIA SUPABASE AUTH REST API.
 *
 * Funções:
 *
 *   Auth.login(email, password)
 *   Auth.logout()
 *   Auth.getSession()
 *   Auth.getAccessToken()
 *   Auth.getCurrentUser()
 *   Auth.getCurrentProfile()
 *   Auth.requireAuth()
 *   Auth.requireRole(roles)
 *   Auth.requestPasswordReset(email)
 *   Auth.clearSession()
 *
 * REGRAS:
 *
 * - Palavra-passe vive em auth.users.
 * - Nunca guardar password no localStorage.
 * - public.users contém o perfil complementar.
 * - A sessão é validada no Supabase.
 * - RLS é a camada real de segurança dos dados.
 * ============================================================ */

const Auth = (() => {

  'use strict';


  /* ==========================================================
   * CONFIGURAÇÃO
   * ========================================================== */

  const STORAGE_KEY = CONFIG.app.sessionKey;

  let cachedProfile = null;


  /* ==========================================================
   * SESSÃO LOCAL
   * ========================================================== */

  function saveSession(session) {

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(session)
    );
  }


  function loadSession() {

    try {

      const raw = localStorage.getItem(STORAGE_KEY);

      return raw ? JSON.parse(raw) : null;

    } catch (error) {

      console.error('OSA — erro ao ler sessão:', error);

      return null;
    }
  }


  function clearSession() {

    localStorage.removeItem(STORAGE_KEY);

    cachedProfile = null;
  }


  /* ==========================================================
   * TOKEN PROVIDER
   * ========================================================== */

  SupabaseClient.setTokenProvider(() => {

    const session = loadSession();

    return session && session.access_token
      ? session.access_token
      : null;
  });


  /* ==========================================================
   * LOGIN
   * ========================================================== */

  async function login(email, password) {

    if (!isSupabaseConfigured()) {

      return {
        ok: false,
        status: 0,
        error: {
          message:
            'Supabase não está configurado em js/config.js.'
        }
      };
    }


    if (!email || !password) {

      return {
        ok: false,
        status: 400,
        error: {
          message:
            'Email e palavra-passe são obrigatórios.'
        }
      };
    }


    const res = await SupabaseClient.authRequest(
      'token?grant_type=password',
      {
        method: 'POST',

        body: {
          email: email,
          password: password
        }
      }
    );


    if (!res.ok) {
      return res;
    }


    const sessionData = res.data;


    if (!sessionData.access_token) {

      return {
        ok: false,
        status: 500,
        error: {
          message:
            'O Supabase autenticou a operação, mas não devolveu access_token.'
        }
      };
    }


    saveSession({

      access_token: sessionData.access_token,

      refresh_token: sessionData.refresh_token || null,

      token_type:
        sessionData.token_type || 'bearer',

      expires_at:
        Date.now() +
        ((sessionData.expires_in || 3600) * 1000),

      user:
        sessionData.user || null

    });


    /*
     * Depois da autenticação:
     * confirmar que existe o perfil em public.users.
     */

    const profile =
      await getCurrentProfile(true);


    if (!profile.ok) {

      clearSession();

      return {

        ok: false,

        status: profile.status,

        error: {

          message:
            'Autenticado no Supabase, mas o perfil em public.users não foi encontrado: ' +
            ((profile.error && profile.error.message)
              ? profile.error.message
              : 'erro desconhecido'),

          detail: profile.error || null
        }
      };
    }


    if (profile.data.active === false) {

      clearSession();

      return {

        ok: false,

        status: 403,

        error: {

          message:
            'Esta conta está desativada. Contacte o administrador.'
        }
      };
    }


    return {

      ok: true,

      user: loadSession().user,

      profile: profile.data
    };
  }


  /* ==========================================================
   * LOGOUT
   * ========================================================== */

  async function logout() {

    const session = loadSession();


    if (session && session.access_token) {

      try {

        await SupabaseClient.authRequest(
          'logout',
          {
            method: 'POST',

            headers: {
              'Authorization':
                'Bearer ' + session.access_token
            }
          }
        );

      } catch (error) {

        console.warn(
          'OSA — não foi possível invalidar a sessão no servidor:',
          error
        );
      }
    }


    clearSession();

    window.location.replace('login.html');
  }


  /* ==========================================================
   * REFRESH SESSION
   * ========================================================== */

  async function refreshSession() {

    const session = loadSession();


    if (!session || !session.refresh_token) {

      return {
        ok: false,
        status: 401,
        error: {
          message:
            'Não existe refresh token para renovar a sessão.'
        }
      };
    }


    const res =
      await SupabaseClient.authRequest(
        'token?grant_type=refresh_token',
        {
          method: 'POST',

          body: {
            refresh_token:
              session.refresh_token
          }
        }
      );


    if (!res.ok) {

      clearSession();

      return res;
    }


    const data = res.data;


    if (!data.access_token) {

      clearSession();

      return {

        ok: false,

        status: 500,

        error: {
          message:
            'O Supabase não devolveu um novo access_token.'
        }
      };
    }


    saveSession({

      access_token:
        data.access_token,

      refresh_token:
        data.refresh_token ||
        session.refresh_token,

      token_type:
        data.token_type ||
        'bearer',

      expires_at:
        Date.now() +
        ((data.expires_in || 3600) * 1000),

      user:
        data.user ||
        session.user ||
        null

    });


    return {
      ok: true
    };
  }


  /* ==========================================================
   * GET SESSION
   * ========================================================== */

  async function getSession() {

    const session = loadSession();


    if (!session) {
      return null;
    }


    /*
     * Renovar quando faltar menos de 60 segundos.
     */

    if (
      session.expires_at &&
      (session.expires_at - Date.now()) < 60000
    ) {

      const refresh =
        await refreshSession();

      if (!refresh.ok) {
        return null;
      }

      return loadSession();
    }


    return session;
  }


  /* ==========================================================
   * ACCESS TOKEN
   * ========================================================== */

  async function getAccessToken() {

    const session =
      await getSession();

    return session
      ? session.access_token
      : null;
  }


  /* ==========================================================
   * CURRENT USER
   *
   * GET /auth/v1/user
   *
   * A sessão local não é considerada suficiente.
   * ========================================================== */

  async function getCurrentUser() {

    const token =
      await getAccessToken();


    if (!token) {

      return {

        ok: false,

        status: 401,

        error: {
          message:
            'Sessão inexistente ou expirada.'
        }
      };
    }


    const res =
      await SupabaseClient.authRequest(
        'user',
        {
          headers: {
            'Authorization':
              'Bearer ' + token
          }
        }
      );


    if (!res.ok) {

      if (
        res.status === 401 ||
        res.status === 403
      ) {

        clearSession();
      }

      return res;
    }


    return {

      ok: true,

      data: res.data
    };
  }


  /* ==========================================================
   * CURRENT PROFILE
   *
   * public.users
   *
   * Relação:
   *
   * auth.users.id
   *        ↓
   * public.users.auth_user_id
   * ========================================================== */

  async function getCurrentProfile(forceRefresh) {

    if (
      cachedProfile &&
      !forceRefresh
    ) {

      return {

        ok: true,

        data: cachedProfile
      };
    }


    const userRes =
      await getCurrentUser();


    if (!userRes.ok) {
      return userRes;
    }


    const authId =
      userRes.data.id;


    if (!authId) {

      return {

        ok: false,

        status: 500,

        error: {
          message:
            'O Supabase não devolveu o ID do utilizador autenticado.'
        }
      };
    }


    const res =
      await SupabaseClient.apiRequest(

        'users?auth_user_id=eq.' +
        encodeURIComponent(authId) +
        '&select=*&limit=1'

      );


    if (!res.ok) {
      return res;
    }


    if (
      !Array.isArray(res.data) ||
      res.data.length === 0
    ) {

      return {

        ok: false,

        status: 404,

        error: {

          message:
            'Perfil não encontrado em public.users para auth_user_id=' +
            authId
        }
      };
    }


    cachedProfile =
      res.data[0];


    return {

      ok: true,

      data: cachedProfile
    };
  }


  /* ==========================================================
   * REQUIRE AUTH
   * ========================================================== */

  async function requireAuth() {

    const user =
      await getCurrentUser();


    if (!user.ok) {

      window.location.replace('login.html');

      return null;
    }


    return user.data;
  }


  /* ==========================================================
   * REQUIRE ROLE
   * ========================================================== */

  async function requireRole(allowedRoles) {

    if (!Array.isArray(allowedRoles)) {

      console.error(
        'OSA — requireRole recebeu roles inválidas.'
      );

      window.location.replace('login.html');

      return null;
    }


    const user =
      await requireAuth();


    if (!user) {
      return null;
    }


    const profile =
      await getCurrentProfile();


    if (!profile.ok) {

      window.location.replace('login.html');

      return null;
    }


    if (profile.data.active === false) {

      clearSession();

      window.location.replace('login.html');

      return null;
    }


    if (
      allowedRoles.indexOf(
        profile.data.role
      ) === -1
    ) {

      blockPage(profile.data);

      return null;
    }


    return profile.data;
  }


  /* ==========================================================
   * BLOCK PAGE
   * ========================================================== */

  function blockPage(profile) {

    const role =
      profile &&
      profile.role
        ? profile.role
        : 'desconhecida';


    document.body.innerHTML =

      '<div style="' +
      'min-height:100vh;' +
      'display:flex;' +
      'align-items:center;' +
      'justify-content:center;' +
      'background:#0f172a;' +
      'color:#e2e8f0;' +
      'font-family:system-ui,sans-serif;' +
      'padding:24px;' +
      '">' +

        '<div style="' +
        'max-width:460px;' +
        'text-align:center;' +
        'background:#1e293b;' +
        'border:1px solid #334155;' +
        'border-radius:16px;' +
        'padding:40px 32px;' +
        '">' +

          '<div style="font-size:44px;margin-bottom:12px;">🔒</div>' +

          '<h1 style="font-size:20px;margin:0 0 8px;">' +
            'Acesso bloqueado' +
          '</h1>' +

          '<p style="color:#94a3b8;font-size:14px;margin:0 0 20px;">' +

            'A sua role (' +

            '<strong>' +
              escapeHtml(role) +
            '</strong>' +

            ') não tem permissão para aceder a esta página.' +

          '</p>' +

          '<button ' +
            'type="button" ' +
            'onclick="Auth.logout()" ' +
            'style="' +
              'background:#4f46e5;' +
              'color:#fff;' +
              'border:none;' +
              'border-radius:10px;' +
              'padding:10px 22px;' +
              'font-size:14px;' +
              'cursor:pointer;' +
            '">' +

            'Terminar sessão' +

          '</button>' +

        '</div>' +

      '</div>';
  }


  /* ==========================================================
   * ESCAPE
   * ========================================================== */

  function escapeHtml(value) {

    return String(value == null ? '' : value)

      .replace(/&/g, '&amp;')

      .replace(/</g, '&lt;')

      .replace(/>/g, '&gt;')

      .replace(/"/g, '&quot;')

      .replace(/'/g, '&#039;');
  }


  /* ==========================================================
   * PASSWORD RESET
   * ========================================================== */

  async function requestPasswordReset(email) {

    if (!email) {

      return {

        ok: false,

        status: 400,

        error: {
          message:
            'Informe o email.'
        }
      };
    }


    const res =
      await SupabaseClient.authRequest(
        'recover',
        {
          method: 'POST',

          body: {
            email: email
          }
        }
      );


    if (!res.ok) {
      return res;
    }


    return {
      ok: true
    };
  }


  /* ==========================================================
   * API PÚBLICA
   * ========================================================== */

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

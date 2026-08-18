/* ============================================================
 * OFFICIAL SHOP ADMINISTRATION — js/data.js
 *
 * CAMADA CENTRAL DE CRUD.
 * Nenhum módulo conhece detalhes da API REST — tudo passa por aqui,
 * e daqui por SupabaseClient.apiRequest (supabase.js).
 *
 * Operações:
 *   Data.create(table, data)
 *   Data.read(table, options)      → select, filters, search, order, pagination, count
 *   Data.readOne(table, id)
 *   Data.update(table, id, data)
 *   Data.delete(table, id)
 *   Data.count(table, options)
 *
 * REGRA DE OURO (false success proibido):
 *   CREATE  → só devolve ok:true se o Supabase devolver o registro criado.
 *   UPDATE  → só ok:true se o Supabase devolver o registro atualizado.
 *   DELETE  → só ok:true depois de confirmar a AUSÊNCIA do registro.
 * ============================================================ */

const Data = (() => {
  'use strict';

  /* ---------- construção de query PostgREST ---------- */

  function buildQuery(options) {
    options = options || {};
    const parts = [];

    parts.push('select=' + encodeURIComponent(options.select || '*'));

    (options.filters || []).forEach((f) => {
      parts.push(encodeURIComponent(f.column) + '=' + f.op + '.' + encodeURIComponent(f.value));
    });

    if (options.search && options.search.term &&
        options.search.columns && options.search.columns.length) {
      const term = String(options.search.term).replace(/[(),.*]/g, ' ').trim();
      if (term) {
        const or = options.search.columns
          .map((c) => c + '.ilike.*' + term + '*')
          .join(',');
        parts.push('or=(' + or + ')');
      }
    }

    if (options.order && options.order.column) {
      parts.push(
        'order=' + encodeURIComponent(options.order.column) +
        '.' + (options.order.ascending === false ? 'desc' : 'asc')
      );
    }

    if (options.limit)  parts.push('limit='  + parseInt(options.limit, 10));
    if (options.offset) parts.push('offset=' + parseInt(options.offset, 10));

    return parts.join('&');
  }

  /* ---------- READ ---------- */

  async function read(table, options) {
    options = options || {};
    const headers = {};
    if (options.withCount) headers['Prefer'] = 'count=exact';

    const res = await SupabaseClient.apiRequest(table + '?' + buildQuery(options), { headers: headers });
    if (!res.ok) return res;

    let total = null;
    if (res.contentRange) {
      const m = /\/(\d+)$/.exec(res.contentRange);
      if (m) total = parseInt(m[1], 10);
    }
    return { ok: true, status: res.status, data: res.data || [], total: total };
  }

  async function readOne(table, id) {
    const res = await read(table, { filters: [{ column: 'id', op: 'eq', value: id }] });
    if (!res.ok) return res;
    if (!res.data.length) {
      return { ok: false, status: 404, error: { message: 'Registro não encontrado (id=' + id + ').' } };
    }
    return { ok: true, status: res.status, data: res.data[0] };
  }

  async function count(table, options) {
    const opts = Object.assign({}, options || {}, { limit: 1, withCount: true });
    const res = await read(table, opts);
    if (!res.ok) return res;
    return { ok: true, count: (res.total === null ? res.data.length : res.total) };
  }

  /* ---------- CREATE ---------- */

  async function create(table, payload) {
    const res = await SupabaseClient.apiRequest(table, {
      method: 'POST',
      headers: { 'Prefer': 'return=representation' },
      body: payload
    });
    if (!res.ok) return res;

    const row = Array.isArray(res.data) ? res.data[0] : res.data;
    if (!row || !row.id) {
      return {
        ok: false,
        status: res.status,
        error: { message: 'INSERT foi aceite mas o Supabase não devolveu o registro criado. Operação NÃO confirmada.' }
      };
    }
    /* Persistência confirmada: o registro devolvido veio do PostgreSQL. */
    return { ok: true, status: res.status, data: row };
  }

  /* ---------- UPDATE ---------- */

  async function update(table, id, payload) {
    if (!id) return { ok: false, status: 400, error: { message: 'UPDATE recusado: ID inválido.' } };

    const res = await SupabaseClient.apiRequest(table + '?id=eq.' + encodeURIComponent(id), {
      method: 'PATCH',
      headers: { 'Prefer': 'return=representation' },
      body: payload
    });
    if (!res.ok) return res;

    const rows = Array.isArray(res.data) ? res.data : (res.data ? [res.data] : []);
    if (!rows.length) {
      return {
        ok: false,
        status: 404,
        error: { message: 'Nenhum registro atualizado — ID inexistente ou operação bloqueada por RLS.' }
      };
    }
    /* Confirmação real: o Supabase devolveu o registro já atualizado. */
    return { ok: true, status: res.status, data: rows[0] };
  }

  /* ---------- DELETE ---------- */

  async function remove(table, id) {
    if (!id) return { ok: false, status: 400, error: { message: 'DELETE recusado: ID inválido.' } };

    const res = await SupabaseClient.apiRequest(table + '?id=eq.' + encodeURIComponent(id), {
      method: 'DELETE',
      headers: { 'Prefer': 'return=representation' }
    });
    if (!res.ok) return res;

    const rows = Array.isArray(res.data) ? res.data : (res.data ? [res.data] : []);
    if (!rows.length) {
      return {
        ok: false,
        status: 404,
        error: { message: 'Nenhum registro eliminado — ID inexistente ou operação bloqueada por RLS.' }
      };
    }

    /* Confirmar a AUSÊNCIA no Supabase antes de declarar sucesso. */
    const check = await readOne(table, id);
    if (check.ok) {
      return {
        ok: false,
        status: 500,
        error: { message: 'DELETE devolveu sucesso mas o registro AINDA existe no Supabase.' }
      };
    }
    return { ok: true, status: res.status, data: rows[0] };
  }

  return {
    create: create,
    read: read,
    readOne: readOne,
    update: update,
    delete: remove,
    count: count
  };
})();

/* ============================================================
 * OSA — OFFICIAL SHOP ADMINISTRATOR
 * js/data.js
 *
 * CAMADA CENTRAL DE CRUD.
 *
 * Nenhum módulo deve precisar conhecer os detalhes do
 * PostgREST/Supabase.
 *
 * Operações:
 *
 *   Data.create(table, data)
 *   Data.read(table, options)
 *   Data.readOne(table, id)
 *   Data.update(table, id, data)
 *   Data.delete(table, id)
 *   Data.count(table, options)
 *
 * REGRA:
 *
 * Nunca declarar sucesso sem confirmação do Supabase.
 * ============================================================ */

const Data = (() => {

  'use strict';


  /* ==========================================================
   * BUILD QUERY
   * ========================================================== */

  function buildQuery(options) {

    options = options || {};

    const parts = [];


    /* SELECT */

    parts.push(
      'select=' +
      encodeURIComponent(
        options.select || '*'
      )
    );


    /* FILTERS */

    (options.filters || []).forEach(function (filter) {

      if (
        !filter ||
        !filter.column ||
        !filter.op
      ) {
        return;
      }


      parts.push(

        encodeURIComponent(
          filter.column
        ) +

        '=' +

        filter.op +

        '.' +

        encodeURIComponent(
          filter.value
        )

      );
    });


    /* SEARCH */

    if (
      options.search &&
      options.search.term &&
      Array.isArray(options.search.columns) &&
      options.search.columns.length
    ) {

      const term = String(
        options.search.term
      )
        .replace(/[(),.*]/g, ' ')
        .trim();


      if (term) {

        const or = options.search.columns

          .map(function (column) {

            return (
              column +
              '.ilike.*' +
              term +
              '*'
            );

          })

          .join(',');


        parts.push(
          'or=(' + or + ')'
        );
      }
    }


    /* ORDER */

    if (
      options.order &&
      options.order.column
    ) {

      parts.push(

        'order=' +

        encodeURIComponent(
          options.order.column
        ) +

        '.' +

        (
          options.order.ascending === false
            ? 'desc'
            : 'asc'
        )

      );
    }


    /* LIMIT */

    if (
      options.limit !== undefined &&
      options.limit !== null
    ) {

      const limit =
        parseInt(options.limit, 10);


      if (
        Number.isFinite(limit) &&
        limit >= 0
      ) {

        parts.push(
          'limit=' + limit
        );
      }
    }


    /* OFFSET */

    if (
      options.offset !== undefined &&
      options.offset !== null
    ) {

      const offset =
        parseInt(options.offset, 10);


      if (
        Number.isFinite(offset) &&
        offset >= 0
      ) {

        parts.push(
          'offset=' + offset
        );
      }
    }


    return parts.join('&');
  }


  /* ==========================================================
   * READ
   * ========================================================== */

  async function read(table, options) {

    options = options || {};


    if (!table) {

      return {

        ok: false,

        status: 400,

        error: {
          message:
            'READ recusado: tabela não especificada.'
        }
      };
    }


    const headers = {};


    if (options.withCount) {

      headers['Prefer'] =
        'count=exact';
    }


    const query =
      buildQuery(options);


    const endpoint =
      table + '?' + query;


    const res =
      await SupabaseClient.apiRequest(
        endpoint,
        {
          headers: headers
        }
      );


    if (!res.ok) {
      return res;
    }


    let total = null;


    if (res.contentRange) {

      const match =
        /\/(\d+)$/.exec(
          res.contentRange
        );


      if (match) {

        total =
          parseInt(
            match[1],
            10
          );
      }
    }


    return {

      ok: true,

      status: res.status,

      data:
        Array.isArray(res.data)
          ? res.data
          : [],

      total: total
    };
  }


  /* ==========================================================
   * READ ONE
   * ========================================================== */

  async function readOne(table, id) {

    if (!table || !id) {

      return {

        ok: false,

        status: 400,

        error: {
          message:
            'READ ONE recusado: tabela ou ID inválido.'
        }
      };
    }


    const res =
      await read(
        table,
        {
          filters: [
            {
              column: 'id',
              op: 'eq',
              value: id
            }
          ],

          limit: 1
        }
      );


    if (!res.ok) {
      return res;
    }


    if (!res.data.length) {

      return {

        ok: false,

        status: 404,

        error: {
          message:
            'Registro não encontrado (id=' +
            id +
            ').'
        }
      };
    }


    return {

      ok: true,

      status: res.status,

      data: res.data[0]
    };
  }


  /* ==========================================================
   * COUNT
   * ========================================================== */

  async function count(table, options) {

    const opts =
      Object.assign(
        {},
        options || {},
        {
          limit: 1,
          withCount: true
        }
      );


    const res =
      await read(
        table,
        opts
      );


    if (!res.ok) {
      return res;
    }


    return {

      ok: true,

      count:
        res.total === null
          ? res.data.length
          : res.total
    };
  }


  /* ==========================================================
   * CREATE
   * ========================================================== */

  async function create(table, payload) {

    if (!table) {

      return {

        ok: false,

        status: 400,

        error: {
          message:
            'CREATE recusado: tabela não especificada.'
        }
      };
    }


    const res =
      await SupabaseClient.apiRequest(
        table,
        {
          method: 'POST',

          headers: {
            'Prefer':
              'return=representation'
          },

          body: payload
        }
      );


    if (!res.ok) {
      return res;
    }


    const row =
      Array.isArray(res.data)
        ? res.data[0]
        : res.data;


    /*
     * O Supabase precisa devolver o registro criado.
     */

    if (!row || !row.id) {

      return {

        ok: false,

        status: res.status,

        error: {

          message:
            'INSERT foi aceite, mas o Supabase não devolveu o registro criado. Operação NÃO confirmada.'
        }
      };
    }


    return {

      ok: true,

      status: res.status,

      data: row
    };
  }


  /* ==========================================================
   * UPDATE
   * ========================================================== */

  async function update(
    table,
    id,
    payload
  ) {

    if (!table || !id) {

      return {

        ok: false,

        status: 400,

        error: {
          message:
            'UPDATE recusado: tabela ou ID inválido.'
        }
      };
    }


    const endpoint =
      table +
      '?id=eq.' +
      encodeURIComponent(id);


    const res =
      await SupabaseClient.apiRequest(
        endpoint,
        {
          method: 'PATCH',

          headers: {
            'Prefer':
              'return=representation'
          },

          body: payload
        }
      );


    if (!res.ok) {
      return res;
    }


    const rows =
      Array.isArray(res.data)
        ? res.data
        : res.data
          ? [res.data]
          : [];


    /*
     * PATCH sem registro devolvido não é sucesso.
     */

    if (!rows.length) {

      return {

        ok: false,

        status: 404,

        error: {

          message:
            'Nenhum registro atualizado — ID inexistente ou operação bloqueada por RLS.'
        }
      };
    }


    return {

      ok: true,

      status: res.status,

      data: rows[0]
    };
  }


  /* ==========================================================
   * DELETE
   * ========================================================== */

  async function remove(
    table,
    id
  ) {

    if (!table || !id) {

      return {

        ok: false,

        status: 400,

        error: {
          message:
            'DELETE recusado: tabela ou ID inválido.'
        }
      };
    }


    const endpoint =
      table +
      '?id=eq.' +
      encodeURIComponent(id);


    const res =
      await SupabaseClient.apiRequest(
        endpoint,
        {
          method: 'DELETE',

          headers: {
            'Prefer':
              'return=representation'
          }
        }
      );


    if (!res.ok) {
      return res;
    }


    const rows =
      Array.isArray(res.data)
        ? res.data
        : res.data
          ? [res.data]
          : [];


    /*
     * DELETE sem registro devolvido não é sucesso.
     */

    if (!rows.length) {

      return {

        ok: false,

        status: 404,

        error: {

          message:
            'Nenhum registro eliminado — ID inexistente ou operação bloqueada por RLS.'
        }
      };
    }


    /*
     * Confirmação adicional:
     * procurar novamente o mesmo registro.
     */

    const check =
      await readOne(
        table,
        id
      );


    if (check.ok) {

      return {

        ok: false,

        status: 500,

        error: {

          message:
            'DELETE devolveu sucesso, mas o registro AINDA existe no Supabase.'
        }
      };
    }


    /*
     * 404 aqui é exatamente o resultado esperado:
     * o registro deixou de existir.
     */

    if (
      check.status !== 404
    ) {

      return {

        ok: false,

        status: 500,

        error: {

          message:
            'DELETE executado, mas não foi possível confirmar a ausência do registro.'
        }
      };
    }


    return {

      ok: true,

      status: res.status,

      data: rows[0]
    };
  }


  /* ==========================================================
   * API PÚBLICA
   * ========================================================== */

  return {

    create: create,

    read: read,

    readOne: readOne,

    update: update,

    delete: remove,

    count: count

  };

})();

"use strict";

/* ------------------------------------------------------------------ *
 * SUDECO — Store de dados (em memória, no navegador)
 *
 * Única fonte de dados do protótipo: carrega data/seed.json e serve as
 * coleções (contracts, penalties, extensions) para o front-end, com
 * CRUD completo — GET lista/item, POST, PUT, PATCH, DELETE por id — tudo
 * EM MEMÓRIA. As edições valem só na aba atual e voltam ao original ao
 * recarregar a página. As prorrogações são derivadas da semente quando
 * ela não as traz prontas.
 * ------------------------------------------------------------------ */

window.SudecoStaticStore = (function () {
  /* Extrai o nº de meses de um prazo textual ("12 meses" -> 12). */
  function parseMonths(term) {
    const m = /(\d+)\s*mes/i.exec(term || "");
    return m ? parseInt(m[1], 10) : null;
  }

  /* Subtrai `months` meses de uma data ISO (YYYY-MM-DD), em UTC. */
  function minusMonths(iso, months) {
    if (!iso || !months) return null;
    const [y, mo, d] = iso.split("-").map(Number);
    const dt = new Date(Date.UTC(y, mo - 1, d));
    dt.setUTCMonth(dt.getUTCMonth() - months);
    return dt.toISOString().slice(0, 10);
  }

  /* Monta as coleções a partir da semente (atribui ids e deriva prorrogações). */
  function build(seed) {
    const contracts = seed.contracts.map((c, i) => ({ id: i + 1, ...c }));

    let extensions;
    if (Array.isArray(seed.extensions) && seed.extensions.length) {
      extensions = seed.extensions.map((e, i) => ({ id: i + 1, ...e }));
    } else {
      extensions = [];
      contracts.forEach((c) => {
        if (c.extended && c.end_date && !c.indefinite_end) {
          extensions.push({
            id: extensions.length + 1,
            contract_id: c.id,
            contract_number: c.number,
            start_date: minusMonths(c.end_date, parseMonths(c.initial_term)) || c.start_date,
            end_date: c.end_date,
            note: c.amendment_text || "Termo aditivo de prorrogação",
          });
        }
      });
    }

    return {
      contracts,
      penalties: seed.penalties.map((p, i) => ({ id: i + 1, ...p })),
      extensions,
    };
  }

  /* Carrega a semente e devolve um objeto com .handle(path, opts) que
   * responde como a API faria. Lança se não conseguir ler a semente. */
  async function create(seedUrl) {
    const res = await fetch(seedUrl, { cache: "no-store" });
    if (!res.ok) throw new Error("Semente indisponível (" + res.status + ")");
    const data = build(await res.json());

    const nextId = (arr) => arr.reduce((m, x) => Math.max(m, x.id || 0), 0) + 1;

    /* Mesma assinatura usada pelo cliente fetch: (path, { method, body }). */
    function handle(path, opts = {}) {
      const method = (opts.method || "GET").toUpperCase();
      const m = path.split("?")[0].match(/^\/([^/]+)(?:\/([^/]+))?/);
      const coll = m && m[1];
      const list = data[coll];
      if (!list) throw new Error("Coleção desconhecida: " + coll);
      const id = m && m[2] ? +m[2] : null;
      const body = opts.body ? JSON.parse(opts.body) : null;

      if (method === "GET") {
        if (id != null) {
          const found = list.find((x) => x.id === id);
          if (!found) throw new Error("Erro 404");
          return found;
        }
        return list;
      }
      if (method === "POST") {
        const row = { ...body, id: nextId(list) };
        list.push(row);
        return row;
      }
      if (method === "PUT" || method === "PATCH") {
        const i = list.findIndex((x) => x.id === id);
        if (i < 0) throw new Error("Erro 404");
        list[i] = method === "PUT" ? { ...body, id } : { ...list[i], ...body };
        return list[i];
      }
      if (method === "DELETE") {
        const i = list.findIndex((x) => x.id === id);
        if (i >= 0) list.splice(i, 1);
        return null;
      }
      throw new Error("Método não suportado: " + method);
    }

    return { handle };
  }

  return { create };
})();

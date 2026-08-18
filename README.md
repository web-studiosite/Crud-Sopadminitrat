# 🏷 OFFICIAL SHOP ADMINISTRATION — ERP

Sistema de gestão (Loja POS · Armazém · Stock · Vendas · Caixa · Combustível · Inventário · Auditoria) construído com **HTML5 + CSS3 + JavaScript Vanilla ES6+ + Fetch API + Supabase REST/Auth REST**, para deploy em **GitHub Pages**.

> **Estado atual: FASE 1 — Auth + Fundação + CRUD de Produtos.**
> Fases seguintes só avançam depois desta ser validada em produção (regra de paragem).

---

## Arquitetura

```
Interface (admin.html / cashier.html / login.html)
   ↓
Módulo (script da página)
   ↓
core.js*            (Fase 3+)
   ↓
data.js             (camada central de CRUD)
   ↓
supabase.js         (ÚNICA camada HTTP — apiRequest/authRequest)
   ↓
Fetch API
   ↓
Supabase REST API / Auth REST API
   ↓
PostgreSQL (RLS + policies + triggers + auditoria)
```

\* `core.js`, `products.js`, `stock.js`, `sales.js`, `movements.js`, `inventory.js`, `fuel.js`, `cashier.js` entram nas fases seguintes.

## Estrutura de ficheiros (Fase 1)

```
/index.html              → router de entrada (valida sessão no Supabase e encaminha por role)
/login.html              → autenticação real + recuperação de palavra-passe
/admin.html              → diagnóstico do sistema + CRUD real de produtos (admin / junior_admin)
/cashier.html            → consulta real de produtos autorizados (cashier) — POS chega na Fase 5
/css/style.css           → design partilhado
/css/paginacashier.css   → design da página do caixa
/js/config.js            → ÚNICO ficheiro com a Publishable Key
/js/supabase.js          → única camada de comunicação HTTP
/js/auth.js              → login, logout, sessão, roles, proteção de páginas
/js/data.js              → Data.create/read/readOne/update/delete + count/search/pagination
/js/ui.js                → toasts, modais, confirmações, formatação MZN
/database.sql            → esquema completo: tabelas, RLS, policies, triggers, auditoria
```

---

## Instalação (ordem obrigatória)

### 1 — Criar o esquema no Supabase

1. Abra o projeto `zkaiernafgdkabbyvdkl` no Supabase Dashboard.
2. **SQL Editor → New query** → cole **todo** o conteúdo de `database.sql` → **Run**.
3. Confirme que as 10 tabelas foram criadas (Table Editor).

### 2 — Criar utilizadores e perfis

1. **Authentication → Users → Add user** → crie o utilizador (e-mail + palavra-passe).
   - Ative **Auto Confirm User** para não depender de e-mail de confirmação.
2. Copie o **User UID** gerado.
3. No SQL Editor, crie o perfil (uma linha por utilizador):

```sql
insert into public.users (auth_user_id, name, role)
values ('COLE-AQUI-O-USER-UID', 'Nome do Administrador', 'admin');
```

Roles válidas: `admin`, `junior_admin`, `cashier`.
As palavras-passe vivem **apenas** em `auth.users` — nunca em `public.users`.

### 3 — Configurar a Publishable Key

1. **Project Settings → API Keys** → copie a **Publishable key** (`sb_publishable_...`).
2. Abra `js/config.js` e substitua `SUBSTITUIR_PELA_PUBLISHABLE_KEY`.
3. Nunca use `service_role` nem `secret key` no frontend. A chave existe **só** neste ficheiro.

### 4 — Deploy no GitHub Pages

1. Crie um repositório e envie todos os ficheiros (mantendo a estrutura `css/` e `js/`).
2. **Settings → Pages → Deploy from a branch** → `main` → `/ (root)`.
3. Abra `https://<utilizador>.github.io/<repositório>/`.

---

## ✅ Checklist de validação da Fase 1 (regra de paragem)

Antes de autorizar a Fase 2, confirme em produção (GitHub Pages):

- [ ] O sistema abre e `index.html` redireciona corretamente
- [ ] **LOGIN** ✓ — e-mail + palavra-passe autenticam via Supabase Auth
- [ ] **SESSION** ✓ — sessão mantém-se após reload e expira/renova corretamente
- [ ] **ROLE** ✓ — admin/junior_admin → `admin.html`; cashier → `cashier.html`; acesso cruzado bloqueado
- [ ] **RLS** ✓ — cashier não consegue ler `purchase_price` nem eliminar nada (teste na consola se quiser)
- [ ] **CREATE** ✓ — produto criado aparece no Table Editor do Supabase
- [ ] **READ** ✓ — lista de produtos reflete o banco, com pesquisa e paginação
- [ ] **UPDATE** ✓ — edição confirmada no Supabase antes do toast de sucesso
- [ ] **DELETE** ✓ — eliminação confirmada pela ausência real do registro
- [ ] **Diagnóstico** ✓ — todas as verificações em OK (execute como `admin`)
- [ ] Dados permanecem após reload da página
- [ ] Logout limpa a sessão e bloqueia páginas protegidas

Se algum item falhar: **não avance**. O diagnóstico mostra operação, HTTP status, endpoint e mensagem real do Supabase.

---

## Diagnóstico do Sistema

`admin.html` executa automaticamente testes reais:

| Verificação | O que testa |
|---|---|
| Supabase URL | Publishable Key configurada em `js/config.js` |
| Fetch API | suporte do browser |
| Auth | sessão validada em `GET /auth/v1/user` |
| REST API / READ | `SELECT` real em `products` |
| CREATE | `INSERT` real (produto `DIAG-*` temporário) |
| UPDATE | `PATCH` real + valor confirmado |
| DELETE | `DELETE` real + ausência confirmada |

> Nota: como `junior_admin`, o DELETE de diagnóstico falha propositadamente — eliminar produtos é reservado a `admin` por policy RLS. Isto é o sistema a funcionar corretamente, não um erro.

## Segurança

- Autenticação: **Supabase Auth** real (tokens em localStorage; palavras-passe nunca saem do `auth.users`).
- Autorização: **RLS + policies** no PostgreSQL — manipular o JavaScript ou a URL não dá acesso a dados proibidos.
- `products_pos` (vista com `security_invoker`) expõe ao caixa apenas colunas permitidas.
- `movements` e `sales` são imutáveis via API (sem policies de update/delete): correções fazem-se por movimentos inversos.
- `audit_logs` é escrito apenas por triggers (`security definer`); leitura reservada a `admin`.

## Moeda

Todos os valores monetários são **MZN — Metical moçambicano**. Lucro = `sale_price − purchase_price`. Nenhum valor fictício é usado em lado nenhum.

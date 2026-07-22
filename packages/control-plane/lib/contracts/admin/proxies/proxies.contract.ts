import { c } from "../../contract";
import { commonErrorResponses } from "../../common";
import {
  ProxyDidParamSchema,
  ProxyUpstreamParamSchema,
  ProxyRuleParamSchema,
  ProxyPrincipalParamSchema,
  ListProxyLogsQuerySchema,
  UpdateProxyBodySchema,
  CreateUpstreamBodySchema,
  UpdateUpstreamBodySchema,
  CreateRuleBodySchema,
  UpdateRuleBodySchema,
  UpdatePrincipalBodySchema,
} from "./proxies.schemas";
import type {
  ProxyInfo,
  ProxyUpstream,
  ProxyRule,
  ProxyPrincipal,
  ProxyLogsResponse,
} from "./proxies.types";

export const adminProxiesContract = c.router({
  // ─── Proxy CRUD ─────────────────────────────────────────────────────────────

  list: {
    method: "GET",
    path: "/api/admin/proxies",
    responses: {
      200: c.type<ProxyInfo[]>(),
      ...commonErrorResponses,
    },
  },

  getProxy: {
    method: "GET",
    path: "/api/admin/proxies/:did",
    pathParams: ProxyDidParamSchema,
    responses: {
      200: c.type<ProxyInfo>(),
      ...commonErrorResponses,
    },
  },

  updateProxy: {
    method: "PATCH",
    path: "/api/admin/proxies/:did",
    pathParams: ProxyDidParamSchema,
    body: UpdateProxyBodySchema,
    responses: {
      200: c.type<ProxyInfo>(),
      ...commonErrorResponses,
    },
  },

  deleteProxy: {
    method: "DELETE",
    path: "/api/admin/proxies/:did",
    pathParams: ProxyDidParamSchema,
    body: c.noBody(),
    responses: {
      204: c.noBody(),
      ...commonErrorResponses,
    },
  },

  // ─── Upstreams ──────────────────────────────────────────────────────────────

  listUpstreams: {
    method: "GET",
    path: "/api/admin/proxies/:did/upstreams",
    pathParams: ProxyDidParamSchema,
    responses: {
      200: c.type<ProxyUpstream[]>(),
      ...commonErrorResponses,
    },
  },

  createUpstream: {
    method: "POST",
    path: "/api/admin/proxies/:did/upstreams",
    pathParams: ProxyDidParamSchema,
    body: CreateUpstreamBodySchema,
    responses: {
      201: c.type<ProxyUpstream>(),
      ...commonErrorResponses,
    },
  },

  updateUpstream: {
    method: "PATCH",
    path: "/api/admin/proxies/:did/upstreams/:id",
    pathParams: ProxyUpstreamParamSchema,
    body: UpdateUpstreamBodySchema,
    responses: {
      200: c.type<ProxyUpstream>(),
      ...commonErrorResponses,
    },
  },

  deleteUpstream: {
    method: "DELETE",
    path: "/api/admin/proxies/:did/upstreams/:id",
    pathParams: ProxyUpstreamParamSchema,
    body: c.noBody(),
    responses: {
      204: c.noBody(),
      ...commonErrorResponses,
    },
  },

  // ─── Rules ───────────────────────────────────────────────────────────────────

  listRules: {
    method: "GET",
    path: "/api/admin/proxies/:did/rules",
    pathParams: ProxyDidParamSchema,
    responses: {
      200: c.type<ProxyRule[]>(),
      ...commonErrorResponses,
    },
  },

  createRule: {
    method: "POST",
    path: "/api/admin/proxies/:did/rules",
    pathParams: ProxyDidParamSchema,
    body: CreateRuleBodySchema,
    responses: {
      201: c.type<ProxyRule>(),
      ...commonErrorResponses,
    },
  },

  updateRule: {
    method: "PATCH",
    path: "/api/admin/proxies/:did/rules/:id",
    pathParams: ProxyRuleParamSchema,
    body: UpdateRuleBodySchema,
    responses: {
      200: c.type<ProxyRule>(),
      ...commonErrorResponses,
    },
  },

  deleteRule: {
    method: "DELETE",
    path: "/api/admin/proxies/:did/rules/:id",
    pathParams: ProxyRuleParamSchema,
    body: c.noBody(),
    responses: {
      204: c.noBody(),
      ...commonErrorResponses,
    },
  },

  // ─── Principals ─────────────────────────────────────────────────────────────

  listPrincipals: {
    method: "GET",
    path: "/api/admin/proxies/:did/principals",
    pathParams: ProxyDidParamSchema,
    responses: {
      200: c.type<ProxyPrincipal[]>(),
      ...commonErrorResponses,
    },
  },

  updatePrincipal: {
    method: "PATCH",
    path: "/api/admin/proxies/:did/principals/:id",
    pathParams: ProxyPrincipalParamSchema,
    body: UpdatePrincipalBodySchema,
    responses: {
      200: c.type<ProxyPrincipal>(),
      ...commonErrorResponses,
    },
  },

  deletePrincipal: {
    method: "DELETE",
    path: "/api/admin/proxies/:did/principals/:id",
    pathParams: ProxyPrincipalParamSchema,
    body: c.noBody(),
    responses: {
      204: c.noBody(),
      ...commonErrorResponses,
    },
  },

  // ─── Activity log ───────────────────────────────────────────────────────────

  listLogs: {
    method: "GET",
    path: "/api/admin/proxies/:did/logs",
    pathParams: ProxyDidParamSchema,
    query: ListProxyLogsQuerySchema,
    responses: {
      200: c.type<ProxyLogsResponse>(),
      ...commonErrorResponses,
    },
  },
});

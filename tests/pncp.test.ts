import {describe,it,expect,vi,afterEach} from "vitest";
import {fetchJson,normalizeOpportunity,pageSchema,PNCPError,retryAfter} from "../src/lib/pncp";
export const fixture={numeroControlePNCP:"11222333000181-1-000001/2026",anoCompra:2026,sequencialCompra:1,numeroCompra:"1/2026",objetoCompra:"Material hospitalar",valorTotalEstimado:1000.50,modalidadeId:6,modalidadeNome:"Pregão eletrônico",situacaoCompraNome:"Divulgada no PNCP",dataPublicacaoPncp:"2026-09-14T10:00:00",orgaoEntidade:{cnpj:"11222333000181",razaoSocial:"Órgão de teste"},unidadeOrgao:{municipioNome:"Recife",ufSigla:"PE"}};
afterEach(()=>vi.useRealTimers());
describe("PNCP client",()=>{
 it("normalizes official data without inventing deadlines",()=>{const n=normalizeOpportunity(fixture);expect(n.opportunity.closesAt).toBeNull();expect(n.opportunity.estimatedValue).toBe("1000.50");expect(n.opportunity.id).toBe(fixture.numeroControlePNCP);});
 it("validates empty pages",()=>expect(pageSchema.parse({data:[],totalPaginas:0}).data).toEqual([]));
 it("rejects malformed records",()=>expect(()=>normalizeOpportunity({objetoCompra:"incomplete"})).toThrow());
 it("handles no content",async()=>expect(await fetchJson(new URL("https://pncp.gov.br"),vi.fn().mockResolvedValue(new Response(null,{status:204})))).toEqual({data:[],totalPaginas:0}));
 it("does not retry bad requests",async()=>{const fn=vi.fn().mockResolvedValue(new Response(null,{status:400}));await expect(fetchJson(new URL("https://pncp.gov.br"),fn,async()=>{})).rejects.toThrow("400");expect(fn).toHaveBeenCalledTimes(1);});
 it("retries server failure with bounded attempts",async()=>{const fn=vi.fn().mockResolvedValue(new Response(null,{status:503}));await expect(fetchJson(new URL("https://pncp.gov.br"),fn,async()=>{})).rejects.toThrow("503");expect(fn).toHaveBeenCalledTimes(3);});
 it("retries network timeouts",async()=>{const fn=vi.fn().mockRejectedValue(new DOMException("Timeout","TimeoutError"));await expect(fetchJson(new URL("https://pncp.gov.br"),fn,async()=>{})).rejects.toThrow();expect(fn).toHaveBeenCalledTimes(3);});
});

it("honors Retry-After and never retries early for long cooldowns",async()=>{
 const sleep=vi.fn().mockResolvedValue(undefined);
 const fetcher=vi.fn().mockResolvedValueOnce(new Response(null,{status:429,headers:{"Retry-After":"30"}})).mockResolvedValueOnce(Response.json({ok:true}));
 await fetchJson(new URL("https://pncp.gov.br"),fetcher,sleep);
 expect(sleep.mock.calls[0][0]).toBeGreaterThanOrEqual(29000);
 const blocked=vi.fn().mockResolvedValue(new Response(null,{status:429,headers:{"Retry-After":"3600"}}));
 await expect(fetchJson(new URL("https://pncp.gov.br"),blocked,sleep)).rejects.toBeInstanceOf(PNCPError);expect(blocked).toHaveBeenCalledTimes(1);
 expect(retryAfter("invalid")).toBeNull();expect(retryAfter("Wed, 01 Jan 2031 00:00:00 GMT",0)?.getUTCFullYear()).toBe(2031);
});

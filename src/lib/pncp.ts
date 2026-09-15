import {z} from "zod";
import {createHash} from "node:crypto";
const official=z.object({
 numeroControlePNCP:z.string().min(1),anoCompra:z.number().int(),sequencialCompra:z.number().int(),numeroCompra:z.string(),
 objetoCompra:z.string(),informacaoComplementar:z.string().nullish(),valorTotalEstimado:z.number().nonnegative().nullish(),
 modalidadeId:z.number().int(),modalidadeNome:z.string(),situacaoCompraNome:z.string(),
 modoDisputaNome:z.string().nullish(),dataPublicacaoPncp:z.string(),
 dataAberturaProposta:z.string().nullish(),dataEncerramentoProposta:z.string().nullish(),
 orgaoEntidade:z.object({cnpj:z.string().regex(/^\d{14}$/),razaoSocial:z.string(),esferaId:z.string().nullish(),poderId:z.string().nullish()}).passthrough(),
 unidadeOrgao:z.object({municipioNome:z.string(),ufSigla:z.string()}).passthrough()
}).passthrough();
export const pageSchema=z.object({data:z.array(official),totalPaginas:z.number().int().nonnegative()}).passthrough();
export const wait=(ms:number)=>new Promise(r=>setTimeout(r,ms));
export class PNCPError extends Error {
 constructor(public status:number,public retryAt?:Date){super("PNCP_HTTP_"+status);}
}
export function retryAfter(value:string|null,now=Date.now()){
 if(!value)return null;
 const milliseconds=/^\d+$/.test(value.trim())?Number(value)*1000:Date.parse(value)-now;
 return Number.isFinite(milliseconds)&&milliseconds>=0?new Date(now+milliseconds):null;
}
export async function fetchJson(url:URL,fetcher:typeof fetch=fetch,sleep=wait){
 let last:unknown;
 for(let attempt=0;attempt<3;attempt++){
 try{
 const r=await fetcher(url,{signal:AbortSignal.timeout(45000),headers:{accept:"application/json"}});
 if(r.status===204)return {data:[],totalPaginas:0};
 if(!r.ok){
 const retryAt=retryAfter(r.headers.get("retry-after"))??undefined;
 await r.body?.cancel();
 throw new PNCPError(r.status,retryAt);
 }
 return await r.json();
 }catch(e){
 if(e instanceof PNCPError&&e.status!==429&&e.status<500)throw e;
 last=e;
 if(attempt<2){
 const delay=e instanceof PNCPError&&e.retryAt?Math.max(0,e.retryAt.getTime()-Date.now()):e instanceof PNCPError&&e.status===429?30000*2**attempt:5000*2**attempt;
 // A long server cooldown belongs to a later scheduled run; never retry early.
 if(delay>60000)throw e;
 await sleep(delay);
 }
 }
 }throw last;
}
export function normalizeOpportunity(input:unknown){
 const r=official.parse(input);
 const date=(v:string|null|undefined)=>{if(!v)return null;const d=new Date(/Z$|[+-]\d{2}:\d{2}$/.test(v)?v:v+"-03:00");if(!Number.isFinite(d.getTime()))throw new Error("PNCP_INVALID_DATE");return d;};
 const contentHash=createHash("sha256").update(JSON.stringify(r)).digest("hex");
 return {agency:{id:r.orgaoEntidade.cnpj,name:r.orgaoEntidade.razaoSocial,sphere:r.orgaoEntidade.esferaId,power:r.orgaoEntidade.poderId},
 opportunity:{id:r.numeroControlePNCP,agencyId:r.orgaoEntidade.cnpj,year:r.anoCompra,sequence:r.sequencialCompra,number:r.numeroCompra,object:r.objetoCompra,description:r.informacaoComplementar??"",estimatedValue:r.valorTotalEstimado?.toFixed(2)??null,city:r.unidadeOrgao.municipioNome,state:r.unidadeOrgao.ufSigla,modality:r.modalidadeId,modalityName:r.modalidadeNome,disputeMode:r.modoDisputaNome,officialStatus:r.situacaoCompraNome,publishedAt:date(r.dataPublicacaoPncp)!,opensAt:date(r.dataAberturaProposta),closesAt:date(r.dataEncerramentoProposta),officialUrl:"https://pncp.gov.br/app/editais/"+r.orgaoEntidade.cnpj+"/"+r.anoCompra+"/"+r.sequencialCompra,contentHash,raw:JSON.parse(JSON.stringify(r))}};
}
export function publicationUrl(start:Date,end:Date,modality:number,page:number,mode:"publicacao"|"atualizacao"="publicacao"){
 const base=process.env.PNCP_BASE_URL??"https://pncp.gov.br/api/consulta";
 const u=new URL(base.replace(/\/$/,"")+"/v1/contratacoes/"+mode);
 if(u.protocol!=="https:"||u.hostname!=="pncp.gov.br")throw new Error("PNCP_BASE_URL must use official HTTPS host");
 const fmt=(d:Date)=>d.toISOString().slice(0,10).replace(/-/g,"");
 u.search=new URLSearchParams({dataInicial:fmt(start),dataFinal:fmt(end),codigoModalidadeContratacao:String(modality),pagina:String(page),tamanhoPagina:"50"}).toString();return u;
}

export async function officialModalities(){
 const rows=z.array(z.object({id:z.number().int().positive(),nome:z.string()})).parse(await fetchJson(new URL("https://pncp.gov.br/api/pncp/v1/modalidades")));
 if(!rows.length)throw new Error("PNCP_EMPTY_MODALITIES");
 return rows;
}

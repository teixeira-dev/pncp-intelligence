import {syncError} from "./sync-error";
import {z} from "zod";
import {db} from "./db";
import {fetchJson,wait,PNCPError} from "./pncp";
const itemSchema=z.object({numeroItem:z.number().int(),descricao:z.string(),quantidade:z.number().nullish(),unidadeMedida:z.string().nullish(),valorUnitarioEstimado:z.number().nullish(),orcamentoSigiloso:z.boolean().optional()}).passthrough();
const documentSchema=z.object({sequencialDocumento:z.number().int(),titulo:z.string(),tipoDocumentoNome:z.string().nullish(),statusAtivo:z.boolean().optional()}).passthrough();
export async function enrichOpportunity(id:string,options:{fetcher?:typeof fetch;sleep?:typeof wait;attempts?:number;pageBudget?:number;deadline?:number}={}){
 const sleep=options.sleep??wait;
 const o=await db.opportunity.findUniqueOrThrow({where:{id}});
 if(!/^\d{14}$/.test(o.agencyId)||!Number.isInteger(o.year)||!Number.isInteger(o.sequence))throw new Error("INVALID_OFFICIAL_REFERENCE");
 const base=`https://pncp.gov.br/api/pncp/v1/orgaos/${o.agencyId}/compras/${o.year}/${o.sequence}`;
 // Durable staging keeps confirmed pages across timeouts and scheduled executions.
 let savedBatch=await db.detailImport.findUnique({where:{opportunityId:id}});
 if(savedBatch&&(savedBatch.contentHash!==o.contentHash||Date.now()-savedBatch.createdAt.getTime()>7*86400000)){
 await db.detailImport.delete({where:{opportunityId:id}});savedBatch=null;
 }
 let batch=savedBatch??await db.detailImport.create({data:{opportunityId:id,contentHash:o.contentHash}});
 let pages=0;
 while(batch.kind!=="done"){
 if(pages>=(options.pageBudget??400)||Date.now()>=(options.deadline??Infinity))return {complete:false,items:0,documents:0,pages};
 const kind:string=batch.kind,page:number=batch.nextPage;
 if(page>200)throw new Error("PNCP_DETAIL_LIMIT");
 await sleep(2000);
 const result=await fetchJson(new URL(`${base}/${kind}?pagina=${page}&tamanhoPagina=50`),options.fetcher,sleep,options.attempts??3);
 const rows=Array.isArray(result)?result:result?.data;
 if(!Array.isArray(rows))throw new Error("PNCP_INVALID_DETAIL_PAGE");
 if(kind==="itens")z.array(itemSchema).parse(rows);else z.array(documentSchema).parse(rows);
 const finished=rows.length<50;
 batch=await db.$transaction(async tx=>{
 await tx.detailPage.upsert({where:{opportunityId_kind_page:{opportunityId:id,kind,page}},create:{opportunityId:id,kind,page,payload:rows},update:{payload:rows}});
 return tx.detailImport.update({where:{opportunityId:id},data:{kind:finished?(kind==="itens"?"arquivos":"done"):kind,nextPage:finished?1:page+1}});
 });
 pages++;
 }
 const saved=await db.detailPage.findMany({where:{opportunityId:id},orderBy:[{kind:"asc"},{page:"asc"}]});
 const items=saved.filter(p=>p.kind==="itens").flatMap(p=>z.array(itemSchema).parse(p.payload));
 const documents=saved.filter(p=>p.kind==="arquivos").flatMap(p=>z.array(documentSchema).parse(p.payload));
 await db.$transaction(async tx=>{
 const current=await tx.opportunity.findUniqueOrThrow({where:{id},select:{contentHash:true}});
 if(current.contentHash!==o.contentHash)throw new Error("PNCP_CONTENT_CHANGED_DURING_IMPORT");
 // Keep document IDs stable so queued analyses retain their references.
 for(const item of items){
 const data={description:item.descricao,quantity:item.quantidade?.toFixed(4)??null,unit:item.unidadeMedida,unitValue:item.orcamentoSigiloso?null:item.valorUnitarioEstimado?.toFixed(4)??null,raw:JSON.parse(JSON.stringify(item))};
 await tx.opportunityItem.upsert({where:{opportunityId_number:{opportunityId:id,number:item.numeroItem}},create:{opportunityId:id,number:item.numeroItem,...data},update:data});
 }
 await tx.opportunityItem.deleteMany({where:{opportunityId:id,number:{notIn:items.map(i=>i.numeroItem)}}});
 const active=documents.filter(d=>d.statusAtivo!==false);
 for(const doc of active){const officialId=String(doc.sequencialDocumento),data={title:doc.titulo,type:doc.tipoDocumentoNome,url:base+"/arquivos/"+doc.sequencialDocumento};await tx.opportunityDocument.upsert({where:{opportunityId_officialId:{opportunityId:id,officialId}},create:{opportunityId:id,officialId,...data},update:data});}
 await tx.opportunityDocument.deleteMany({where:{opportunityId:id,officialId:{notIn:active.map(d=>String(d.sequencialDocumento))}}});
 await tx.opportunity.update({where:{id},data:{detailsHash:o.contentHash,detailsSyncedAt:new Date(),detailsRetryAt:null,detailsError:null}});
 await tx.detailImport.delete({where:{opportunityId:id}});
 },{timeout:30000});
 return {complete:true,pages,items:items.length,documents:documents.filter(d=>d.statusAtivo!==false).length};
}

export type DetailProgress={imported:number;items:number;documents:number;failed:number;deferred:number;pages:number};
export async function importPendingDetails(options:{limit?:number;newest?:boolean;budgetMs?:number;onProgress?:(progress:DetailProgress)=>Promise<void>;fetcher?:typeof fetch;sleep?:typeof wait;attempts?:number}={}){
 const cooldown=await db.syncCursor.findUnique({where:{id:"PNCP_COOLDOWN"}});
 if(cooldown&&cooldown.through>new Date())return {imported:0,items:0,documents:0,failed:0,deferred:0,pages:0,pending:true,pendingCount:null};
 // Existing opportunities are included automatically; no manual click is required.
 const now=new Date(),limit=options.limit??50;
 const baseWhere={AND:[{OR:[{detailsHash:null},{NOT:{detailsHash:{equals:db.opportunity.fields.contentHash}}}]},{OR:[{detailsRetryAt:null},{detailsRetryAt:{lte:now}}]}]} as any;
 let rows=await db.opportunity.findMany({where:baseWhere,select:{id:true,discoveredAt:true},orderBy:{discoveredAt:"asc"},take:limit});
 if(options.newest){
  const requested=await db.jobRequest.findMany({where:{status:"PENDING",type:{startsWith:"ENRICH:"}},select:{type:true}});
  const requestedIds=new Set(requested.map(r=>r.type.slice(7)));
  const favoriteIds=new Set((await db.favorite.findMany({select:{opportunityId:true}})).map(f=>f.opportunityId));
  rows.sort((a,b)=>Number(requestedIds.has(b.id))-Number(requestedIds.has(a.id))||Number(favoriteIds.has(b.id))-Number(favoriteIds.has(a.id))||b.discoveredAt.getTime()-a.discoveredAt.getTime());
 }
 const until=Date.now()+(options.budgetMs??10*60000);const progress:DetailProgress={imported:0,items:0,documents:0,failed:0,deferred:0,pages:0};
 for(const row of rows){
 if(Date.now()>=until)break;
 try{const result=await enrichOpportunity(row.id,{...options,pageBudget:6,deadline:Math.min(until,Date.now()+60000)});progress.pages+=result.pages;
 if(!result.complete){progress.deferred++;await options.onProgress?.({...progress});console.info(JSON.stringify({event:"PNCP_DETAILS_CHECKPOINT",opportunityId:row.id,pages:result.pages}));continue;}
 progress.imported++;progress.items+=result.items;progress.documents+=result.documents;await db.jobRequest.updateMany({where:{type:"ENRICH:"+row.id,status:"PENDING"},data:{status:"DONE"}});console.info(JSON.stringify({event:"PNCP_DETAILS_IMPORTED",opportunityId:row.id,...result}));}
 catch(error){
 progress.failed++;
 const transient=error instanceof PNCPError&&[429,502,503,504].includes(error.status??0);
 const retryAt=error instanceof PNCPError&&error.retryAt?error.retryAt:new Date(Date.now()+(transient?15:30)*60000);
 await db.opportunity.update({where:{id:row.id},data:{detailsRetryAt:retryAt,detailsError:syncError(error).kind}});
 console.error(JSON.stringify({event:"PNCP_DETAILS_FAILED",opportunityId:row.id,error:syncError(error)}));
 if(transient||error instanceof PNCPError&&error.retryAt){
  await db.syncCursor.upsert({where:{id:"PNCP_COOLDOWN"},create:{id:"PNCP_COOLDOWN",through:retryAt},update:{through:retryAt}});
  console.warn(JSON.stringify({event:"PNCP_DETAILS_COOLDOWN",status:error instanceof PNCPError?error.status:null,retryAt:retryAt.toISOString()}));
  await options.onProgress?.({...progress});break;
 }
 }
 await options.onProgress?.({...progress});
 }
 const all=await db.opportunity.findMany({select:{detailsHash:true,contentHash:true}});
 const pendingCount=all.reduce((n,o)=>n+(o.detailsHash===null||o.detailsHash!==o.contentHash?1:0),0);
 return {...progress,pending:pendingCount>0,pendingCount};
}

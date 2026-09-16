import {syncError} from "./sync-error";
import {z} from "zod";
import {db} from "./db";
import {fetchJson,wait,PNCPError} from "./pncp";
const itemSchema=z.object({numeroItem:z.number().int(),descricao:z.string(),quantidade:z.number().nullish(),unidadeMedida:z.string().nullish(),valorUnitarioEstimado:z.number().nullish(),orcamentoSigiloso:z.boolean().optional()}).passthrough();
const documentSchema=z.object({sequencialDocumento:z.number().int(),titulo:z.string(),tipoDocumentoNome:z.string().nullish(),statusAtivo:z.boolean().optional()}).passthrough();
export async function enrichOpportunity(id:string,options:{fetcher?:typeof fetch;sleep?:typeof wait;attempts?:number}={}){
 const sleep=options.sleep??wait;
 const o=await db.opportunity.findUniqueOrThrow({where:{id}});
 if(!/^\d{14}$/.test(o.agencyId)||!Number.isInteger(o.year)||!Number.isInteger(o.sequence))throw new Error("INVALID_OFFICIAL_REFERENCE");
 const base=`https://pncp.gov.br/api/pncp/v1/orgaos/${o.agencyId}/compras/${o.year}/${o.sequence}`;
 // Stage all bounded pages before replacing data; a partial failure preserves previous data.
 const items:z.infer<typeof itemSchema>[]=[],documents:z.infer<typeof documentSchema>[]=[];
 for(const kind of ["itens","arquivos"] as const){
 for(let page=1;page<=200;page++){
 await sleep(2000);
 const result=await fetchJson(new URL(`${base}/${kind}?pagina=${page}&tamanhoPagina=50`),options.fetcher,sleep,options.attempts??3);
 const rows=Array.isArray(result)?result:result?.data;
 if(!Array.isArray(rows))throw new Error("PNCP_INVALID_DETAIL_PAGE");
 if(kind==="itens")items.push(...z.array(itemSchema).parse(rows));else documents.push(...z.array(documentSchema).parse(rows));
 if(rows.length<50)break;
 if(page===200)throw new Error("PNCP_DETAIL_LIMIT");

 }
 }
 await db.$transaction(async tx=>{
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
 },{timeout:30000});
 return {items:items.length,documents:documents.filter(d=>d.statusAtivo!==false).length};
}

export type DetailProgress={imported:number;items:number;documents:number;failed:number};
export async function importPendingDetails(options:{limit?:number;newest?:boolean;budgetMs?:number;onProgress?:(progress:DetailProgress)=>Promise<void>;fetcher?:typeof fetch;sleep?:typeof wait;attempts?:number}={}){
 const cooldown=await db.syncCursor.findUnique({where:{id:"PNCP_COOLDOWN"}});
 if(cooldown&&cooldown.through>new Date())return {imported:0,items:0,documents:0,failed:0,pending:true,pendingCount:null};
 // Existing opportunities are included automatically; no manual click is required.
 const rows=await db.$queryRaw<{id:string}[]>`SELECT id FROM "Opportunity" WHERE ("detailsHash" IS NULL OR "detailsHash" <> "contentHash") AND ("detailsRetryAt" IS NULL OR "detailsRetryAt" <= NOW()) ORDER BY CASE WHEN ${options.newest??false} THEN EXISTS(SELECT 1 FROM "JobRequest" j WHERE j.type='ENRICH:' || "Opportunity".id AND j.status='PENDING') END DESC, CASE WHEN ${options.newest??false} THEN EXISTS(SELECT 1 FROM "Favorite" f WHERE f."opportunityId"="Opportunity".id) END DESC, CASE WHEN ${options.newest??false} THEN "discoveredAt" END DESC, "discoveredAt" ASC, id ASC LIMIT ${options.limit??50}`;
 const until=Date.now()+(options.budgetMs??10*60000);const progress:DetailProgress={imported:0,items:0,documents:0,failed:0};
 for(const row of rows){
 if(Date.now()>=until)break;
 try{const result=await enrichOpportunity(row.id,options);progress.imported++;progress.items+=result.items;progress.documents+=result.documents;await db.jobRequest.updateMany({where:{type:"ENRICH:"+row.id,status:"PENDING"},data:{status:"DONE"}});console.info(JSON.stringify({event:"PNCP_DETAILS_IMPORTED",opportunityId:row.id,...result}));}
 catch(error){
 progress.failed++;
 const retryAt=error instanceof PNCPError&&error.retryAt?error.retryAt:new Date(Date.now()+30*60000);
 await db.opportunity.update({where:{id:row.id},data:{detailsRetryAt:retryAt,detailsError:syncError(error).kind}});
 console.error(JSON.stringify({event:"PNCP_DETAILS_FAILED",opportunityId:row.id,error:syncError(error)}));
 if(error instanceof PNCPError&&(error.status===429||error.retryAt)){await db.syncCursor.upsert({where:{id:"PNCP_COOLDOWN"},create:{id:"PNCP_COOLDOWN",through:retryAt},update:{through:retryAt}});await options.onProgress?.({...progress});break;}
 }
 await options.onProgress?.({...progress});
 }
 const pending=await db.$queryRaw<{count:number}[]>`SELECT COUNT(*)::int AS count FROM "Opportunity" WHERE "detailsHash" IS NULL OR "detailsHash" <> "contentHash"`;
 return {...progress,pending:pending[0].count>0,pendingCount:pending[0].count};
}

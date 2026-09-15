import {db} from "./db";
import {fetchJson,normalizeOpportunity,officialModalities,pageSchema,PNCPError,publicationUrl,wait} from "./pncp";
import {syncError} from "./sync-error";
type Counters={received:number;created:number;updated:number;unchanged:number};
const day=86400000;
export async function collectPartitions(jobId:string,counters:Counters,options:{fetcher?:typeof fetch;sleep?:typeof wait;now?:Date;pageBudget?:number;perModality?:number;budgetMs?:number}={}){
 const sleep=options.sleep??wait,now=options.now??new Date(),deadline=Date.now()+(options.budgetMs??20*60000);
 const cooldown=await db.syncCursor.findUnique({where:{id:"PNCP_COOLDOWN"}});
 if(cooldown&&cooldown.through>now)return {complete:false};
 let partitions=await db.syncPartition.findMany({orderBy:{updatedAt:"asc"}});
 const catalog=await db.syncCursor.findUnique({where:{id:"PNCP_MODALITIES"}});
 if(!partitions.length||!catalog||now.getTime()-catalog.through.getTime()>7*day){
 try{
 const modes=options.fetcher?await fetchJson(new URL("https://pncp.gov.br/api/pncp/v1/modalidades"),options.fetcher,sleep):await officialModalities();
 // Validate the catalog even when an injected transport is used by integration tests.
 const {z}=await import("zod");
 const parsed=z.array(z.object({id:z.number().int().positive(),nome:z.string()})).min(1).parse(modes);
 for(const m of parsed)await db.syncPartition.upsert({where:{modality:m.id},create:{modality:m.id},update:{}});
 await db.syncCursor.upsert({where:{id:"PNCP_MODALITIES"},create:{id:"PNCP_MODALITIES",through:now},update:{through:now}});
 partitions=await db.syncPartition.findMany({orderBy:{updatedAt:"asc"}});
 }catch(error){
 if(error instanceof PNCPError&&(error.status===429||error.retryAt)){
 const until=error.retryAt??new Date(now.getTime()+15*60000);
 await db.syncCursor.upsert({where:{id:"PNCP_COOLDOWN"},create:{id:"PNCP_COOLDOWN",through:until},update:{through:until}});
 throw error;
 }
 if(!partitions.length)throw error;
 console.warn(JSON.stringify({event:"PNCP_CATALOG_CACHED",error:syncError(error)}));
 }
 }
 let complete=true,pages=0;
 const days=Math.max(1,Math.min(30,Number(process.env.PNCP_INITIAL_DAYS)||7));
 for(let partition of partitions){
 if(pages>=(options.pageBudget??100)||Date.now()>=deadline){complete=false;break;}
 if(partition.retryAt&&partition.retryAt>now){complete=false;continue;}
 if(!partition.windowStart||!partition.windowEnd){
 const start=partition.through?new Date(partition.through.getTime()-2*day):new Date(now.getTime()-days*day);
 const end=new Date(Math.min(now.getTime(),start.getTime()+6*day));
 partition=await db.syncPartition.update({where:{modality:partition.modality},data:{windowStart:start,windowEnd:end,nextPage:1,retryAt:null}});
 }
 const start=partition.windowStart!,end=partition.windowEnd!;
 let done=false;
 for(let local=0;local<(options.perModality??10);local++){
 if(pages>=(options.pageBudget??100)||Date.now()>=deadline)break;
 const page=partition.nextPage,modality=partition.modality;
 try{
 await sleep(2000);
 const parsed=pageSchema.parse(await fetchJson(publicationUrl(start,end,modality,page,"atualizacao"),options.fetcher,sleep));
 done=page>=parsed.totalPaginas||parsed.data.length===0;
 const delta: Counters={received:0,created:0,updated:0,unchanged:0};
 // Page records and its checkpoint commit together. A rollback never skips records.
 await db.$transaction(async tx=>{
 for(const raw of parsed.data){
 const n=normalizeOpportunity(raw);
 await tx.contractingAgency.upsert({where:{id:n.agency.id},create:n.agency,update:n.agency});
 const existing=await tx.opportunity.findUnique({where:{id:n.opportunity.id},select:{contentHash:true}});
 delta.received++;
 if(existing?.contentHash===n.opportunity.contentHash){delta.unchanged++;continue;}
 await tx.opportunity.upsert({where:{id:n.opportunity.id},create:n.opportunity,update:n.opportunity});
 if(existing)delta.updated++;else delta.created++;
 }
 await tx.syncPartition.update({where:{modality},data:done?{through:end,windowStart:null,windowEnd:null,nextPage:1,retryAt:null}:{nextPage:page+1,retryAt:null}});
 await tx.syncJob.update({where:{id:jobId},data:{received:{increment:delta.received},created:{increment:delta.created},updated:{increment:delta.updated},unchanged:{increment:delta.unchanged}}});
 },{timeout:30000});
 for(const k of Object.keys(delta) as (keyof Counters)[])counters[k]+=delta[k];
 pages++;partition.nextPage=page+1;
 console.info(JSON.stringify({event:"PNCP_PAGE_IMPORTED",jobId,modality,page,...counters}));
 if(done)break;
 }catch(error){
 complete=false;
 const retryAt=error instanceof PNCPError&&error.retryAt?error.retryAt:new Date(now.getTime()+(error instanceof PNCPError&&error.status===422?60:15)*60000);
 await db.syncPartition.update({where:{modality},data:{retryAt}});
 // Public query context helps diagnose 422 without silently treating it as an empty page.
 const detail=JSON.stringify({modality,page,start:start.toISOString(),end:end.toISOString(),error:syncError(error)});
 await db.syncLog.create({data:{jobId,event:"PNCP_PARTITION_FAILED",detail}});
 console.error(JSON.stringify({event:"PNCP_PARTITION_FAILED",jobId,detail}));
 if(error instanceof PNCPError&&(error.status===429||error.retryAt)){
 await db.syncCursor.upsert({where:{id:"PNCP_COOLDOWN"},create:{id:"PNCP_COOLDOWN",through:retryAt},update:{through:retryAt}});
 return {complete:false};
 }
 break;
 }
 }
 if(!done||end<now)complete=false;
 }
 return {complete};
}

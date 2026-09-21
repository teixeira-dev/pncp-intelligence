import {collectPartitions} from "./sync-collector";
import {createClient} from "@libsql/client";
import {randomUUID} from "crypto";
import {syncError} from "./sync-error";
import {Prisma} from "@prisma/client";
const stringArray=(v:Prisma.JsonValue|null):string[]=>Array.isArray(v)?v.filter((x):x is string=>typeof x==="string"):[];
import {db} from "./db";
import {writeOpportunity} from "./opportunity-write";
import {matchOpportunity,normalize} from "./matching";
import {analyzeDocument} from "./documents";
import {importPendingDetails} from "./enrichment";
import {sendMail} from "./mail";
export async function upsertOpportunity(raw:unknown){
 return db.$transaction(tx=>writeOpportunity(tx,raw));
}

export async function refreshCompany(companyId:string,since?:Date){
 const company=await db.company.findUniqueOrThrow({where:{id:companyId}});
 let cursor:string|undefined;
 do{
 const rows=await db.opportunity.findMany({where:since?{updatedAt:{gte:since}}:{},take:100,orderBy:{id:"asc"},...(cursor?{cursor:{id:cursor},skip:1}:{}),include:{items:{select:{description:true}}}});
 if(!rows.length)break;
 for(const o of rows){const result=matchOpportunity({...company,keywords:stringArray(company.keywords),excludedTerms:stringArray(company.excludedTerms),regions:stringArray(company.regions),modalities:Array.isArray(company.modalities)?company.modalities.filter((x):x is number=>typeof x==="number"):[]},o);await db.opportunityMatch.upsert({where:{companyId_opportunityId:{companyId,opportunityId:o.id}},create:{companyId,opportunityId:o.id,...result},update:result});}
 cursor=rows.at(-1)!.id;
 }while(cursor);
}
export async function processAlerts(){
 const alerts=await db.alert.findMany({where:{active:true,user:{active:true}},include:{user:{select:{email:true}}}});
 for(const a of alerts){
 const where:Prisma.OpportunityWhereInput={
 ...(a.state?{state:a.state}:{}),...(a.city?{city:{contains:a.city}}:{}),...(a.agency?{agency:{name:{contains:a.agency}}}:{}),
 ...(a.modality?{modality:a.modality}:{}),
 ...(a.minValue!==null||a.maxValue!==null?{estimatedValue:{...(a.minValue!==null?{gte:a.minValue}:{}),...(a.maxValue!==null?{lte:a.maxValue}:{})}}:{}),
 ...(a.companyId?{matches:{some:{companyId:a.companyId,score:{gte:a.minScore}}}}:{}),
 discoveredAt:{gte:a.createdAt}
 };
 let cursor:string|undefined;
 while(true){
 const rows=await db.opportunity.findMany({where,take:100,orderBy:{id:"asc"},...(cursor?{cursor:{id:cursor},skip:1}:{})});
 if(!rows.length)break;
 for(const o of rows){
 const keywords=stringArray(a.keywords); if(keywords.length&&!keywords.some((t:string)=>normalize(o.object+" "+o.description).includes(normalize(t))))continue;
 await db.notification.upsert({where:{alertId_opportunityId:{alertId:a.id,opportunityId:o.id}},create:{userId:a.userId,alertId:a.id,opportunityId:o.id,title:a.name+": "+o.object.slice(0,150)},update:{}});
 }
 cursor=rows.at(-1)!.id;
 }
 }
 // In-app notification creation is idempotent. SMTP delivery is at-least-once.
 const mail=await db.notification.findMany({where:{emailedAt:null,alert:{email:true},user:{active:true}},take:100,include:{user:true}});
 if(process.env.SMTP_HOST)for(const n of mail){try{await sendMail(n.user.email,"PNCP Intelligence — nova oportunidade",n.title+"\n"+process.env.APP_URL+"/oportunidades/"+encodeURIComponent(n.opportunityId),n.id);await db.notification.update({where:{id:n.id},data:{emailedAt:new Date()}});}catch{console.error(JSON.stringify({event:"EMAIL_FAILED",notificationId:n.id}));}}
}
async function withSyncLock<T>(work:()=>Promise<T>){
 const url=process.env.TURSO_DATABASE_URL,authToken=process.env.TURSO_AUTH_TOKEN;
 if(!url||!authToken)throw new Error("Turso não configurado para sync.");
 const client=createClient({url,authToken}); const owner=randomUUID(); const now=Date.now(),expires=now+20*60_000;
 await client.execute(`CREATE TABLE IF NOT EXISTS SyncLock (id TEXT PRIMARY KEY, owner TEXT NOT NULL, expiresAt INTEGER NOT NULL)`);
 const acquired=await client.execute({sql:`INSERT INTO SyncLock(id,owner,expiresAt) VALUES('pncp-sync',?,?)
 ON CONFLICT(id) DO UPDATE SET owner=excluded.owner,expiresAt=excluded.expiresAt WHERE SyncLock.expiresAt < ?`,args:[owner,expires,now]});
 if(acquired.rowsAffected===0){console.info(JSON.stringify({event:"PNCP_SYNC_SKIPPED_LOCKED"}));return;}
 try{return await work();}finally{await client.execute({sql:"DELETE FROM SyncLock WHERE id='pncp-sync' AND owner=?",args:[owner]}).catch(()=>{});client.close();}
}
export async function runSync(){
 await withSyncLock(async ()=>{
 await db.syncJob.updateMany({where:{status:"RUNNING"},data:{status:"FAILED",finishedAt:new Date(),error:"Processo anterior interrompido."}});
 const pending=await db.jobRequest.findMany({where:{status:"PENDING"},take:100,orderBy:{createdAt:"asc"}});
 for(const request of pending.filter(r=>r.type.startsWith("DOCUMENT:"))){
 const [,userId,documentId]=request.type.split(":");
 try{await analyzeDocument(userId,documentId);await db.jobRequest.update({where:{id:request.id},data:{status:"DONE"}});await db.auditLog.create({data:{userId,event:"DOCUMENT_ANALYZED",entityId:documentId}});}
 catch{await db.jobRequest.update({where:{id:request.id},data:{status:"FAILED"}});await db.auditLog.create({data:{userId,event:"DOCUMENT_ANALYSIS_FAILED",entityId:documentId}}).catch(()=>{});console.error(JSON.stringify({event:"DOCUMENT_ANALYSIS_FAILED",jobId:request.id}));}
 }
 // Profile changes should still be processed when PNCP is down.
 if(pending.some(r=>r.type==="MATCH")){
 for(const c of await db.company.findMany({select:{id:true}}))await refreshCompany(c.id);
 await db.jobRequest.updateMany({where:{id:{in:pending.filter(r=>r.type==="MATCH").map(r=>r.id)}},data:{status:"DONE"}});
 }
 const job=await db.syncJob.create({data:{detailsCompleted:0,itemsImported:0,documentsImported:0,detailsFailed:0,detailsDeferred:0,detailPages:0}});console.info(JSON.stringify({event:"PNCP_SYNC_STARTED",jobId:job.id}));const counters={received:0,created:0,updated:0,unchanged:0};
 try{
 let outcome={complete:false};
 try{outcome=await collectPartitions(job.id,counters,{pageBudget:25,perModality:3,budgetMs:2*60000,attempts:1,minRefreshMs:3600000});}
 catch(error){console.error(JSON.stringify({event:"PNCP_DISCOVERY_DEFERRED",jobId:job.id,error:syncError(error)}));await db.syncLog.create({data:{jobId:job.id,event:"PNCP_DISCOVERY_DEFERRED",detail:error instanceof Error?error.message.slice(0,400):"Discovery failed"}});}
 // Every fourth quarter-hour gives older records a turn to prevent starvation.
 const prioritize=Math.floor(Date.now()/900000)%4!==0;
 const details=await importPendingDetails({limit:150,newest:prioritize,budgetMs:8*60000,attempts:1,onProgress:async p=>{await db.syncJob.update({where:{id:job.id},data:{detailsCompleted:p.imported,itemsImported:p.items,documentsImported:p.documents,detailsFailed:p.failed,detailsDeferred:p.deferred,detailPages:p.pages}});}});
 console.info(JSON.stringify({event:"PNCP_DETAILS_BATCH",...details,prioritized:prioritize}));
 outcome.complete=outcome.complete&&!details.pending;
 if(counters.created||counters.updated||details.imported){
 for(const c of await db.company.findMany({select:{id:true}}))await refreshCompany(c.id,job.startedAt);
 await processAlerts();
 }
 if(outcome.complete)await db.jobRequest.updateMany({where:{id:{in:pending.filter(r=>r.type==="SYNC").map(r=>r.id)}},data:{status:"DONE"}});
 const sourceFailures=await db.syncLog.count({where:{jobId:job.id,event:{in:["PNCP_PARTITION_FAILED","PNCP_DISCOVERY_DEFERRED"]}}});
 await db.syncJob.update({where:{id:job.id},data:{status:outcome.complete?"SUCCESS":"PARTIAL",finishedAt:new Date(),error:details.failed||sourceFailures?`${sourceFailures} falhas nas consultas de licitações; ${details.failed} falhas nos detalhes. Nova tentativa agendada.`:null,pendingDetails:details.pendingCount,...counters}});
 }catch(e){
 const message=e instanceof Error?e.message.slice(0,400):"Unknown error";
 await db.syncJob.update({where:{id:job.id},data:{status:"FAILED",finishedAt:new Date(),error:message,...counters}});
 await db.syncLog.create({data:{jobId:job.id,event:"PNCP_SYNC_FAILED",detail:message}});
 console.error(JSON.stringify({event:"PNCP_SYNC_FAILED",jobId:job.id,...counters,error:syncError(e)}));throw e;
 }
 });
}

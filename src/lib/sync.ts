import {collectPartitions} from "./sync-collector";
import {syncError} from "./sync-error";
import {Prisma} from "@prisma/client";
import {db} from "./db";
import {normalizeOpportunity} from "./pncp";
import {matchOpportunity,normalize} from "./matching";
import {analyzeDocument} from "./documents";
import {enrichOpportunity} from "./enrichment";
import {sendMail} from "./mail";
export async function upsertOpportunity(raw:unknown){
 const n=normalizeOpportunity(raw);
 return db.$transaction(async tx=>{
 await tx.contractingAgency.upsert({where:{id:n.agency.id},create:n.agency,update:n.agency});
 const old=await tx.opportunity.findUnique({where:{id:n.opportunity.id},select:{contentHash:true}});
 if(old?.contentHash===n.opportunity.contentHash)return "unchanged" as const;
 await tx.opportunity.upsert({where:{id:n.opportunity.id},create:n.opportunity,update:n.opportunity});
 return old?"updated" as const:"created" as const;
 });
}
export async function refreshCompany(companyId:string){
 const company=await db.company.findUniqueOrThrow({where:{id:companyId}});
 let cursor:string|undefined;
 do{
 const rows=await db.opportunity.findMany({take:100,orderBy:{id:"asc"},...(cursor?{cursor:{id:cursor},skip:1}:{}),include:{items:{select:{description:true}}}});
 if(!rows.length)break;
 for(const o of rows){const result=matchOpportunity(company,o);await db.opportunityMatch.upsert({where:{companyId_opportunityId:{companyId,opportunityId:o.id}},create:{companyId,opportunityId:o.id,...result},update:result});}
 cursor=rows.at(-1)!.id;
 }while(cursor);
}
export async function processAlerts(){
 const alerts=await db.alert.findMany({where:{active:true,user:{active:true}},include:{user:{select:{email:true}}}});
 for(const a of alerts){
 const where:Prisma.OpportunityWhereInput={
 ...(a.state?{state:a.state}:{}),...(a.city?{city:{contains:a.city,mode:"insensitive"}}:{}),...(a.agency?{agency:{name:{contains:a.agency,mode:"insensitive"}}}:{}),
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
 if(a.keywords.length&&!a.keywords.some(t=>normalize(o.object+" "+o.description).includes(normalize(t))))continue;
 await db.notification.upsert({where:{alertId_opportunityId:{alertId:a.id,opportunityId:o.id}},create:{userId:a.userId,alertId:a.id,opportunityId:o.id,title:a.name+": "+o.object.slice(0,150)},update:{}});
 }
 cursor=rows.at(-1)!.id;
 }
 }
 // In-app notification creation is idempotent. SMTP delivery is at-least-once.
 const mail=await db.notification.findMany({where:{emailedAt:null,alert:{email:true},user:{active:true}},take:100,include:{user:true}});
 if(process.env.SMTP_HOST)for(const n of mail){try{await sendMail(n.user.email,"PNCP Intelligence — nova oportunidade",n.title+"\n"+process.env.APP_URL+"/oportunidades/"+encodeURIComponent(n.opportunityId),n.id);await db.notification.update({where:{id:n.id},data:{emailedAt:new Date()}});}catch{console.error(JSON.stringify({event:"EMAIL_FAILED",notificationId:n.id}));}}
}
export async function runSync(){
 // Transaction advisory lock reserves one connection, while work uses other pool connections.
 await db.$transaction(async lock=>{
 const result=await lock.$queryRaw<{locked:boolean}[]>`SELECT pg_try_advisory_xact_lock(70421016) AS locked`;
 if(!result[0].locked)return;
 await db.syncJob.updateMany({where:{status:"RUNNING",startedAt:{lt:new Date(Date.now()-3600000)}},data:{status:"FAILED",finishedAt:new Date(),error:"Processo anterior interrompido."}});
 const pending=await db.jobRequest.findMany({where:{status:"PENDING"},take:100,orderBy:{createdAt:"asc"}});
 for(const request of pending.filter(r=>r.type.startsWith("ENRICH:"))){
 try{await enrichOpportunity(request.type.slice(7));await db.jobRequest.update({where:{id:request.id},data:{status:"DONE"}});}
 catch{await db.jobRequest.update({where:{id:request.id},data:{status:"FAILED"}});console.error(JSON.stringify({event:"ENRICH_FAILED",jobId:request.id}));}
 }
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
 const job=await db.syncJob.create({data:{}});console.info(JSON.stringify({event:"PNCP_SYNC_STARTED",jobId:job.id}));const counters={received:0,created:0,updated:0,unchanged:0};
 try{
 const outcome=await collectPartitions(job.id,counters);
 for(const c of await db.company.findMany({select:{id:true}}))await refreshCompany(c.id);
 await processAlerts();
 if(outcome.complete)await db.jobRequest.updateMany({where:{id:{in:pending.filter(r=>r.type==="SYNC").map(r=>r.id)}},data:{status:"DONE"}});
 await db.syncJob.update({where:{id:job.id},data:{status:outcome.complete?"SUCCESS":"PARTIAL",finishedAt:new Date(),error:outcome.complete?null:"Coleta parcial; progresso salvo para a próxima execução.",...counters}});
 }catch(e){
 const message=e instanceof Error?e.message.slice(0,400):"Unknown error";
 await db.syncJob.update({where:{id:job.id},data:{status:"FAILED",finishedAt:new Date(),error:message,...counters}});
 await db.syncLog.create({data:{jobId:job.id,event:"PNCP_SYNC_FAILED",detail:message}});
 console.error(JSON.stringify({event:"PNCP_SYNC_FAILED",jobId:job.id,...counters,error:syncError(e)}));throw e;
 }
 },{timeout:3300000,maxWait:5000});
}

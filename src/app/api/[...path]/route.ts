import {opportunityRoute} from "@/lib/opportunity-route";
import {NextResponse} from "next/server";
import {z,ZodError} from "zod";
import {Prisma} from "@prisma/client";
import {randomBytes,timingSafeEqual} from "node:crypto";
import {compare} from "bcryptjs";
import {db} from "@/lib/db";
import {audit,digest,HttpError,login,logout,passwordHash,rateLimit,requireAdmin,requireUser,verifyOrigin} from "@/lib/auth";
import {alertInput,companyInput,credentials,password} from "@/lib/validation";
import {searchOpportunities} from "@/lib/search";
import {analyze} from "@/lib/ai";
import {report,csvCell} from "@/lib/reports";
import {sendMail} from "@/lib/mail";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const reply=(value:unknown,status=200)=>NextResponse.json(value,{status,headers:{"Cache-Control":"no-store"}});
async function body(req:Request){if(Number(req.headers.get("content-length")??0)>50000)throw new HttpError(413,"Pedido muito grande.");const text=await req.text();if(text.length>50000)throw new HttpError(413,"Pedido muito grande.");try{return JSON.parse(text);}catch{throw new HttpError(400,"JSON inválido.");}}
async function handler(req:Request,context:{params:Promise<{path:string[]}>}){
 try{
 const {path}=await context.params;const [resource]=path;const {id,action}=resource==="opportunities"?opportunityRoute(path.slice(1)):{id:path[1],action:path[2]};const method=req.method;
 if(method!=="GET")verifyOrigin(req);
 if(resource==="auth"){
 if(method!=="POST")throw new HttpError(405,"Método não permitido.");
 const b=await body(req);
 if(id==="bootstrap"){
 const parsed=z.object({token:z.string().regex(/^[a-f0-9]{64}$/),name:z.string().min(2).max(150),email:z.string().email().max(254).transform(v=>v.toLowerCase()),password}).strict().parse(b);
 const expected=process.env.SETUP_TOKEN_HASH;
 if(!expected||!/^[a-f0-9]{64}$/.test(expected)||!timingSafeEqual(Buffer.from(digest(parsed.token),"hex"),Buffer.from(expected,"hex")))throw new HttpError(403,"Convite de configuração inválido.");
 await rateLimit("bootstrap",5,60);
 const hashed=await passwordHash(parsed.password);
 await db.$transaction(async tx=>{
 await tx.$executeRaw`SELECT pg_advisory_xact_lock(70421017)`;
 if(await tx.user.count())throw new HttpError(409,"A configuração inicial já foi concluída.");
 await tx.user.create({data:{name:parsed.name,email:parsed.email,passwordHash:hashed,role:"ADMIN",memberships:{create:{organization:{create:{name:parsed.name}}}}}});
 });return reply({ok:true});
 }
 if(id==="register"){
 const parsed=z.object({name:z.string().trim().min(2).max(150),email:z.string().trim().email().max(254).transform(v=>v.toLowerCase()),password,confirmPassword:z.string()}).strict().refine(v=>v.password===v.confirmPassword,{message:"As senhas não coincidem.",path:["confirmPassword"]}).parse(b);
 await rateLimit("register:global",100,60);
 await rateLimit("register:"+parsed.email,5,60);
 const hashed=await passwordHash(parsed.password);
 await db.$transaction(async tx=>{
 await tx.$executeRaw`SELECT pg_advisory_xact_lock(70421017)`;
 if(!await tx.user.findFirst({where:{role:"ADMIN"}}))throw new HttpError(503,"O cadastro estará disponível após a configuração inicial do sistema.");
 if(await tx.user.findUnique({where:{email:parsed.email}}))return;
 await tx.user.create({data:{name:parsed.name,email:parsed.email,passwordHash:hashed,role:"USER",memberships:{create:{organization:{create:{name:parsed.name}}}},audits:{create:{event:"ACCOUNT_CREATED"}}}});
 });
 return reply({message:"Solicitação concluída. Entre com seu e-mail e senha. Se você já tinha uma conta, use sua senha anterior ou recupere o acesso."},201);
 }
 if(id==="login"){const c=credentials.parse(b);await login(c.email,c.password);return reply({ok:true});}
 if(id==="logout"){await logout();return reply({ok:true});}
 if(id==="recover"){
 const email=z.string().email().max(254).parse(b.email).toLowerCase();
 await rateLimit("recover:"+email,3,30);
 const user=await db.user.findUnique({where:{email}});
 if(user?.active&&process.env.SMTP_HOST){
 const token=randomBytes(32).toString("hex");
 await db.passwordReset.create({data:{id:digest(token),userId:user.id,expiresAt:new Date(Date.now()+1800000)}});
 try{await sendMail(email,"Recuperação de senha — PNCP Intelligence",process.env.APP_URL+"/redefinir-senha#"+token);}catch{console.error(JSON.stringify({event:"RESET_EMAIL_FAILED"}));}
 }
 return reply({message:"Se houver uma conta elegível, enviaremos as instruções por e-mail."});
 }
 if(id==="reset"){
 const parsed=z.object({token:z.string().regex(/^[a-f0-9]{64}$/),password}).parse(b);
 const hashed=await passwordHash(parsed.password);
 await db.$transaction(async tx=>{
 const reset=await tx.passwordReset.findUnique({where:{id:digest(parsed.token)}});
 if(!reset||reset.expiresAt<new Date())throw new HttpError(400,"Link inválido ou expirado.");
 const deleted=await tx.passwordReset.deleteMany({where:{id:reset.id}});
 if(deleted.count!==1)throw new HttpError(400,"Link já utilizado.");
 await tx.user.update({where:{id:reset.userId},data:{passwordHash:hashed}});
 await tx.session.deleteMany({where:{userId:reset.userId}});
 await tx.passwordReset.deleteMany({where:{userId:reset.userId}});
 });return reply({ok:true});
 }
 throw new HttpError(404,"Rota não encontrada.");
 }
 const user=await requireUser(),userId=user.id;
 const orgs=user.memberships.map(m=>m.organizationId);
 if(method!=="GET")await rateLimit("write:"+userId,120,1);
 if(resource==="me"){
 if(method==="GET")return reply({id:userId,name:user.name,email:user.email,role:user.role,aiAvailable:!!process.env.AI_API_KEY&&!!process.env.AI_MODEL&&process.env.AI_PROVIDER==="openai",mailAvailable:!!process.env.SMTP_HOST});
 if(method==="PATCH"){
 const b=z.object({currentPassword:z.string().max(72),password}).strict().parse(await body(req));
 await rateLimit("password:"+userId,5,15);
 if(!await compare(b.currentPassword,user.passwordHash))throw new HttpError(400,"Senha atual inválida.");
 await db.$transaction([db.user.update({where:{id:userId},data:{passwordHash:await passwordHash(b.password)}}),db.session.deleteMany({where:{userId}})]);return reply({ok:true});
 }
 }
 if(resource==="companies"){
 if(method==="GET")return reply(await db.company.findMany({where:{organizationId:{in:orgs},...(id?{id}:{})},orderBy:{createdAt:"desc"}}));
 if(id){const own=await db.company.findFirst({where:{id,organizationId:{in:orgs}}});if(!own)throw new HttpError(404,"Empresa não encontrada.");}
 if(method==="POST"||method==="PATCH"){
 const data=companyInput.parse(await body(req));if(!orgs[0])throw new HttpError(409,"Usuário sem organização.");
 const company=id?await db.company.update({where:{id},data}):await db.company.create({data:{...data,organizationId:orgs[0]}});
 // Invalidate stale scores; scheduled worker recalculates after profile changes.
 await db.opportunityMatch.deleteMany({where:{companyId:company.id}});
 await db.jobRequest.create({data:{type:"MATCH"}});
 await audit(userId,"COMPANY_UPDATED",company.id);return reply(company);
 }
 if(method==="DELETE"&&id){await db.company.delete({where:{id}});await audit(userId,"COMPANY_DELETED",id);return reply({ok:true});}
 }
 if(resource==="opportunity-filters"&&method==="GET"){
 const modalities=await db.opportunity.findMany({distinct:["modality"],select:{modality:true,modalityName:true},orderBy:{modality:"asc"}});
 return reply({modalities});
 }
 if(resource==="opportunities"){
 if(method==="GET"&&!id)return reply(await searchOpportunities(userId,new URL(req.url).searchParams));
 if(method==="GET"&&id&&action==="items"){
 const page=z.coerce.number().int().min(1).max(10000).parse(new URL(req.url).searchParams.get("page")??1);
 const [items,total]=await Promise.all([db.opportunityItem.findMany({where:{opportunityId:id},orderBy:{number:"asc"},take:50,skip:(page-1)*50}),db.opportunityItem.count({where:{opportunityId:id}})]);
 return reply({items,total,page,pages:Math.ceil(total/50)});
 }
 if(method==="GET"&&id){
 const o=await db.opportunity.findUnique({where:{id},include:{agency:true,items:{take:100,orderBy:{number:"asc"}},documents:true,favorites:{where:{userId}},tracking:{where:{userId}},matches:{where:{company:{organizationId:{in:orgs}}},include:{company:{select:{legalName:true}}}},analyses:{where:{userId},orderBy:{createdAt:"desc"},take:5}}});
 if(!o)throw new HttpError(404,"Oportunidade não encontrada.");return reply(o);
 }
 if(id&&method==="POST"){
 const o=await db.opportunity.findUnique({where:{id},select:{id:true}});if(!o)throw new HttpError(404,"Oportunidade não encontrada.");
 if(action==="prioritize"){
 await rateLimit("prioritize:"+userId,20,5);
 const details=await db.opportunity.findUniqueOrThrow({where:{id},select:{detailsHash:true,contentHash:true}});
 if(details.detailsHash!==details.contentHash)await db.jobRequest.upsert({where:{id:digest("ENRICH:"+id)},create:{id:digest("ENRICH:"+id),type:"ENRICH:"+id},update:{status:"PENDING"}});
 return reply({ok:true});
 }
 if(action==="document-analysis"){
 if(process.env.AI_PROVIDER!=="openai"||!process.env.AI_API_KEY||!process.env.AI_MODEL)throw new HttpError(503,"Provedor de IA não configurado.");
 const {documentId}=z.object({documentId:z.string().cuid()}).strict().parse(await body(req));
 if(!await db.opportunityDocument.findFirst({where:{id:documentId,opportunityId:id}}))throw new HttpError(404,"Documento não encontrado.");
 await rateLimit("document-ai:"+userId,3,60);await db.jobRequest.create({data:{type:"DOCUMENT:"+userId+":"+documentId}});
 await audit(userId,"DOCUMENT_ANALYSIS_REQUESTED",documentId);return reply({message:"Análise do PDF solicitada. O próximo job processará até 8 trechos; veja o resultado em Análises."});
 }
 if(action==="refresh"){await rateLimit("enrich:"+userId,5,60);await db.opportunity.update({where:{id},data:{detailsHash:null}});await db.jobRequest.upsert({where:{id:digest("ENRICH:"+id)},create:{id:digest("ENRICH:"+id),type:"ENRICH:"+id},update:{status:"PENDING"}});return reply({message:"Importação solicitada. O próximo job buscará itens e documentos oficiais."});}
 if(action==="favorite"){await db.favorite.upsert({where:{userId_opportunityId:{userId,opportunityId:id}},create:{userId,opportunityId:id},update:{}});await audit(userId,"FAVORITED",id);return reply({ok:true});}
 if(action==="tracking"){const {status}=z.object({status:z.enum(["NOVA","ANALISANDO","INTERESSADO","PARTICIPANDO","DESCARTADA","GANHA","PERDIDA"])}).strict().parse(await body(req));await db.opportunityTracking.upsert({where:{userId_opportunityId:{userId,opportunityId:id}},create:{userId,opportunityId:id,status},update:{status}});await audit(userId,"STATUS_"+status,id);return reply({ok:true});}
 if(action==="analyze"){const result=await analyze(userId,id);await audit(userId,"ANALYSIS_REQUESTED",id);return reply(result);}
 }
 if(id&&method==="DELETE"&&action==="favorite"){await db.favorite.deleteMany({where:{userId,opportunityId:id}});await audit(userId,"UNFAVORITED",id);return reply({ok:true});}
 }
 if(resource==="alerts"){
 if(method==="GET")return reply(await db.alert.findMany({where:{userId},orderBy:{createdAt:"desc"}}));
 if(id&&!await db.alert.findFirst({where:{id,userId}}))throw new HttpError(404,"Alerta não encontrado.");
 if(method==="POST"||method==="PATCH"){
 const data=alertInput.parse(await body(req));
 if(data.companyId&&!await db.company.findFirst({where:{id:data.companyId,organizationId:{in:orgs}}}))throw new HttpError(404,"Empresa não encontrada.");
 const result=id?await db.alert.update({where:{id},data}):await db.alert.create({data:{...data,userId}});
 await audit(userId,"ALERT_SAVED",result.id);return reply(result);
 }
 if(method==="DELETE"&&id){await db.alert.delete({where:{id}});return reply({ok:true});}
 }
 if(resource==="notifications"){
 if(method==="GET")return reply(await db.notification.findMany({where:{userId},orderBy:{createdAt:"desc"},take:100}));
 if(method==="PATCH"){await db.notification.updateMany({where:{userId,...(id&&id!=="all"?{id}:{})},data:{readAt:new Date()}});return reply({ok:true});}
 }
 if(resource==="history"&&method==="GET")return reply(await db.auditLog.findMany({where:{userId},take:100,orderBy:{createdAt:"desc"}}));
 if(resource==="analyses"&&method==="GET")return reply(await db.aIAnalysis.findMany({where:{userId},include:{opportunity:{select:{id:true,object:true}}},take:50,orderBy:{createdAt:"desc"}}));
 if(resource==="reports"&&method==="GET"){
 const params=new URL(req.url).searchParams;const data=await report(userId,params);
 if(params.get("format")==="csv"){
 const rows=[["Grupo","Oportunidades","Valor estimado total"],...data.rows.map(r=>[r.label,r.count,r.value?.toString()??""])];
 return new Response("\uFEFF"+rows.map(row=>row.map(csvCell).join(";")).join("\r\n"),{headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":"attachment; filename=pncp-relatorio.csv","Cache-Control":"no-store"}});
 }
 return reply(data);
 }
 if(resource==="dashboard"&&method==="GET"){
 const recommendation:Prisma.OpportunityWhereInput={matches:{some:{company:{organizationId:{in:orgs}},score:{gte:70}}}};
 const [total,open,favorites,recommended,recent,closing,value,latest,due,largest,activity,companies,states]=await Promise.all([
 db.opportunity.count(),db.opportunity.count({where:{closesAt:{gt:new Date()}}}),db.favorite.count({where:{userId}}),
 db.opportunity.count({where:recommendation}),db.opportunity.count({where:{discoveredAt:{gte:new Date(Date.now()-86400000)}}}),
 db.opportunity.count({where:{closesAt:{gt:new Date(),lte:new Date(Date.now()+3*86400000)}}}),
 db.opportunity.aggregate({where:recommendation,_sum:{estimatedValue:true}}),
 db.opportunity.findMany({orderBy:{discoveredAt:"desc"},take:5,select:{id:true,object:true,state:true,estimatedValue:true}}),
 db.opportunity.findMany({where:{closesAt:{gt:new Date()}},orderBy:{closesAt:"asc"},take:5,select:{id:true,object:true,closesAt:true}}),
 db.opportunity.findMany({where:recommendation,orderBy:{estimatedValue:{sort:"desc",nulls:"last"}},take:5,select:{id:true,object:true,estimatedValue:true}}),
 db.auditLog.findMany({where:{userId},take:5,orderBy:{createdAt:"desc"}}),db.company.count({where:{organizationId:{in:orgs}}}),
 db.opportunity.groupBy({by:["state"],_count:true,orderBy:{_count:{state:"desc"}},take:10})
 ]);return reply({total,open,favorites,recommended,recent,closing,value:value._sum.estimatedValue,latest,due,largest,activity,companies,states});
 }
 if(resource==="admin"){
 await requireAdmin();
 if(method==="GET"&&(!id||id==="overview")){
 const [users,companies,opportunities,jobs,analyses]=await Promise.all([db.user.count(),db.company.count(),db.opportunity.count(),db.syncJob.findMany({take:20,orderBy:{startedAt:"desc"},include:{logs:true}}),db.aIAnalysis.count()]);
 return reply({users,companies,opportunities,analyses,jobs,version:"0.1.0",uptime:Math.floor(process.uptime()),aiConfigured:!!process.env.AI_API_KEY,smtpConfigured:!!process.env.SMTP_HOST});
 }
 if(id==="sync"&&method==="POST"){await rateLimit("manual-sync",1,5);await db.jobRequest.create({data:{type:"SYNC"}});return reply({message:"Solicitação registrada. O próximo job agendado processará a coleta."});}
 if(id==="users"){
 if(method==="GET")return reply(await db.user.findMany({select:{id:true,email:true,name:true,role:true,active:true,createdAt:true},take:200,orderBy:{createdAt:"desc"}}));
 if(method==="POST"){
 const b=z.object({name:z.string().min(2).max(150),email:z.string().email().transform(s=>s.toLowerCase()),password,role:z.enum(["USER","ADMIN"]).default("USER")}).strict().parse(await body(req));
 const created=await db.user.create({data:{email:b.email,name:b.name,passwordHash:await passwordHash(b.password),role:b.role,memberships:{create:{organization:{create:{name:b.name}}}}},select:{id:true,email:true,name:true}});
 await audit(userId,"USER_CREATED",created.id);return reply(created,201);
 }
 if(method==="PATCH"&&action){const b=z.object({active:z.boolean()}).strict().parse(await body(req));if(action===userId)throw new HttpError(400,"Não é possível desativar a própria conta.");await db.user.update({where:{id:action},data:b});await db.session.deleteMany({where:{userId:action}});return reply({ok:true});}
 }
 }
 throw new HttpError(404,"Rota não encontrada.");
 }catch(e){
 if(e instanceof HttpError)return reply({error:e.message},e.status);
 if(e instanceof ZodError)return reply({error:e.issues.map(i=>i.message).join(" ")},400);
 if(e instanceof Prisma.PrismaClientKnownRequestError&&e.code==="P2002")return reply({error:"Este registro já existe."},409);
 console.error(JSON.stringify({event:"API_FAILED",kind:e instanceof Error?e.name:"unknown"}));return reply({error:"Não foi possível concluir a operação."},500);
 }
}
export {handler as GET,handler as POST,handler as PATCH,handler as DELETE};

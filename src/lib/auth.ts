import {cookies} from "next/headers";
import {createHash,randomBytes} from "node:crypto";
import {compare,hash} from "bcryptjs";
import {db} from "./db";
export class HttpError extends Error {constructor(public status:number,message:string){super(message);}}
export const digest=(v:string)=>createHash("sha256").update(v).digest("hex");
export async function currentUser(){
 const token=(await cookies()).get("pncp_session")?.value;
 if(!token)return null;
 const session=await db.session.findUnique({where:{id:digest(token)},include:{user:{include:{memberships:true}}}});
 if(!session||session.expiresAt<new Date()||!session.user.active)return null;
 return session.user;
}
export async function requireUser(){const u=await currentUser();if(!u)throw new HttpError(401,"Faça login para continuar.");return u;}
export async function requireAdmin(){const u=await requireUser();if(u.role!=="ADMIN")throw new HttpError(403,"Acesso restrito.");return u;}
export async function rateLimit(key:string,limit:number,minutes:number){
 const id=digest(key); const now=new Date();
 const count=await db.$transaction(async tx=>{
 await tx.$executeRaw`INSERT INTO "RateLimit" ("id","count","expiresAt") VALUES (${id},1,${new Date(Date.now()+minutes*60000)}) ON CONFLICT ("id") DO UPDATE SET "count"=CASE WHEN "RateLimit"."expiresAt"<${now} THEN 1 ELSE "RateLimit"."count"+1 END,"expiresAt"=CASE WHEN "RateLimit"."expiresAt"<${now} THEN EXCLUDED."expiresAt" ELSE "RateLimit"."expiresAt" END`;
 return (await tx.rateLimit.findUniqueOrThrow({where:{id}})).count;
 });if(count>limit)throw new HttpError(429,"Muitas tentativas. Aguarde alguns minutos.");
}
// Parse a single serialized HTTP origin, never a URL containing credentials or a path.
function parseOrigin(value:string|null){
 if(!value||/[\s,\\]/.test(value))return null;
 try{const u=new URL(value);if(!["http:","https:"].includes(u.protocol)||u.username||u.password||u.search||u.hash||u.pathname!=="/"||value.endsWith("/"))return null;return u.origin;}catch{return null;}
}
function proxyOrigin(host:string|null,proto:string|null){
 if(!host||!proto||!["http","https"].includes(proto)||/[\s,/@?#\\]/.test(host))return null;
 return parseOrigin(proto+"://"+host);
}
export function verifyOrigin(req:Request){
 const configured=process.env.APP_URL;
 if(!configured)throw new HttpError(503,"APP_URL não configurada.");
 let appOrigin:string|null=null;
 try{const u=new URL(configured);if(!u.username&&!u.password)appOrigin=parseOrigin(u.origin);}catch{}
 if(!appOrigin)throw new HttpError(503,"APP_URL inválida.");
 const origin=parseOrigin(req.headers.get("origin"));
 if(!origin)throw new HttpError(403,"Origem não permitida.");
 // APP_URL remains trusted even without proxy headers (including local development).
 if(origin===appOrigin)return;
 // Never trust a host merely because the request supplies it. Railway's public
 // domain is injected by the platform, not inferred from Host or a wildcard.
 const railwayOrigin=proxyOrigin(process.env.RAILWAY_PUBLIC_DOMAIN??null,"https");
 const forwarded=proxyOrigin(req.headers.get("x-forwarded-host"),req.headers.get("x-forwarded-proto"));
 if(railwayOrigin&&forwarded===railwayOrigin&&origin===forwarded)return;
 throw new HttpError(403,"Origem não permitida.");
}
export async function login(email:string,password:string){
 await rateLimit("login:"+email,10,15);
 const user=await db.user.findUnique({where:{email}});
 const valid=await compare(password,user?.passwordHash??"$2b$12$kSeFt9L1DZmKpq.iAZeKIeNQoKAFTB6.mQQ3DQ2FDmcRt9CeuKGw6");
 if(!user||!user.active||!valid)throw new HttpError(401,"E-mail ou senha inválidos.");
 const token=randomBytes(32).toString("hex");
 await db.session.create({data:{id:digest(token),userId:user.id,expiresAt:new Date(Date.now()+7*86400000)}});
 (await cookies()).set("pncp_session",token,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/",maxAge:7*86400});
}
export async function logout(){
 const c=await cookies(),token=c.get("pncp_session")?.value;
 if(token)await db.session.deleteMany({where:{id:digest(token)}});
 c.delete("pncp_session");
}
export const passwordHash=(password:string)=>hash(password,12);
export async function audit(userId:string,event:string,entityId?:string){await db.auditLog.create({data:{userId,event,entityId}});}

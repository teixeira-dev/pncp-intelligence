import assert from "node:assert/strict";
import {randomBytes,createHash} from "node:crypto";
import {db} from "../src/lib/db";
import {passwordHash} from "../src/lib/auth";
import {upsertOpportunity,refreshCompany,processAlerts} from "../src/lib/sync";
if(process.env.RUN_INTEGRATION!=="1")throw new Error("Use only in an isolated integration environment.");
const base="http://localhost:3000",suffix=randomBytes(6).toString("hex"),secret=randomBytes(18).toString("hex");
const users:string[]=[],orgs:string[]=[];let tenderId="";
async function call(path:string,method="GET",data?:unknown,cookie=""){
 return fetch(base+"/api/"+path,{method,headers:{"Content-Type":"application/json",Origin:base,Cookie:cookie},...(data!==undefined?{body:JSON.stringify(data)}:{})});
}
async function createUser(label:string,role="USER"){
 const u=await db.user.create({data:{email:label.toLowerCase()+suffix+"@example.test",name:label,passwordHash:await passwordHash(secret),role,memberships:{create:{organization:{create:{name:label+suffix}}}}},include:{memberships:true}});
 users.push(u.id);orgs.push(u.memberships[0].organizationId);
 const r=await call("auth/login","POST",{email:u.email,password:secret});assert.equal(r.status,200);
 const cookie=r.headers.get("set-cookie")?.split(";")[0];assert(cookie);return {u,cookie};
}
async function main(){
 assert.equal((await call("companies")).status,401);
 const setup={token:"1".repeat(64),name:"Test admin",email:"setup-"+suffix+"@example.test",password:secret};
 assert.equal((await call("auth/bootstrap","POST",{...setup,token:"2".repeat(64)})).status,403);
 assert.equal((await call("auth/bootstrap","POST",setup)).status,200);
 const initial=await db.user.findUniqueOrThrow({where:{email:setup.email},include:{memberships:true}});users.push(initial.id);orgs.push(initial.memberships[0].organizationId);
 assert.equal((await call("auth/bootstrap","POST",setup)).status,409);

 const registration={name:"New user",email:"new-"+suffix+"@example.test",password:secret,confirmPassword:secret};
 assert.equal((await call("auth/register","POST",{...registration,role:"ADMIN"})).status,400);
 assert.equal((await call("auth/register","POST",{...registration,confirmPassword:"different"})).status,400);
 assert.equal((await call("auth/register","POST",registration)).status,201);
 const registered=await db.user.findUniqueOrThrow({where:{email:registration.email},include:{memberships:true}});
 users.push(registered.id);orgs.push(registered.memberships[0].organizationId);
 assert.equal(registered.role,"USER");assert.equal(registered.memberships.length,1);
 assert.equal((await call("auth/register","POST",registration)).status,201);
 assert.equal(await db.user.count({where:{email:registration.email}}),1);
 const registeredLogin=await call("auth/login","POST",{email:registration.email,password:secret});assert.equal(registeredLogin.status,200);
 assert.equal((await call("admin","GET",undefined,registeredLogin.headers.get("set-cookie")!.split(";")[0])).status,403);
 const a=await createUser("A"),b=await createUser("B");
 assert.equal((await call("admin","GET",undefined,a.cookie)).status,403);
 const invalid=await fetch(base+"/api/companies",{method:"POST",headers:{"Content-Type":"application/json",Cookie:a.cookie,Origin:"https://untrusted.example"},body:"{}"});assert.equal(invalid.status,403);
 const created=await call("companies","POST",{legalName:"Hospital Test",cnpj:"11222333000181",keywords:["hospitalar"],regions:["PE"]},a.cookie);assert.equal(created.status,200);
 const company=await created.json();
 assert.deepEqual(await (await call("companies/"+company.id,"GET",undefined,b.cookie)).json(),[]);
 assert.equal((await call("companies/"+company.id,"PATCH",{legalName:"Hacked",cnpj:"11222333000181"},b.cookie)).status,404);
 assert.equal((await call("companies/"+company.id,"DELETE",undefined,b.cookie)).status,404);
 tenderId="SMOKE-"+suffix;
 await upsertOpportunity({numeroControlePNCP:tenderId,anoCompra:2026,sequencialCompra:1,numeroCompra:suffix,objetoCompra:"Material hospitalar "+suffix,modalidadeId:6,modalidadeNome:"Pregão eletrônico",situacaoCompraNome:"Divulgada no PNCP",dataPublicacaoPncp:new Date().toISOString(),orgaoEntidade:{cnpj:"11222333000181",razaoSocial:"Teste de integração"},unidadeOrgao:{municipioNome:"Recife",ufSigla:"PE"}});
 await refreshCompany(company.id);
 for(const sort of ["recent","score","relevance","deadline","value_desc","value_asc"]){
 const response=await call("opportunities?state=PE&q="+suffix+"&sort="+sort,"GET",undefined,a.cookie);assert.equal(response.status,200);assert.equal((await response.json()).total,1);
 }
 assert.equal((await call("opportunities/"+tenderId+"/favorite","POST",{},a.cookie)).status,200);
 assert.equal((await (await call("opportunities?favorite=1","GET",undefined,b.cookie)).json()).total,0);
 assert.equal((await call("opportunities/"+tenderId+"/tracking","POST",{status:"INTERESSADO"},a.cookie)).status,200);
 assert.equal((await call("opportunities/"+tenderId+"/analyze","POST",{},a.cookie)).status,503);
 const alert=await call("alerts","POST",{name:"Teste hospital",companyId:company.id,keywords:["hospitalar"],minScore:80},a.cookie);assert.equal(alert.status,200);
 const alertRow=await alert.json();
 assert.equal((await call("alerts/"+alertRow.id,"DELETE",undefined,b.cookie)).status,404);
 await db.alert.update({where:{id:alertRow.id},data:{createdAt:new Date(Date.now()-60000)}});
 await processAlerts();await processAlerts();
 const notifications=await (await call("notifications","GET",undefined,a.cookie)).json();assert.equal(notifications.length,1);
 assert.equal((await call("notifications/all","PATCH",{},a.cookie)).status,200);
 assert.equal((await call("auth/logout","POST",{},a.cookie)).status,200);
 assert.equal((await call("companies","GET",undefined,a.cookie)).status,401);
 const token=randomBytes(32).toString("hex"),newPassword=randomBytes(18).toString("hex");
 await db.passwordReset.create({data:{id:createHash("sha256").update(token).digest("hex"),userId:b.u.id,expiresAt:new Date(Date.now()+60000)}});
 assert.equal((await call("auth/reset","POST",{token,password:newPassword})).status,200);
 assert.equal((await call("auth/reset","POST",{token,password:secret})).status,400);
 assert.equal((await call("companies","GET",undefined,b.cookie)).status,401);
 assert.equal((await call("auth/login","POST",{email:b.u.email,password:secret})).status,401);
 assert.equal((await call("auth/login","POST",{email:b.u.email,password:newPassword})).status,200);
 const csv=await call("reports?group=state&format=csv","GET",undefined,(await createUser("Reporter")).cookie);assert.equal(csv.status,200);assert.match(csv.headers.get("content-type")??"",/text\/csv/);
 console.log("HTTP_SMOKE_PASSED: login, CSRF, authorization, cross-user isolation, CRUD, search/sorts, favorite, tracking, AI unavailable, alerts, notification deduplication and logout.");
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{
 await db.user.deleteMany({where:{id:{in:users}}});await db.organization.deleteMany({where:{id:{in:orgs}}});
 if(tenderId)await db.opportunity.deleteMany({where:{id:tenderId}});
 await db.contractingAgency.deleteMany({where:{id:"11222333000181",opportunities:{none:{}}}});
 await db.$disconnect();
});

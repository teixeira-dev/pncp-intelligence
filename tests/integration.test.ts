import {describe,it,expect,beforeAll,afterAll} from "vitest";
import {db} from "../src/lib/db";
import {upsertOpportunity,refreshCompany,processAlerts} from "../src/lib/sync";
const fixture={numeroControlePNCP:"TEST-INTEGRATION",anoCompra:2026,sequencialCompra:1,numeroCompra:"1/2026",objetoCompra:"Material hospitalar",valorTotalEstimado:1000.50,modalidadeId:6,modalidadeNome:"Pregão eletrônico",situacaoCompraNome:"Divulgada no PNCP",dataPublicacaoPncp:"2026-09-14T10:00:00",orgaoEntidade:{cnpj:"11222333000181",razaoSocial:"Órgão de teste"},unidadeOrgao:{municipioNome:"Recife",ufSigla:"PE"}};
describe.skipIf(process.env.RUN_INTEGRATION!=="1")("PostgreSQL integration",()=>{
 let userId="",orgId="",companyId="",alertId="";
 beforeAll(async()=>{const org=await db.organization.create({data:{name:"Integration"}});orgId=org.id;const user=await db.user.create({data:{email:"integration-"+Date.now()+"@example.test",name:"Test",passwordHash:"not-a-real-login",memberships:{create:{organizationId:orgId}}}});userId=user.id;});
 afterAll(async()=>{await db.user.delete({where:{id:userId}});await db.organization.delete({where:{id:orgId}});await db.opportunity.deleteMany({where:{id:fixture.numeroControlePNCP}});await db.contractingAgency.deleteMany({where:{id:fixture.orgaoEntidade.cnpj,opportunities:{none:{}}}});await db.$disconnect();});
 it("creates, skips duplicates, updates changed records",async()=>{expect(await upsertOpportunity(fixture)).toBe("created");expect(await upsertOpportunity(fixture)).toBe("unchanged");expect(await upsertOpportunity({...fixture,objetoCompra:"Equipamento hospitalar"})).toBe("updated");expect(await db.opportunity.count({where:{id:fixture.numeroControlePNCP}})).toBe(1);});
 it("migrates legacy hashes without scheduling identical details again",async()=>{
 const id=fixture.numeroControlePNCP;
 const original=await db.opportunity.findUniqueOrThrow({where:{id}});
 await db.opportunity.update({where:{id},data:{contentHash:"legacy-hash",detailsHash:"legacy-hash"}});
 expect(await upsertOpportunity(original.raw)).toBe("unchanged");
 const current=await db.opportunity.findUniqueOrThrow({where:{id}});
 expect(current.contentHash).toBe(original.contentHash);expect(current.detailsHash).toBe(current.contentHash);
 });
 it("persists an explained score",async()=>{const c=await db.company.create({data:{organizationId:orgId,legalName:"Test",cnpj:"11222333000181",keywords:["hospitalar"],regions:["PE"]}});companyId=c.id;await refreshCompany(companyId);const m=await db.opportunityMatch.findUniqueOrThrow({where:{companyId_opportunityId:{companyId,opportunityId:fixture.numeroControlePNCP}}});expect(m.score).toBe(100);});
 it("does not duplicate favorites",async()=>{const data={userId,opportunityId:fixture.numeroControlePNCP};for(let i=0;i<2;i++)await db.favorite.upsert({where:{userId_opportunityId:data},create:data,update:{}});expect(await db.favorite.count({where:data})).toBe(1);});
 it("creates one notification for repeated processing",async()=>{const a=await db.alert.create({data:{name:"Hospital",userId,companyId,keywords:["hospitalar"],minScore:80,createdAt:new Date("2020-01-01")}});alertId=a.id;await processAlerts();await processAlerts();expect(await db.notification.count({where:{alertId}})).toBe(1);});
});

import {afterAll,beforeAll,describe,expect,it,vi} from "vitest";
import {db} from "../src/lib/db";
import {upsertOpportunity} from "../src/lib/sync";
import {enrichOpportunity,importPendingDetails} from "../src/lib/enrichment";
const id="TEST-ENRICHMENT";
describe.skipIf(process.env.RUN_INTEGRATION!=="1")("automatic official details",()=>{
 beforeAll(async()=>{await db.syncCursor.deleteMany({where:{id:"PNCP_COOLDOWN"}});await upsertOpportunity({numeroControlePNCP:id,anoCompra:2026,sequencialCompra:1,numeroCompra:"1",objetoCompra:"Objeto oficial",modalidadeId:6,modalidadeNome:"Pregão",situacaoCompraNome:"Divulgada",dataPublicacaoPncp:"2026-09-14T10:00:00",orgaoEntidade:{cnpj:"11222333000181",razaoSocial:"Órgão"},unidadeOrgao:{municipioNome:"Recife",ufSigla:"PE"}});});
 afterAll(async()=>{await db.jobRequest.deleteMany({where:{type:"ENRICH:"+id}});await db.opportunity.deleteMany({where:{id:{in:[id,id+"-NEW"]}}});await db.$disconnect();});
 const fetcher=vi.fn(async(input:RequestInfo|URL)=>Response.json(String(input).includes("/itens?")?[{numeroItem:1,descricao:"Item oficial",quantidade:2,valorUnitarioEstimado:100,orcamentoSigiloso:true}]:[{sequencialDocumento:1,titulo:"Edital",tipoDocumentoNome:"Edital",statusAtivo:true}]));
 it("automatically fills pending opportunities and preserves document IDs",async()=>{
 expect((await importPendingDetails({fetcher,sleep:async()=>{}})).imported).toBeGreaterThan(0);
 const first=await db.opportunity.findUniqueOrThrow({where:{id},include:{items:true,documents:true}});
 expect(first.detailsHash).toBe(first.contentHash);expect(first.items[0].unitValue).toBeNull();expect(first.documents[0].url).toContain("/arquivos/1");
 await enrichOpportunity(id,{fetcher,sleep:async()=>{}});
 expect((await db.opportunityDocument.findMany({where:{opportunityId:id}}))[0].id).toBe(first.documents[0].id);
 });
 it("prioritizes a viewed opportunity ahead of newer records and completes its request",async()=>{
 const original=await db.opportunity.findUniqueOrThrow({where:{id}});
 await db.opportunity.create({data:{...original,raw:JSON.parse(JSON.stringify(original.raw)),id:id+"-NEW",detailsHash:null,discoveredAt:new Date(Date.now()+60000)}});
 await db.opportunity.update({where:{id},data:{detailsHash:null}});
 await db.jobRequest.create({data:{type:"ENRICH:"+id}});
 const onProgress=vi.fn(async()=>{});
 const result=await importPendingDetails({limit:1,newest:true,fetcher,sleep:async()=>{},onProgress});
 expect(result).toMatchObject({imported:1,items:1,documents:1,failed:0,pending:true});expect(result.pendingCount).toBeGreaterThan(0);
 expect(onProgress).toHaveBeenLastCalledWith({imported:1,items:1,documents:1,failed:0,deferred:0,pages:2});
 expect((await db.opportunity.findUniqueOrThrow({where:{id}})).detailsHash).toBe(original.contentHash);
 expect((await db.opportunity.findUniqueOrThrow({where:{id:id+"-NEW"}})).detailsHash).toBeNull();
 expect((await db.jobRequest.findFirstOrThrow({where:{type:"ENRICH:"+id}})).status).toBe("DONE");
 });
 it("preserves previous items and documents when one endpoint fails",async()=>{
 const broken=vi.fn(async(input:RequestInfo|URL)=>String(input).includes("/itens?")?Response.json([{numeroItem:2,descricao:"Incomplete replacement"}]):new Response(null,{status:503}));
 await expect(enrichOpportunity(id,{fetcher:broken,sleep:async()=>{}})).rejects.toThrow("503");
 const items=await db.opportunityItem.findMany({where:{opportunityId:id}});expect(items.map(i=>i.number)).toEqual([1]);expect(await db.opportunityDocument.count({where:{opportunityId:id}})).toBe(1);
 });
 it("resumes a large import from the saved page and publishes only when complete",async()=>{
 await db.detailImport.deleteMany({where:{opportunityId:id}});
 const calls:string[]=[];
 const paginated=vi.fn(async(input:RequestInfo|URL)=>{
 const u=new URL(String(input));const page=Number(u.searchParams.get("pagina"));const kind=u.pathname.endsWith("/itens")?"itens":"arquivos";calls.push(kind+":"+page);
 return Response.json(kind==="itens"?(page===1?Array.from({length:50},(_,i)=>({numeroItem:i+1,descricao:"Item "+(i+1)})):[]):[{sequencialDocumento:1,titulo:"Edital oficial"}]);
 });
 const first=await enrichOpportunity(id,{fetcher:paginated,sleep:async()=>{},pageBudget:1});
 expect(first.complete).toBe(false);expect(first.pages).toBe(1);
 expect(await db.opportunityItem.count({where:{opportunityId:id}})).toBe(1);
 const second=await enrichOpportunity(id,{fetcher:paginated,sleep:async()=>{},pageBudget:2});
 expect(second).toMatchObject({complete:true,items:50,documents:1});
 expect(calls).toEqual(["itens:1","itens:2","arquivos:1"]);
 expect(await db.detailImport.count({where:{opportunityId:id}})).toBe(0);
 expect(await db.opportunityItem.count({where:{opportunityId:id}})).toBe(50);
 });
 it("reuses staged items after document timeout without destroying existing data",async()=>{
 const fail=vi.fn(async(input:RequestInfo|URL)=>String(input).includes("/itens?")?Response.json([{numeroItem:501,descricao:"Novo item"}]):new Response(null,{status:503}));
 await expect(enrichOpportunity(id,{fetcher:fail,sleep:async()=>{},attempts:1})).rejects.toThrow("503");
 expect(await db.opportunityItem.count({where:{opportunityId:id}})).toBe(50);
 const resume=vi.fn(async(input:RequestInfo|URL)=>{expect(String(input)).toContain("/arquivos?");return Response.json([{sequencialDocumento:1,titulo:"Atualizado"}]);});
 expect((await enrichOpportunity(id,{fetcher:resume,sleep:async()=>{}})).complete).toBe(true);
 expect(resume).toHaveBeenCalledTimes(1);
 expect((await db.opportunityItem.findMany({where:{opportunityId:id}})).map(i=>i.number)).toEqual([501]);
 });
 it("discards an unfinished snapshot when the official content changes",async()=>{
 await enrichOpportunity(id,{fetcher,sleep:async()=>{},pageBudget:1});
 const o=await db.opportunity.findUniqueOrThrow({where:{id}});
 await upsertOpportunity({...o.raw as object,objetoCompra:"Objeto revisado"});
 const fresh=vi.fn(fetcher.getMockImplementation()!);
 await enrichOpportunity(id,{fetcher:fresh,sleep:async()=>{}});
 expect(String(fresh.mock.calls[0][0])).toContain("/itens?pagina=1");
 const saved=await db.opportunity.findUniqueOrThrow({where:{id}});expect(saved.detailsHash).toBe(saved.contentHash);
 });

});

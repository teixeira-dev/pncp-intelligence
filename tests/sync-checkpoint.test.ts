import {afterAll,beforeAll,describe,expect,it,vi} from "vitest";
import {db} from "../src/lib/db";
import {collectPartitions} from "../src/lib/sync-collector";
const counters=()=>({received:0,created:0,updated:0,unchanged:0});
const ids=["CHECKPOINT-1","CHECKPOINT-2"];
const record=(id:string)=>({numeroControlePNCP:id,anoCompra:2026,sequencialCompra:1,numeroCompra:"1",objetoCompra:"Teste checkpoint",modalidadeId:6,modalidadeNome:"Pregão",situacaoCompraNome:"Divulgada",dataPublicacaoPncp:"2026-09-14T10:00:00",orgaoEntidade:{cnpj:"11222333000181",razaoSocial:"Teste"},unidadeOrgao:{municipioNome:"Recife",ufSigla:"PE"}});
describe.skipIf(process.env.RUN_INTEGRATION!=="1")("durable PNCP page checkpoints",()=>{
 const jobs:string[]=[];
 beforeAll(async()=>{await db.syncPartition.deleteMany();await db.syncCursor.deleteMany({where:{id:{in:["PNCP_MODALITIES","PNCP_COOLDOWN"]}}});});
 afterAll(async()=>{await db.syncJob.deleteMany({where:{id:{in:jobs}}});await db.syncPartition.deleteMany();await db.syncCursor.deleteMany({where:{id:{in:["PNCP_MODALITIES","PNCP_COOLDOWN"]}}});await db.opportunity.deleteMany({where:{id:{in:ids}}});await db.$disconnect();});
 const job=async()=>{const j=await db.syncJob.create({data:{}});jobs.push(j.id);return j.id;};
 it("commits page one, preserves failed page and resumes without reimporting page one",async()=>{
 const calls:number[]=[];
 const first=vi.fn(async(input:RequestInfo|URL)=>{
 const url=new URL(String(input));if(url.pathname.endsWith("modalidades"))return Response.json([{id:6,nome:"Pregão"}]);
 const page=Number(url.searchParams.get("pagina"));calls.push(page);
 return page===1?Response.json({data:[record(ids[0])],totalPaginas:2}):new Response(null,{status:422});
 });
 const time=new Date("2026-09-15T12:00:00Z");
 expect((await collectPartitions(await job(),counters(),{fetcher:first,sleep:async()=>{},now:time})).complete).toBe(false);
 expect(calls).toEqual([1,2]);expect((await db.syncPartition.findUniqueOrThrow({where:{modality:6}})).nextPage).toBe(2);
 expect(await db.opportunity.count({where:{id:{in:ids}}})).toBe(1);
 const second=vi.fn(async(input:RequestInfo|URL)=>{expect(new URL(String(input)).searchParams.get("pagina")).toBe("2");return Response.json({data:[record(ids[1])],totalPaginas:2});});
 const next=counters();await collectPartitions(await job(),next,{fetcher:second,sleep:async()=>{},now:new Date(time.getTime()+2*3600000)});
 expect(second).toHaveBeenCalledTimes(1);expect(next.created).toBe(1);expect(next.unchanged).toBe(0);expect(await db.opportunity.count({where:{id:{in:ids}}})).toBe(2);
 });
 it("does not advance a checkpoint on validation failure",async()=>{
 const fetcher=vi.fn(async()=>Response.json({data:[{bad:true}],totalPaginas:1}));
 await collectPartitions(await job(),counters(),{fetcher,sleep:async()=>{},now:new Date("2026-09-16T12:00:00Z")});
 expect((await db.syncPartition.findUniqueOrThrow({where:{modality:6}})).nextPage).toBe(1);
 });
 it("persists a global cooldown and performs no calls before it expires",async()=>{
 await db.syncPartition.updateMany({data:{retryAt:null}});
 const fetcher=vi.fn(async()=>new Response(null,{status:429,headers:{"Retry-After":"3600"}}));
 await collectPartitions(await job(),counters(),{fetcher,sleep:async()=>{},now:new Date()});
 const stored=await db.syncCursor.findUnique({where:{id:"PNCP_COOLDOWN"}});expect(stored).not.toBeNull();
 fetcher.mockClear();await collectPartitions(await job(),counters(),{fetcher,sleep:async()=>{},now:new Date(stored!.through.getTime()-1000)});expect(fetcher).not.toHaveBeenCalled();
 });
});

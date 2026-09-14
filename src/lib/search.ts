import {Prisma} from "@prisma/client";
import {z} from "zod";
import {db} from "./db";
const calendarDate=z.string().refine(v=>!v||(/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v),"Data inválida.").default("");
export const querySchema=z.object({
 q:z.string().max(200).default(""),state:z.string().regex(/^([A-Za-z]{2})?$/).default(""),city:z.string().max(100).default(""),agency:z.string().max(100).default(""),
 modality:z.coerce.number().int().min(0).max(20).default(0),status:z.enum(["","open","closed"]).default(""),
 favorite:z.enum(["","1"]).default(""),recommended:z.enum(["","1"]).default(""),minScore:z.coerce.number().int().min(0).max(100).default(0),
 min:z.string().regex(/^(\d{1,16}(\.\d{1,2})?)?$/).default(""),max:z.string().regex(/^(\d{1,16}(\.\d{1,2})?)?$/).default(""),
 from:calendarDate,to:calendarDate,deadline:calendarDate,
 sort:z.enum(["recent","deadline","value_desc","value_asc","score","relevance"]).default("recent"),
 page:z.coerce.number().int().min(1).max(10000).default(1)
}).refine(v=>!v.min||!v.max||new Prisma.Decimal(v.min).lte(v.max),"Faixa de valor inválida.")
.refine(v=>!v.from||!v.to||v.from<=v.to,"Período inválido.");
export async function searchOpportunities(userId:string,params:URLSearchParams){
 const q=querySchema.parse(Object.fromEntries(params));
 const filters:Prisma.Sql[]=[Prisma.sql`TRUE`];
 const pattern=(v:string)=>"%"+v.replace(/[\\%_]/g,"\\$&")+"%";
 const vector=Prisma.sql`to_tsvector('portuguese',coalesce(o."object",'') || ' ' || coalesce(o."description",''))`;
 const rank=q.q?Prisma.sql`ts_rank(${vector},websearch_to_tsquery('portuguese',${q.q}))`:Prisma.sql`0`;
 if(q.state)filters.push(Prisma.sql`o."state"=${q.state.toUpperCase()}`);
 if(q.city)filters.push(Prisma.sql`o."city" ILIKE ${pattern(q.city)}`);
 if(q.agency)filters.push(Prisma.sql`a."name" ILIKE ${pattern(q.agency)}`);
 if(q.modality)filters.push(Prisma.sql`o."modality"=${q.modality}`);
 if(q.min)filters.push(Prisma.sql`o."estimatedValue">=${q.min}::numeric`);
 if(q.max)filters.push(Prisma.sql`o."estimatedValue"<=${q.max}::numeric`);
 if(q.from)filters.push(Prisma.sql`o."publishedAt">=${new Date(q.from+"T00:00:00-03:00")}`);
 if(q.to)filters.push(Prisma.sql`o."publishedAt"<=${new Date(q.to+"T23:59:59.999-03:00")}`);
 if(q.deadline)filters.push(Prisma.sql`o."closesAt"<=${new Date(q.deadline+"T23:59:59.999-03:00")}`);
 if(q.status==="open")filters.push(Prisma.sql`o."closesAt">${new Date()}`);
 if(q.status==="closed")filters.push(Prisma.sql`o."closesAt"<=${new Date()}`);
 if(q.favorite)filters.push(Prisma.sql`EXISTS(SELECT 1 FROM "Favorite" f WHERE f."opportunityId"=o.id AND f."userId"=${userId})`);
 if(q.recommended||q.minScore)filters.push(Prisma.sql`m.score>=${q.minScore||70}`);
 if(q.q)filters.push(Prisma.sql`(${vector} @@ websearch_to_tsquery('portuguese',${q.q}) OR o.id ILIKE ${pattern(q.q)} OR o."number" ILIKE ${pattern(q.q)} OR a.name ILIKE ${pattern(q.q)} OR EXISTS(SELECT 1 FROM "OpportunityItem" i WHERE i."opportunityId"=o.id AND i.description ILIKE ${pattern(q.q)}))`);
 const source=Prisma.sql`FROM "Opportunity" o JOIN "ContractingAgency" a ON a.id=o."agencyId"
 LEFT JOIN LATERAL (SELECT MAX(om.score) AS score FROM "OpportunityMatch" om JOIN "Company" c ON c.id=om."companyId" WHERE om."opportunityId"=o.id AND EXISTS(SELECT 1 FROM "Membership" ms WHERE ms."organizationId"=c."organizationId" AND ms."userId"=${userId})) m ON TRUE
 WHERE ${Prisma.join(filters," AND ")}`;
 const order=q.sort==="deadline"?Prisma.sql`o."closesAt" ASC NULLS LAST`:q.sort==="value_desc"?Prisma.sql`o."estimatedValue" DESC NULLS LAST`:q.sort==="value_asc"?Prisma.sql`o."estimatedValue" ASC NULLS LAST`:q.sort==="score"?Prisma.sql`m.score DESC NULLS LAST`:q.sort==="relevance"?Prisma.sql`${rank} DESC`:Prisma.sql`o."publishedAt" DESC`;
 const [rows,count]=await db.$transaction([
 db.$queryRaw<{id:string}[]>(Prisma.sql`SELECT o.id ${source} ORDER BY ${order},o.id ASC LIMIT 20 OFFSET ${(q.page-1)*20}`),
 db.$queryRaw<{total:bigint}[]>(Prisma.sql`SELECT count(*) AS total ${source}`)
 ],{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead});
 const items=await db.opportunity.findMany({where:{id:{in:rows.map(r=>r.id)}},select:{id:true,object:true,city:true,state:true,modalityName:true,estimatedValue:true,closesAt:true,officialStatus:true,publishedAt:true,agency:{select:{name:true}},favorites:{where:{userId},select:{id:true}},matches:{where:{company:{organization:{memberships:{some:{userId}}}}},orderBy:{score:"desc"},take:1,select:{score:true,reasons:true}},tracking:{where:{userId},select:{status:true}}}});
 items.sort((a,b)=>rows.findIndex(r=>r.id===a.id)-rows.findIndex(r=>r.id===b.id));
 const total=Number(count[0].total);return {items,total,page:q.page,pages:Math.ceil(total/20)};
}

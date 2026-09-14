import {Prisma} from "@prisma/client";
import {z} from "zod";
import {db} from "./db";
export const querySchema=z.object({
 q:z.string().max(200).default(""),state:z.string().max(2).default(""),city:z.string().max(100).default(""),agency:z.string().max(100).default(""),
 modality:z.coerce.number().int().min(0).max(20).default(0),status:z.enum(["","open","closed"]).default(""),
 favorite:z.enum(["","1"]).default(""),recommended:z.enum(["","1"]).default(""),minScore:z.coerce.number().int().min(0).max(100).default(0),
 min:z.string().regex(/^(\d{1,16}(\.\d{1,2})?)?$/).default(""),max:z.string().regex(/^(\d{1,16}(\.\d{1,2})?)?$/).default(""),
 from:z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/).default(""),to:z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/).default(""),
 deadline:z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/).default(""),
 sort:z.enum(["recent","deadline","value_desc","value_asc","score","relevance"]).default("recent"),
 page:z.coerce.number().int().min(1).max(10000).default(1)
});
export async function searchOpportunities(userId:string,params:URLSearchParams){
 const q=querySchema.parse(Object.fromEntries(params));
 const companies=await db.company.findMany({where:{organization:{memberships:{some:{userId}}}},select:{id:true}});
 const companyIds=companies.map(c=>c.id);
 const where:Prisma.OpportunityWhereInput={
 ...(q.state?{state:q.state.toUpperCase()}:{}),...(q.city?{city:{contains:q.city,mode:"insensitive"}}:{}),
 ...(q.agency?{agency:{name:{contains:q.agency,mode:"insensitive"}}}:{}),...(q.modality?{modality:q.modality}:{}),
 ...(q.min||q.max?{estimatedValue:{...(q.min?{gte:q.min}:{}),...(q.max?{lte:q.max}:{})}}:{}),
 ...(q.from||q.to?{publishedAt:{...(q.from?{gte:new Date(q.from+"T00:00:00-03:00")} :{}),...(q.to?{lte:new Date(q.to+"T23:59:59-03:00")}:{})}}:{}),
 ...(q.status==="open"?{closesAt:{gt:new Date()}}:{}),...(q.status==="closed"?{closesAt:{lte:new Date()}}:{}),
 ...(q.favorite?{favorites:{some:{userId}}}:{}),
 ...(q.recommended||q.minScore?{matches:{some:{companyId:{in:companyIds},score:{gte:q.minScore||70}}}}:{})
 };
 if(q.deadline)where.closesAt={...(typeof where.closesAt==="object"?where.closesAt:{}),lte:new Date(q.deadline+"T23:59:59-03:00")};
 if(q.q){
 // Full text index narrows IDs; exact metadata and item search supplement it.
 const ids=await db.$queryRaw<{id:string}[]>`SELECT "id" FROM "Opportunity" WHERE to_tsvector('portuguese', coalesce("object",'') || ' ' || coalesce("description",'')) @@ websearch_to_tsquery('portuguese',${q.q})`;
 where.OR=[{id:{in:ids.map(r=>r.id)}},{id:{contains:q.q,mode:"insensitive"}},{number:{contains:q.q,mode:"insensitive"}},{agency:{name:{contains:q.q,mode:"insensitive"}}},{items:{some:{description:{contains:q.q,mode:"insensitive"}}}}];
 }
 const order:Prisma.OpportunityOrderByWithRelationInput=q.sort==="deadline"?{closesAt:{sort:"asc",nulls:"last"}}:q.sort==="value_desc"?{estimatedValue:{sort:"desc",nulls:"last"}}:q.sort==="value_asc"?{estimatedValue:{sort:"asc",nulls:"last"}}:{publishedAt:"desc"};
 // Score ordering uses a database aggregate and applies the same filtered ID subquery.
 let selected:string[]|undefined;
 if(q.sort==="score"||q.sort==="relevance"){
 const eligible=await db.opportunity.findMany({where,select:{id:true}});
 if(eligible.length){
 const ranked=await db.$queryRaw<{id:string}[]>(Prisma.sql`SELECT o."id" FROM "Opportunity" o LEFT JOIN "OpportunityMatch" m ON m."opportunityId"=o."id" AND m."companyId" IN (${Prisma.join(companyIds.length?companyIds:["__none__"])}) WHERE o."id" IN (${Prisma.join(eligible.map(o=>o.id))}) GROUP BY o."id" ORDER BY MAX(m."score") DESC NULLS LAST,o."publishedAt" DESC,o."id" ASC LIMIT 20 OFFSET ${(q.page-1)*20}`);
 selected=ranked.map(r=>r.id);
 }else selected=[];
 }
 const [total,items]=await Promise.all([db.opportunity.count({where}),db.opportunity.findMany({where:selected?{id:{in:selected}}:where,orderBy:[order,{id:"asc"}],...(selected?{}:{skip:(q.page-1)*20,take:20}),select:{id:true,object:true,city:true,state:true,modalityName:true,estimatedValue:true,closesAt:true,officialStatus:true,publishedAt:true,agency:{select:{name:true}},favorites:{where:{userId},select:{id:true}},matches:{where:{companyId:{in:companyIds}},orderBy:{score:"desc"},take:1,select:{score:true,reasons:true}},tracking:{where:{userId},select:{status:true}}})]);
 if(selected)items.sort((a,b)=>selected.indexOf(a.id)-selected.indexOf(b.id));
 return {items,total,page:q.page,pages:Math.ceil(total/20)};
}

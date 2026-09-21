import {Prisma} from "@prisma/client";
import {z} from "zod";
import {db} from "./db";
const calendarDate=z.string().refine(v=>!v||(/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v),"Data inválida.").default("");
export const querySchema=z.object({
 q:z.string().max(200).default(""),state:z.string().regex(/^([A-Za-z]{2})?$/).default(""),city:z.string().max(100).default(""),agency:z.string().max(100).default(""),
 modality:z.coerce.number().int().min(0).max(20).default(0),status:z.enum(["","open","closed","unknown"]).default(""),
 favorite:z.enum(["","1"]).default(""),recommended:z.enum(["","1"]).default(""),minScore:z.coerce.number().int().min(0).max(100).default(0),
 min:z.string().regex(/^(\d{1,16}(\.\d{1,2})?)?$/).default(""),max:z.string().regex(/^(\d{1,16}(\.\d{1,2})?)?$/).default(""),
 from:calendarDate,to:calendarDate,deadline:calendarDate,
 sort:z.enum(["recent","deadline","value_desc","value_asc","score","relevance"]).default("recent"),
 page:z.coerce.number().int().min(1).max(10000).default(1)
}).refine(v=>!v.min||!v.max||new Prisma.Decimal(v.min).lte(v.max),"Faixa de valor inválida.")
.refine(v=>!v.from||!v.to||v.from<=v.to,"Período inválido.");
export async function searchOpportunities(userId:string,params:URLSearchParams){
 const q=querySchema.parse(Object.fromEntries(params));
 const minScore=Math.max(q.minScore,q.recommended?70:0);
 const where:Prisma.OpportunityWhereInput={};
 const and:Prisma.OpportunityWhereInput[]=[];
 if(q.state)and.push({state:q.state.toUpperCase()});
 if(q.city)and.push({city:q.city});
 if(q.agency)and.push({agency:{name:{contains:q.agency}}});
 if(q.modality)and.push({modality:q.modality});
 if(q.min||q.max)and.push({estimatedValue:{...(q.min?{gte:new Prisma.Decimal(q.min)}:{}),...(q.max?{lte:new Prisma.Decimal(q.max)}:{})}});
 if(q.from||q.to)and.push({publishedAt:{...(q.from?{gte:new Date(q.from+"T00:00:00-03:00")} : {}),...(q.to?{lte:new Date(q.to+"T23:59:59.999-03:00")} : {})}});
 if(q.deadline)and.push({closesAt:{lte:new Date(q.deadline+"T23:59:59.999-03:00")}});
 if(q.status==="open")and.push({closesAt:{gt:new Date()}});
 if(q.status==="unknown")and.push({closesAt:null});
 if(q.status==="closed")and.push({closesAt:{lte:new Date()}});
 if(q.favorite)and.push({favorites:{some:{userId}}});
 if(q.recommended||q.minScore)and.push({matches:{some:{score:{gte:minScore},company:{organization:{memberships:{some:{userId}}}}}}});
 if(q.q)and.push({OR:[
  {object:{contains:q.q}},{description:{contains:q.q}},{id:{contains:q.q}},{number:{contains:q.q}},
  {agency:{name:{contains:q.q}}},{items:{some:{description:{contains:q.q}}}}
 ]});
 if(and.length)where.AND=and;
 const orderBy:Prisma.OpportunityOrderByWithRelationInput[]=
  q.sort==="deadline"?[{closesAt:"asc"},{id:"asc"}]:
  q.sort==="value_desc"?[{estimatedValue:"desc"},{id:"asc"}]:
  q.sort==="value_asc"?[{estimatedValue:"asc"},{id:"asc"}]:
  [{publishedAt:"desc"},{id:"asc"}];
 const [items,total]=await db.$transaction([
  db.opportunity.findMany({where,orderBy,skip:(q.page-1)*20,take:20,select:{id:true,object:true,description:true,detailsSyncedAt:true,city:true,state:true,modalityName:true,estimatedValue:true,closesAt:true,officialStatus:true,publishedAt:true,agency:{select:{name:true}},favorites:{where:{userId},select:{id:true}},matches:{where:{company:{organization:{memberships:{some:{userId}}}}},orderBy:{score:"desc"},take:1,select:{score:true,reasons:true}},tracking:{where:{userId},select:{status:true}}}}),
  db.opportunity.count({where})
 ]);
 if(q.sort==="score")items.sort((a,b)=>(b.matches[0]?.score??-1)-(a.matches[0]?.score??-1));
 return {items,total,page:q.page,pages:Math.ceil(total/20)};
}

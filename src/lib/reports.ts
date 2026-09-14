import {Prisma} from "@prisma/client";
import {z} from "zod";
import {db} from "./db";
const input=z.object({group:z.enum(["state","agency","modality","period","value"]).default("state"),scope:z.enum(["all","recommended","tracked"]).default("all"),from:z.string().date().optional(),to:z.string().date().optional()});
export async function report(userId:string,params:URLSearchParams){
 const v=input.parse(Object.fromEntries([...params].filter(([,value])=>value!==""&&value!=="csv")));
 const group={state:Prisma.sql`o.state`,agency:Prisma.sql`a.name`,modality:Prisma.sql`o."modalityName"`,period:Prisma.sql`to_char(o."publishedAt",'YYYY-MM')`,value:Prisma.sql`CASE WHEN o."estimatedValue" IS NULL THEN 'Não informado' WHEN o."estimatedValue"<100000 THEN 'Até R$ 100 mil' WHEN o."estimatedValue"<1000000 THEN 'R$ 100 mil a R$ 1 milhão' ELSE 'A partir de R$ 1 milhão' END`}[v.group];
 const where=[Prisma.sql`TRUE`];
 if(v.from)where.push(Prisma.sql`o."publishedAt">=${new Date(v.from+"T00:00:00-03:00")}`);
 if(v.to)where.push(Prisma.sql`o."publishedAt"<=${new Date(v.to+"T23:59:59.999-03:00")}`);
 if(v.scope==="tracked")where.push(Prisma.sql`EXISTS(SELECT 1 FROM "OpportunityTracking" t WHERE t."opportunityId"=o.id AND t."userId"=${userId})`);
 if(v.scope==="recommended")where.push(Prisma.sql`EXISTS(SELECT 1 FROM "OpportunityMatch" m JOIN "Company" c ON c.id=m."companyId" JOIN "Membership" u ON u."organizationId"=c."organizationId" WHERE m."opportunityId"=o.id AND u."userId"=${userId} AND m.score>=70)`);
 const result=await db.$queryRaw<{label:string;count:bigint;value:Prisma.Decimal|null}[]>(Prisma.sql`SELECT ${group} AS label,count(*) AS count,sum(o."estimatedValue") AS value FROM "Opportunity" o JOIN "ContractingAgency" a ON a.id=o."agencyId" WHERE ${Prisma.join(where," AND ")} GROUP BY ${group} ORDER BY count DESC,label ASC LIMIT 501`);
 return {rows:result.slice(0,500).map(r=>({...r,count:Number(r.count)})),truncated:result.length>500};
}
export function csvCell(value:unknown){const s=String(value??"");return '"'+(/^[=+\-@\t\r\n]/.test(s)?"'":"")+s.replace(/"/g,'""')+'"';}

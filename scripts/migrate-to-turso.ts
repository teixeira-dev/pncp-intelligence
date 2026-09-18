import {createClient,type InValue} from "@libsql/client";
import {db} from "../src/lib/db";

const tables=[
"User","Organization","ContractingAgency","RateLimit","SyncJob","SyncCursor","JobRequest","SyncPartition",
"Membership","Session","PasswordReset","Company","Opportunity","Alert","SyncLog","DetailImport",
"OpportunityItem","OpportunityDocument","OpportunityMatch","Favorite","OpportunityTracking","Notification",
"AIAnalysis","AuditLog","DetailPage"
] as const;

const jsonColumns=new Set([
"Company.keywords","Company.excludedTerms","Company.regions","Company.modalities",
"Opportunity.raw","OpportunityItem.raw","OpportunityMatch.reasons","AIAnalysis.result","DetailPage.payload",
"Alert.keywords"
]);

function value(table:string,key:string,v:unknown):InValue{
 if(v===null||v===undefined)return null;
 if(v instanceof Date)return v.toISOString();
 if(typeof v==="boolean")return v?1:0;
 if(typeof v==="string"||typeof v==="number"||typeof v==="bigint"||v instanceof Uint8Array)return v;
 if(jsonColumns.has(table+"."+key)||Array.isArray(v))return JSON.stringify(v);
 if(typeof v==="object"&&v&&v.constructor?.name==="Decimal")return String(v);
 if(typeof v==="object")return JSON.stringify(v);
 return String(v);
}
function q(name:string){return '"'+name.replaceAll('"','""')+'"';}

async function main(){
 const url=process.env.TURSO_DATABASE_URL,authToken=process.env.TURSO_AUTH_TOKEN;
 if(!url||!authToken)throw new Error("TURSO_DATABASE_URL/TURSO_AUTH_TOKEN não configurados.");
 const target=createClient({url,authToken});
 const ddl=(await import("node:fs/promises")).readFile(new URL("./turso-schema.sql",import.meta.url),"utf8");
 await target.executeMultiple(await ddl);
 const report:Record<string,{source:number,target:number}>={};
 for(const table of tables){
   const countRows=await db.$queryRawUnsafe<{count:bigint}[]>(`SELECT COUNT(*)::bigint AS count FROM ${q(table)}`);
   const source=Number(countRows[0]?.count??0);
   let offset=0;
   while(offset<source){
     const rows=await db.$queryRawUnsafe<Record<string,unknown>[]>(`SELECT * FROM ${q(table)} ORDER BY 1 LIMIT 100 OFFSET ${offset}`);
     if(!rows.length)break;
     const statements=rows.map(row=>{
       const keys=Object.keys(row);
       return {sql:`INSERT OR REPLACE INTO ${q(table)} (${keys.map(q).join(",")}) VALUES (${keys.map(()=>"?").join(",")})`,args:keys.map(k=>value(table,k,row[k]))};
     });
     await target.batch(statements,"write");
     offset+=rows.length;
     console.info(JSON.stringify({event:"TURSO_COPY_PROGRESS",table,copied:offset,total:source}));
   }
   const targetResult=await target.execute(`SELECT COUNT(*) AS count FROM ${q(table)}`);
   const targetCount=Number(targetResult.rows[0]?.count??0);
   report[table]={source,target:targetCount};
   if(source!==targetCount)throw new Error(`Contagem divergente em ${table}: PostgreSQL=${source}, Turso=${targetCount}`);
 }
 console.info(JSON.stringify({event:"TURSO_MIGRATION_VALIDATED",report}));
 target.close();
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>db.$disconnect());

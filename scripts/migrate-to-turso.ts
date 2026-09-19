import {createClient,type InValue} from "@libsql/client";
import {PrismaClient} from "@prisma/client";

const tables=["User","Organization","ContractingAgency","RateLimit","SyncJob","SyncCursor","JobRequest","SyncPartition","Membership","Session","PasswordReset","Company","Opportunity","Alert","SyncLog","DetailImport","OpportunityItem","OpportunityDocument","OpportunityMatch","Favorite","OpportunityTracking","Notification","AIAnalysis","AuditLog","DetailPage"] as const;
const jsonColumns=new Set(["Company.keywords","Company.excludedTerms","Company.regions","Company.modalities","Opportunity.raw","OpportunityItem.raw","OpportunityMatch.reasons","AIAnalysis.result","DetailPage.payload","Alert.keywords"]);
function value(table:string,key:string,v:unknown):InValue{
 if(v===null||v===undefined)return null;if(v instanceof Date)return v.toISOString();if(typeof v==="boolean")return v?1:0;
 if(typeof v==="string"||typeof v==="number"||typeof v==="bigint"||v instanceof Uint8Array)return v;
 if(jsonColumns.has(table+"."+key)||Array.isArray(v))return JSON.stringify(v);
 if(typeof v==="object"&&v&&(v as any).constructor?.name==="Decimal")return String(v);
 if(typeof v==="object")return JSON.stringify(v);return String(v);
}
function q(name:string){return '"'+name.replaceAll('"','""')+'"';}
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
function retryable(e:any){const m=String(e?.message??"");return e?.code==="P1017"||m.includes("closed the connection")||m.includes("not yet accepting connections")||m.includes("Consistent recovery state")||m.includes("starting up")||m.includes("recovery mode");}
async function pg<T>(fn:(db:PrismaClient)=>Promise<T>):Promise<T>{
 for(let attempt=0;attempt<30;attempt++){const db=new PrismaClient();try{return await fn(db)}catch(e){if(!retryable(e)||attempt===29)throw e;const waitMs=Math.min(5000*(attempt+1),60000);console.warn(JSON.stringify({event:"POSTGRES_RECOVERY_WAIT",attempt:attempt+1,waitMs}));await sleep(waitMs)}finally{await db.$disconnect().catch(()=>{})}}
 throw new Error("PostgreSQL retry exhausted");
}
async function primaryKeyColumns(table:string){
 const rows=await pg(db=>db.$queryRawUnsafe<{column_name:string}[]>(`SELECT a.attname AS column_name FROM pg_index i JOIN LATERAL unnest(i.indkey) WITH ORDINALITY AS k(attnum,ord) ON true JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.attnum WHERE i.indrelid=(quote_ident('public')||'.'||quote_ident($1))::regclass AND i.indisprimary ORDER BY k.ord`,table));
 if(rows.length)return rows.map(r=>r.column_name);
 const fallback=await pg(db=>db.$queryRawUnsafe<{column_name:string}[]>(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position LIMIT 1`,table));
 if(!fallback[0]?.column_name)throw new Error(`Sem coluna de paginação para ${table}`);return [fallback[0].column_name];
}
async function main(){
 const url=process.env.TURSO_DATABASE_URL,authToken=process.env.TURSO_AUTH_TOKEN;if(!url||!authToken)throw new Error("TURSO_DATABASE_URL/TURSO_AUTH_TOKEN não configurados.");
 const target=createClient({url,authToken});await target.execute("PRAGMA foreign_keys=OFF");
 const ddl=await (await import("node:fs/promises")).readFile(new URL("./turso-schema.sql",import.meta.url),"utf8");await target.executeMultiple(ddl);
 const report:Record<string,{source:number,target:number}>={};
 for(const table of tables){
  const countRows=await pg(db=>db.$queryRawUnsafe<{count:bigint}[]>(`SELECT COUNT(*)::bigint AS count FROM ${q(table)}`));const source=Number(countRows[0]?.count??0);
  const keys=await primaryKeyColumns(table);const order=keys.map(q).join(",");let copied=0;let lastKey:unknown[]|null=null;
  while(copied<source){
   const rows=lastKey===null
    ? await pg(db=>db.$queryRawUnsafe<Record<string,unknown>[]>(`SELECT * FROM ${q(table)} ORDER BY ${order} LIMIT 25`))
    : await pg(db=>db.$queryRawUnsafe<Record<string,unknown>[]>(`SELECT * FROM ${q(table)} WHERE (${order}) > (${keys.map((_,i)=>"$"+(i+1)).join(",")}) ORDER BY ${order} LIMIT 25`,...lastKey));
   if(!rows.length)break;
   const statements=rows.map(row=>{const cols=Object.keys(row);return {sql:`INSERT OR REPLACE INTO ${q(table)} (${cols.map(q).join(",")}) VALUES (${cols.map(()=>"?").join(",")})`,args:cols.map(k=>value(table,k,row[k]))}});
   for(let i=0;i<statements.length;i+=10)await target.batch(statements.slice(i,i+10),"write");
   copied+=rows.length;lastKey=keys.map(k=>rows[rows.length-1][k]);console.info(JSON.stringify({event:"TURSO_COPY_PROGRESS",table,copied,total:source}));
  }
  const targetResult=await target.execute(`SELECT COUNT(*) AS count FROM ${q(table)}`);const targetCount=Number(targetResult.rows[0]?.count??0);report[table]={source,target:targetCount};
  if(source!==targetCount)throw new Error(`Contagem divergente em ${table}: PostgreSQL=${source}, Turso=${targetCount}`);
 }
 await target.execute("PRAGMA foreign_keys=ON");console.info(JSON.stringify({event:"TURSO_MIGRATION_VALIDATED",report}));target.close();
}
main().catch(e=>{console.error(e);process.exitCode=1});

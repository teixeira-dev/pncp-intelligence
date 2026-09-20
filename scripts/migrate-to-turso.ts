import {createClient,type InValue} from "@libsql/client";
import {PrismaClient} from "@prisma/client";
import pgDriver from "pg";

const tables=["User","Organization","ContractingAgency","RateLimit","SyncJob","SyncCursor","JobRequest","SyncPartition","Membership","Session","PasswordReset","Company","Opportunity","Alert","SyncLog","DetailImport","OpportunityItem","OpportunityDocument","OpportunityMatch","Favorite","OpportunityTracking","Notification","AIAnalysis","AuditLog","DetailPage"] as const;
const jsonColumns=new Set(["Company.keywords","Company.excludedTerms","Company.regions","Company.modalities","Opportunity.raw","OpportunityItem.raw","OpportunityMatch.reasons","AIAnalysis.result","DetailPage.payload","Alert.keywords"]);
function value(table:string,key:string,v:unknown):InValue{
 if(v===null||v===undefined)return null;if(v instanceof Date)return v.toISOString();if(typeof v==="boolean")return v?1:0;
 if(typeof v==="string"||typeof v==="number"||typeof v==="bigint"||v instanceof Uint8Array)return v;
 if(jsonColumns.has(table+"."+key)||Array.isArray(v))return JSON.stringify(v);
 if(typeof v==="object"&&v){
  const ctor=(v as any).constructor?.name;
  if(ctor==="Decimal"||ctor==="Numeric"){
   const s=String(v);
   const n=Number(s);
   return Number.isFinite(n)?n:s;
  }
 }
 if(typeof v==="object")return JSON.stringify(v);return String(v);
}
function q(name:string){return '"'+name.replaceAll('"','""')+'"';}
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
function retryable(e:any){const m=String(e?.message??"");return e?.code==="P1017"||m.includes("closed the connection")||m.includes("not yet accepting connections")||m.includes("Consistent recovery state")||m.includes("starting up")||m.includes("recovery mode");}
const {Client:PgClient}=pgDriver;
async function pg<T extends Record<string,unknown>>(sql:string,params:unknown[]=[]):Promise<T[]>{
 for(let attempt=0;attempt<30;attempt++){
  const db=new PgClient({connectionString:process.env.DATABASE_URL});
  try{await db.connect();const result=await db.query(sql,params);return result.rows as T[]}
  catch(e){if(!retryable(e)||attempt===29)throw e;const waitMs=Math.min(5000*(attempt+1),60000);console.warn(JSON.stringify({event:"POSTGRES_RECOVERY_WAIT",attempt:attempt+1,waitMs}));await sleep(waitMs)}
  finally{await db.end().catch(()=>{})}
 }
 throw new Error("PostgreSQL retry exhausted");
}
async function primaryKeyColumns(table:string):Promise<string[]>{
 const rows: Array<{column_name:string}> = await pg<{column_name:string}>(`SELECT a.attname AS column_name FROM pg_index i JOIN LATERAL unnest(i.indkey) WITH ORDINALITY AS k(attnum,ord) ON true JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.attnum WHERE i.indrelid=(quote_ident('public')||'.'||quote_ident($1))::regclass AND i.indisprimary ORDER BY k.ord`,[table]);
 if(rows.length)return rows.map(r=>r.column_name);
 const fallback: Array<{column_name:string}> = await pg<{column_name:string}>(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position LIMIT 1`,[table]);
 if(!fallback[0]?.column_name)throw new Error(`Sem coluna de paginação para ${table}`);return [fallback[0].column_name];
}
async function main():Promise<void>{
 const url=process.env.TURSO_DATABASE_URL,authToken=process.env.TURSO_AUTH_TOKEN;if(!url||!authToken)throw new Error("TURSO_DATABASE_URL/TURSO_AUTH_TOKEN não configurados.");
 const target=createClient({url,authToken});await target.execute("PRAGMA foreign_keys=OFF");
 const ddl=await (await import("node:fs/promises")).readFile(new URL("./turso-schema.sql",import.meta.url),"utf8");await target.executeMultiple(ddl);
 const report:Record<string,{source:number,target:number}>={};
 const mutableTables=new Set(["Session","RateLimit","PasswordReset","JobRequest","Favorite","OpportunityTracking","Notification","AuditLog","AIAnalysis"]);
 for(const table of tables){
  const countRows=await pg<{count:string}>(`SELECT COUNT(*)::bigint AS count FROM ${q(table)}`);const source=Number(countRows[0]?.count??0);
  const keys=await primaryKeyColumns(table);const order=keys.map(q).join(",");let copied=0;let lastKey:unknown[]|null=null;
  while(copied<source){
   let rows:Array<Record<string,unknown>>;
   if(lastKey===null){
    rows=await pg<Record<string,unknown>>(`SELECT * FROM ${q(table)} ORDER BY ${order} LIMIT 25`);
   }else{
    const cursor:unknown[]=lastKey;
    rows=await pg<Record<string,unknown>>(`SELECT * FROM ${q(table)} WHERE (${order}) > (${keys.map((_:string,i:number)=>"$"+(i+1)).join(",")}) ORDER BY ${order} LIMIT 25`,cursor);
   }
   if(!rows.length)break;
   const statements=rows.map((row:Record<string,unknown>)=>{const cols=Object.keys(row);return {sql:`INSERT OR REPLACE INTO ${q(table)} (${cols.map(q).join(",")}) VALUES (${cols.map(()=>"?").join(",")})`,args:cols.map(k=>value(table,k,row[k]))}});
   for(let i=0;i<statements.length;i+=10)await target.batch(statements.slice(i,i+10),"write");
   copied+=rows.length;lastKey=keys.map(k=>rows[rows.length-1][k]);console.info(JSON.stringify({event:"TURSO_COPY_PROGRESS",table,copied,total:source}));
  }
  const targetResult=await target.execute(`SELECT COUNT(*) AS count FROM ${q(table)}`);const targetCount=Number(targetResult.rows[0]?.count??0);report[table]={source,target:targetCount};
  if(source!==targetCount&&!mutableTables.has(table))throw new Error(`Contagem divergente em ${table}: PostgreSQL=${source}, Turso=${targetCount}`);
  if(source!==targetCount&&mutableTables.has(table))console.warn(JSON.stringify({event:"TURSO_MUTABLE_COUNT_DIVERGENCE",table,source,target:targetCount}));
 }
 await target.execute("PRAGMA foreign_keys=ON");console.info(JSON.stringify({event:"TURSO_MIGRATION_VALIDATED",report}));target.close();
}
main().catch(e=>{console.error(e);process.exitCode=1});

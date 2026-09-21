import {createClient,type InValue} from "@libsql/client";
import pgDriver from "pg";

const tables=["User","Organization","Membership","Company","Alert","Favorite","OpportunityTracking","Notification","AIAnalysis","AuditLog"] as const;
const jsonColumns=new Set(["Company.keywords","Company.excludedTerms","Company.regions","Company.modalities","Alert.keywords","AIAnalysis.result"]);
const numericColumns=new Set(["Company.minValue","Company.maxValue","Alert.minValue","Alert.maxValue"]);
function q(s:string){return '"'+s.replaceAll('"','""')+'"'}
function value(table:string,key:string,v:any):InValue{
 if(v===null||v===undefined)return null;
 if(v instanceof Date)return v.toISOString();
 if(typeof v==="boolean")return v?1:0;
 if(numericColumns.has(table+"."+key)){const n=Number(v);return Number.isFinite(n)?n:null}
 if(jsonColumns.has(table+"."+key)&&typeof v!=="string")return JSON.stringify(v);
 if(typeof v==="string"||typeof v==="number"||typeof v==="bigint"||v instanceof Uint8Array)return v;
 return JSON.stringify(v);
}
const {Client}=pgDriver;
async function main(){
 const url=process.env.TURSO_DATABASE_URL,authToken=process.env.TURSO_AUTH_TOKEN,databaseUrl=process.env.DATABASE_URL;
 if(!url||!authToken||!databaseUrl)throw new Error("DATABASE_URL/TURSO_DATABASE_URL/TURSO_AUTH_TOKEN required");
 const pg=new Client({connectionString:databaseUrl});await pg.connect();
 const turso=createClient({url,authToken});await turso.execute("PRAGMA foreign_keys=OFF");
 const report:Record<string,{postgres:number,before:number,after:number,upserted:number}>={};
 try{
  for(const table of tables){
   const src=await pg.query(`SELECT * FROM ${q(table)} ORDER BY 1`);
   const before=Number((await turso.execute(`SELECT COUNT(*) count FROM ${q(table)}`)).rows[0]?.count??0);
   let upserted=0;
   for(let i=0;i<src.rows.length;i+=25){
    const batch=src.rows.slice(i,i+25).map((row:any)=>{const cols=Object.keys(row);return {sql:`INSERT OR REPLACE INTO ${q(table)} (${cols.map(q).join(",")}) VALUES (${cols.map(()=>"?").join(",")})`,args:cols.map(k=>value(table,k,row[k]))}});
    if(batch.length){await turso.batch(batch,"write");upserted+=batch.length}
   }
   const after=Number((await turso.execute(`SELECT COUNT(*) count FROM ${q(table)}`)).rows[0]?.count??0);
   report[table]={postgres:src.rows.length,before,after,upserted};
   console.info(JSON.stringify({event:"TURSO_RECONCILE_TABLE",table,...report[table]}));
  }
  console.info(JSON.stringify({event:"TURSO_FINAL_RECONCILE_COMPLETED",report}));
 }finally{await pg.end().catch(()=>{});turso.close()}
}
main().catch(e=>{console.error(JSON.stringify({event:"TURSO_FINAL_RECONCILE_FAILED",message:e instanceof Error?e.message:String(e)}));process.exitCode=1});

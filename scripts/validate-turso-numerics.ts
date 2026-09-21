import {createClient} from "@libsql/client";
const checks=[
 ["Opportunity","estimatedValue"],
 ["Company","minValue"],["Company","maxValue"],
 ["Alert","minValue"],["Alert","maxValue"],
 ["OpportunityItem","quantity"],["OpportunityItem","unitValue"],
] as const;
const q=(s:string)=>'"'+s.replaceAll('"','""')+'"';
async function main(){
 const url=process.env.TURSO_DATABASE_URL,authToken=process.env.TURSO_AUTH_TOKEN;
 if(!url||!authToken)throw new Error("Turso not configured");
 const db=createClient({url,authToken});let repaired=0;
 try{
  for(const [table,column] of checks){
   const sql=`SELECT COUNT(*) count FROM ${q(table)} WHERE ${q(column)} IS NOT NULL AND typeof(${q(column)})='text'`;
   const before=Number((await db.execute(sql)).rows[0]?.count??0);
   if(before){
    const r=await db.execute(`UPDATE ${q(table)} SET ${q(column)}=CAST(trim(${q(column)}, '"') AS REAL) WHERE ${q(column)} IS NOT NULL AND typeof(${q(column)})='text'`);
    repaired+=r.rowsAffected;
   }
   const after=Number((await db.execute(sql)).rows[0]?.count??0);
   console.info(JSON.stringify({event:"TURSO_NUMERIC_CHECK",table,column,before,after}));
   if(after!==0)throw new Error(`Numeric normalization failed: ${table}.${column}=${after}`);
  }
  console.info(JSON.stringify({event:"TURSO_NUMERIC_VALIDATION_COMPLETED",repaired}));
 }finally{db.close()}
}
main().catch(e=>{console.error(JSON.stringify({event:"TURSO_NUMERIC_VALIDATION_FAILED",message:e instanceof Error?e.message:String(e)}));process.exitCode=1});

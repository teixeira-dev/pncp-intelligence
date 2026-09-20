import {db} from "@/lib/db";
import {createClient} from "@libsql/client";
export const dynamic="force-dynamic";
export async function GET(){
 try{
  const url=process.env.TURSO_DATABASE_URL;
  const authToken=process.env.TURSO_AUTH_TOKEN;
  if(!url||!authToken) throw new Error("Turso não configurado");
  const client=createClient({url,authToken});
  const before=await client.execute("SELECT COUNT(*) AS n FROM OpportunityItem WHERE typeof(quantity)='text' OR typeof(unitValue)='text'");
  const repaired=await client.execute(`UPDATE OpportunityItem SET
    quantity = CASE WHEN typeof(quantity)='text' THEN CAST(trim(quantity, '"') AS REAL) ELSE quantity END,
    unitValue = CASE WHEN typeof(unitValue)='text' THEN CAST(trim(unitValue, '"') AS REAL) ELSE unitValue END
    WHERE typeof(quantity)='text' OR typeof(unitValue)='text'`);
  const after=await client.execute("SELECT COUNT(*) AS n FROM OpportunityItem WHERE typeof(quantity)='text' OR typeof(unitValue)='text'");
  const id="22855159000120-1-000137/2026";
  const row=await db.opportunity.findUnique({where:{id},include:{agency:true,items:{take:3},documents:{take:3}}});
  return Response.json({ok:true,repaired:Number(repaired.rowsAffected),before:Number(before.rows[0]?.n??0),after:Number(after.rows[0]?.n??0),found:!!row,items:row?.items.length??0,documents:row?.documents.length??0});
 }catch(error){
  const e=error as {name?:string;code?:string;message?:string;meta?:unknown};
  console.error(JSON.stringify({event:"TURSO_DETAIL_DIAGNOSTIC",name:e.name,code:e.code,message:e.message,meta:e.meta}));
  return Response.json({ok:false,name:e.name,code:e.code,message:e.message},{status:500});
 }
}

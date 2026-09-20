import {db} from "@/lib/db";
export const dynamic="force-dynamic";
export async function GET(){
 try{
  const id="22855159000120-1-000137/2026";
  const row=await db.opportunity.findUnique({
   where:{id},
   include:{agency:true,items:{take:3},documents:{take:3}}
  });
  return Response.json({ok:true,found:!!row,items:row?.items.length??0,documents:row?.documents.length??0});
 }catch(error){
  const e=error as {name?:string;code?:string;message?:string;meta?:unknown};
  console.error(JSON.stringify({event:"TURSO_DETAIL_DIAGNOSTIC",name:e.name,code:e.code,message:e.message,meta:e.meta}));
  return Response.json({ok:false,name:e.name,code:e.code,message:e.message},{status:500});
 }
}

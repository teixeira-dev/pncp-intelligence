import {db} from "@/lib/db";
export const dynamic="force-dynamic";
export async function GET(){
 try{
  await db.user.count();
  return Response.json({status:"ok",database:"turso"},{headers:{"Cache-Control":"no-store"}});
 }catch(error){
  console.error(JSON.stringify({event:"HEALTH_DATABASE_FAILED",error:error instanceof Error?error.message:"unknown"}));
  return Response.json({status:"unavailable"},{status:503});
 }
}

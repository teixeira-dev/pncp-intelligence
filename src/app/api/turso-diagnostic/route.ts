export const dynamic="force-dynamic";
export async function GET(){
 return Response.json({status:"removed"},{status:410,headers:{"Cache-Control":"no-store"}});
}

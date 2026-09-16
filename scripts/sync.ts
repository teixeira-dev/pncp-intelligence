import {runSync} from "../src/lib/sync";
import {db} from "../src/lib/db";
import {syncError} from "../src/lib/sync-error";
async function main(){
 const previous=await db.syncJob.findFirst({orderBy:{startedAt:"desc"},select:{id:true,status:true,received:true,created:true,updated:true,error:true}});
 console.info(JSON.stringify({event:"SYNC_PROCESS_STARTED",opportunities:await db.opportunity.count(),previous:previous?{...previous,error:previous.status==="FAILED"&&previous.error?syncError(new Error(previous.error)):null}:null}));
 await runSync();
 console.info(JSON.stringify({event:"SYNC_PROCESS_COMPLETED",opportunities:await db.opportunity.count()}));
}
main().catch(error=>{console.error(JSON.stringify({event:"SYNC_PROCESS_FAILED",error:syncError(error)}));process.exitCode=1;}).finally(()=>db.$disconnect());

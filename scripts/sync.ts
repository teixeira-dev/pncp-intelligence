import {runSync} from "../src/lib/sync";
import {db} from "../src/lib/db";
runSync().catch(()=>{console.error(JSON.stringify({event:"SYNC_PROCESS_FAILED"}));process.exitCode=1;}).finally(()=>db.$disconnect());

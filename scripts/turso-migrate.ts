import {createClient} from "@libsql/client";
import {readFile} from "node:fs/promises";
async function main(){
 const url=process.env.TURSO_DATABASE_URL,authToken=process.env.TURSO_AUTH_TOKEN;
 if(!url)throw new Error("TURSO_DATABASE_URL não configurada.");
 const sql=await readFile(new URL("../prisma/turso.sql",import.meta.url),"utf8");
 const client=createClient({url,authToken});
 await client.executeMultiple(sql);
 client.close();
 console.log("Turso schema ready.");
}
main().catch(e=>{console.error(e);process.exitCode=1;});

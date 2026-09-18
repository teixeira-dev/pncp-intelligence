import {PrismaClient} from "@prisma/client";
import {PrismaLibSQL} from "@prisma/adapter-libsql";
const g=globalThis as unknown as {db?:PrismaClient};
function client(){
 const url=process.env.TURSO_DATABASE_URL;
 const authToken=process.env.TURSO_AUTH_TOKEN;
 if(!url)throw new Error("TURSO_DATABASE_URL não configurada.");
 return new PrismaClient({adapter:new PrismaLibSQL({url,authToken})});
}
export const db=g.db??client();
if(process.env.NODE_ENV!=="production")g.db=db;

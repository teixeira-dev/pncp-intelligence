import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";

const g=globalThis as unknown as {db?:PrismaClient};

function createDb(){
 const url=process.env.TURSO_DATABASE_URL;
 const authToken=process.env.TURSO_AUTH_TOKEN;
 if(!url||!authToken)throw new Error("TURSO_DATABASE_URL/TURSO_AUTH_TOKEN não configurados.");
 return new PrismaClient({adapter:new PrismaLibSQL({url,authToken})});
}

export const db=new Proxy({} as PrismaClient,{
 get(_target,prop,receiver){
  if(!g.db)g.db=createDb();
  const value=Reflect.get(g.db,prop,receiver);
  return typeof value==="function"?value.bind(g.db):value;
 }
});

import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";

const url=process.env.TURSO_DATABASE_URL;
const authToken=process.env.TURSO_AUTH_TOKEN;
if(!url||!authToken)throw new Error("TURSO_DATABASE_URL/TURSO_AUTH_TOKEN não configurados.");
const adapter=new PrismaLibSQL({url,authToken});
const g=globalThis as unknown as {db?:PrismaClient};
export const db=g.db??new PrismaClient({adapter});
if(process.env.NODE_ENV!=="production")g.db=db;

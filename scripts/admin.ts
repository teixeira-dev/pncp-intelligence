import {db} from "../src/lib/db";
import {passwordHash} from "../src/lib/auth";
import {password} from "../src/lib/validation";
import {z} from "zod";
async function main(){
 const email=z.string().email().parse(process.env.ADMIN_EMAIL).toLowerCase();
 const secret=password.parse(process.env.ADMIN_PASSWORD);
 if(await db.user.findUnique({where:{email}}))throw new Error("User already exists; not modifying credentials.");
 await db.user.create({data:{email,name:process.env.ADMIN_NAME??"Administrador",passwordHash:await passwordHash(secret),role:"ADMIN",memberships:{create:{organization:{create:{name:"Organização inicial"}}}}}});
 console.log("Administrator created. Remove ADMIN_PASSWORD from environment.");
}main().catch(()=>{console.error("ADMIN_CREATE_FAILED: verify input and database.");process.exitCode=1;}).finally(()=>db.$disconnect());

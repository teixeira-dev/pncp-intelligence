import {db} from "../src/lib/db";
import {passwordHash} from "../src/lib/auth";
async function main(){
 if(process.env.NODE_ENV!=="development"||process.env.ALLOW_DEV_SEED!=="yes")throw new Error("Development-only seed. Set NODE_ENV=development and ALLOW_DEV_SEED=yes.");
 if(!process.env.ADMIN_PASSWORD)throw new Error("Set ADMIN_PASSWORD with a development-only password.");
 const email="demo@example.test";
 await db.user.upsert({where:{email},update:{},create:{email,name:"Demonstração",passwordHash:await passwordHash(process.env.ADMIN_PASSWORD),memberships:{create:{organization:{create:{name:"Empresa demonstrativa"}}}}}});
 console.log("Development user ready: demo@example.test. No fabricated official opportunities inserted.");
}main().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>db.$disconnect());

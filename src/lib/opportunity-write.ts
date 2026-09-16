import {Prisma} from "@prisma/client";
import {canonicalHash,normalizeOpportunity} from "./pncp";
export async function writeOpportunity(tx:Prisma.TransactionClient,raw:unknown){
 const n=normalizeOpportunity(raw);
 const old=await tx.opportunity.findUnique({where:{id:n.opportunity.id},select:{contentHash:true,detailsHash:true,raw:true}});
 if(old?.contentHash===n.opportunity.contentHash)return "unchanged" as const;
 // Upgrade legacy hashes without invalidating already imported details or restarting checkpoints.
 if(old&&canonicalHash(old.raw)===n.opportunity.contentHash){
 await tx.opportunity.update({where:{id:n.opportunity.id},data:{contentHash:n.opportunity.contentHash,...(old.detailsHash===old.contentHash?{detailsHash:n.opportunity.contentHash}:{})}});
 await tx.detailImport.updateMany({where:{opportunityId:n.opportunity.id,contentHash:old.contentHash},data:{contentHash:n.opportunity.contentHash}});
 return "unchanged" as const;
 }
 await tx.contractingAgency.upsert({where:{id:n.agency.id},create:n.agency,update:n.agency});
 await tx.opportunity.upsert({where:{id:n.opportunity.id},create:n.opportunity,update:n.opportunity});
 return old?"updated" as const:"created" as const;
}

import {z} from "zod";
import {db} from "./db";
import {fetchJson,wait} from "./pncp";
const itemSchema=z.object({numeroItem:z.number().int(),descricao:z.string(),quantidade:z.number().nullish(),unidadeMedida:z.string().nullish(),valorUnitarioEstimado:z.number().nullish(),orcamentoSigiloso:z.boolean().optional()}).passthrough();
const documentSchema=z.object({sequencialDocumento:z.number().int(),titulo:z.string(),tipoDocumentoNome:z.string().nullish(),statusAtivo:z.boolean().optional()}).passthrough();
export async function enrichOpportunity(id:string){
 const o=await db.opportunity.findUniqueOrThrow({where:{id}});
 if(!/^\d{14}$/.test(o.agencyId)||!Number.isInteger(o.year)||!Number.isInteger(o.sequence))throw new Error("INVALID_OFFICIAL_REFERENCE");
 const base=`https://pncp.gov.br/api/pncp/v1/orgaos/${o.agencyId}/compras/${o.year}/${o.sequence}`;
 // Stage all bounded pages before replacing data; a partial failure preserves previous data.
 const items:z.infer<typeof itemSchema>[]=[],documents:z.infer<typeof documentSchema>[]=[];
 for(const kind of ["itens","arquivos"] as const){
 for(let page=1;page<=200;page++){
 const result=await fetchJson(new URL(`${base}/${kind}?pagina=${page}&tamanhoPagina=50`));
 const rows=Array.isArray(result)?result:result?.data;
 if(!Array.isArray(rows))throw new Error("PNCP_INVALID_DETAIL_PAGE");
 if(kind==="itens")items.push(...z.array(itemSchema).parse(rows));else documents.push(...z.array(documentSchema).parse(rows));
 if(rows.length<50)break;
 if(page===200)throw new Error("PNCP_DETAIL_LIMIT");
 await wait(350);
 }
 }
 await db.$transaction(async tx=>{
 await tx.opportunityItem.deleteMany({where:{opportunityId:id}});
 await tx.opportunityDocument.deleteMany({where:{opportunityId:id}});
 if(items.length)await tx.opportunityItem.createMany({data:items.map(i=>({opportunityId:id,number:i.numeroItem,description:i.descricao,quantity:i.quantidade?.toFixed(4)??null,unit:i.unidadeMedida,unitValue:i.orcamentoSigiloso?null:i.valorUnitarioEstimado?.toFixed(4)??null,raw:JSON.parse(JSON.stringify(i))})),skipDuplicates:true});
 if(documents.length)await tx.opportunityDocument.createMany({data:documents.filter(d=>d.statusAtivo!==false).map(d=>({opportunityId:id,officialId:String(d.sequencialDocumento),title:d.titulo,type:d.tipoDocumentoNome,url:base+"/arquivos/"+d.sequencialDocumento})),skipDuplicates:true});
 });
 return {items:items.length,documents:documents.length};
}

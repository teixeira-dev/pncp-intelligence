import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {mkdtemp,writeFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createHash} from "node:crypto";
import {db} from "./db";
import {OpenAIProvider,analysisSchema} from "./ai";
const run=promisify(execFile);
const MAX_BYTES=10*1024*1024;
export async function extractPdf(data:Uint8Array){
 if(data.byteLength>MAX_BYTES||Buffer.from(data.subarray(0,5)).toString()!=="%PDF-")throw new Error("DOCUMENT_NOT_SUPPORTED");
 const dir=await mkdtemp(join(tmpdir(),"pncp-pdf-")),path=join(dir,"source.pdf");
 try{
 await writeFile(path,data,{mode:0o600});
 const info=await run("pdfinfo",[path],{timeout:15000,maxBuffer:100000});
 const pageCount=Number(info.stdout.match(/^Pages:\s+(\d+)/m)?.[1]);
 if(!pageCount)throw new Error("DOCUMENT_PAGE_COUNT_UNKNOWN");
 const parsed=await run("pdftotext",["-f","1","-l",String(Math.min(pageCount,40)),"-enc","UTF-8",path,"-"],{timeout:20000,maxBuffer:2*1024*1024});
 const pages=parsed.stdout.split("\f").slice(0,Math.min(pageCount,40));
 const chunks:{page:number;text:string}[]=[];
 for(let index=0;index<pages.length;index++){
 const text=pages[index].replace(/\s+/g," ").trim();
 for(let offset=0;offset<text.length;offset+=5000)chunks.push({page:index+1,text:text.slice(offset,offset+5000)});
 }
 if(!chunks.length)throw new Error("DOCUMENT_NEEDS_OCR");
 return {pageCount,chunks:chunks.slice(0,8),limited:pageCount>40||chunks.length>8};
 }finally{await rm(dir,{recursive:true,force:true});}
}
async function officialPdf(url:string){
 const parsed=new URL(url);
 if(parsed.protocol!=="https:"||parsed.hostname!=="pncp.gov.br"||!/^\/api\/pncp\/v1\/orgaos\/\d{14}\/compras\/\d+\/\d+\/arquivos\/\d+$/.test(parsed.pathname))throw new Error("DOCUMENT_URL_REJECTED");
 const response=await fetch(parsed,{redirect:"error",signal:AbortSignal.timeout(45000)});
 if(!response.ok||!response.body)throw new Error("DOCUMENT_FETCH_FAILED");
 if(Number(response.headers.get("content-length"))>MAX_BYTES)throw new Error("DOCUMENT_TOO_LARGE");
 const reader=response.body.getReader(),parts:Uint8Array[]=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>MAX_BYTES)throw new Error("DOCUMENT_TOO_LARGE");parts.push(value);}}finally{await reader.cancel();}
 return Buffer.concat(parts);
}
export async function analyzeDocument(userId:string,documentId:string){
 if(process.env.AI_PROVIDER!=="openai"||!process.env.AI_API_KEY||!process.env.AI_MODEL)throw new Error("AI_NOT_CONFIGURED");
 if(!await db.user.findFirst({where:{id:userId,active:true}}))throw new Error("USER_INACTIVE");
 const doc=await db.opportunityDocument.findUniqueOrThrow({where:{id:documentId},include:{opportunity:{select:{object:true}}}});
 const data=await officialPdf(doc.url);
 const contentHash=createHash("sha256").update(data).digest("hex");
 const key={userId,opportunityId:doc.opportunityId,contentHash,provider:"openai",model:process.env.AI_MODEL,version:2};
 const cached=await db.aIAnalysis.findUnique({where:{userId_opportunityId_contentHash_provider_model_version:key}});if(cached)return cached;
 const extracted=await extractPdf(data),provider=new OpenAIProvider();
 const results:Awaited<ReturnType<typeof provider.analyzeOpportunity>>[]=[];
 for(const chunk of extracted.chunks){
 results.push(await provider.analyzeOpportunity({object:doc.opportunity.object,description:`Documento: ${doc.title}. Trecho da página ${chunk.page}; análise parcial. Nunca conclua ausência de um requisito no documento inteiro a partir deste trecho.\n${chunk.text}`,officialUrl:doc.url+"#page="+chunk.page}));
 }
 const fields=["requisitos","datas","valores","documentos","riscos","proximosPassos"] as const;
 const merged=analysisSchema.parse({resumo:results.map((r,i)=>`[p. ${extracted.chunks[i].page}] ${r.resumo}`).join("\n").slice(0,4000),objeto:doc.opportunity.object.slice(0,4000),...Object.fromEntries(fields.map(key=>[key,results.flatMap((r,i)=>r[key].map(text=>`[p. ${extracted.chunks[i].page}] ${text}`.slice(0,1000))).slice(0,30)]))});
 const result={...merged,documento:doc.title,fonte:doc.url,cobertura:`${extracted.chunks.length} trechos, páginas ${[...new Set(extracted.chunks.map(c=>c.page))].join(", ")}, de ${extracted.pageCount} páginas. ${extracted.limited?"Processamento limitado; não cobre o documento integral.":"Texto extraído; elementos gráficos não foram analisados."}`};
 return db.aIAnalysis.upsert({where:{userId_opportunityId_contentHash_provider_model_version:key},create:{...key,result},update:{}});
}

import {describe,it,expect} from "vitest";
import {extractPdf} from "../src/lib/documents";
function pdf(){
 const stream="BT /F1 12 Tf 40 160 Td (Requisito: apresentar proposta comercial.) Tj ET";
 const objects=["<< /Type /Catalog /Pages 2 0 R >>","<< /Type /Pages /Kids [3 0 R] /Count 1 >>","<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>","<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
 let out="%PDF-1.4\n";const offsets=[0];
 for(let i=0;i<objects.length;i++){offsets.push(Buffer.byteLength(out));out+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`;}
 const xref=Buffer.byteLength(out);out+="xref\n0 6\n0000000000 65535 f \n"+offsets.slice(1).map(n=>String(n).padStart(10,"0")+" 00000 n \n").join("")+`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
 return Buffer.from(out);
}
describe("bounded PDF extraction",()=>{
 it("extracts real PDF text with page reference",async()=>{const result=await extractPdf(pdf());expect(result.pageCount).toBe(1);expect(result.chunks[0].page).toBe(1);expect(result.chunks[0].text).toContain("proposta comercial");expect(result.limited).toBe(false);});
 it("rejects non-PDF input",async()=>{await expect(extractPdf(Buffer.from("not a pdf"))).rejects.toThrow("DOCUMENT_NOT_SUPPORTED");});
 it("rejects oversized content",async()=>{await expect(extractPdf(Buffer.alloc(11*1024*1024))).rejects.toThrow("DOCUMENT_NOT_SUPPORTED");});
});

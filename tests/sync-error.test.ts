import {expect,it} from "vitest";
import {z} from "zod";
import {syncError} from "../src/lib/sync-error";
it("reports PNCP status and timeout without sensitive details",()=>{
 expect(syncError(new Error("PNCP_HTTP_429"))).toEqual({kind:"PNCP_HTTP_429"});
 expect(syncError(new DOMException("private url", "TimeoutError"))).toEqual({kind:"PNCP_TIMEOUT"});
 expect(JSON.stringify(syncError(new Error("postgres://secret:password@host")))).not.toContain("password");
});
it("reports validation paths without data",()=>{
 const r=z.object({id:z.number()}).safeParse({id:"secret"});
 if(!r.success){expect(syncError(r.error)).toEqual({kind:"PNCP_VALIDATION_FAILED",issues:[{code:"invalid_type",path:["id"]}]});}
});

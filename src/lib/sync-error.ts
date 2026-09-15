import {ZodError} from "zod";
// Only predefined codes and schema paths: never log request payloads, URLs or secrets.
export function syncError(error:unknown){
 if(error instanceof ZodError)return {kind:"PNCP_VALIDATION_FAILED",issues:error.issues.slice(0,10).map(i=>({code:i.code,path:i.path}))};
 if(error instanceof Error){
 const code=error.message.match(/\bPNCP_[A-Z_]+(?:_\d{3})?\b/)?.[0];
 if(code)return {kind:code};
 if(error.name==="TimeoutError"||error.name==="AbortError")return {kind:"PNCP_TIMEOUT"};
 if("code" in error&&typeof error.code==="string"&&/^P\d{4}$/.test(error.code))return {kind:"DATABASE_ERROR",code:error.code};
 }
 return {kind:"SYNC_UNEXPECTED_ERROR"};
}

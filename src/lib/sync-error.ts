import {ZodError} from "zod";
function safeMessage(message:string){
 return message.replace(/https?:\/\/\S+/gi,"[URL]").replace(/(?:postgres(?:ql)?|libsql):\/\/\S+/gi,"[DATABASE_URL]").slice(0,240);
}
// Log only bounded diagnostic metadata; never payloads, URLs, credentials or stack traces.
export function syncError(error:unknown){
 if(error instanceof ZodError)return {kind:"PNCP_VALIDATION_FAILED",issues:error.issues.slice(0,10).map(i=>({code:i.code,path:i.path}))};
 if(error instanceof Error){
  const code=error.message.match(/\bPNCP_[A-Z_]+(?:_\d{3})?\b/)?.[0];
  if(code)return {kind:code,name:error.name};
  if(error.name==="TimeoutError"||error.name==="AbortError")return {kind:"PNCP_TIMEOUT",name:error.name};
  if("code" in error&&typeof error.code==="string"){
   if(/^P\d{4}$/.test(error.code))return {kind:"DATABASE_ERROR",code:error.code,name:error.name};
   return {kind:"RUNTIME_ERROR",code:error.code,name:error.name,message:safeMessage(error.message)};
  }
  return {kind:"SYNC_UNEXPECTED_ERROR",name:error.name,message:safeMessage(error.message)};
 }
 return {kind:"SYNC_UNEXPECTED_ERROR",type:typeof error};
}

import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {verifyOrigin} from "../src/lib/auth";
const deployed="pncp-intelligence.up.railway.app";
function request(origin:string|null,host:string|null=deployed,proto:string|null="https"){
 const headers=new Headers();if(origin!==null)headers.set("origin",origin);if(host!==null)headers.set("x-forwarded-host",host);if(proto!==null)headers.set("x-forwarded-proto",proto);
 return new Request("http://internal:3000/api/auth/login",{method:"POST",headers});
}
beforeEach(()=>{vi.stubEnv("APP_URL","https://pncp-web-production.up.railway.app");vi.stubEnv("RAILWAY_PUBLIC_DOMAIN",deployed);});
afterEach(()=>vi.unstubAllEnvs());
describe("CSRF origin validation",()=>{
 it("accepts the configured origin without proxy headers",()=>{expect(()=>verifyOrigin(request(process.env.APP_URL!,null,null))).not.toThrow();});
 it.each(["login","register"])("accepts Railway HTTPS origin behind internal HTTP for %s",path=>{
 const req=request("https://"+deployed);expect(()=>verifyOrigin(new Request("http://internal:3000/api/auth/"+path,req))).not.toThrow();
 });
 it("preserves localhost with explicit port",()=>{vi.stubEnv("APP_URL","http://localhost:3000");expect(()=>verifyOrigin(request("http://localhost:3000",null,null))).not.toThrow();expect(()=>verifyOrigin(request("http://localhost:3001",null,null))).toThrow();});
 it.each([null,"null","https://evil.example","https://pncp-intelligence.up.railway.app.evil.example","https://"+deployed+"/path","https://"+deployed+"/","https://user@"+deployed,"https://"+deployed+"?x=1","https://"+deployed+", https://evil.example"])("rejects invalid or external Origin %s",origin=>{expect(()=>verifyOrigin(request(origin))).toThrow();});
 it.each(["evil.example","other.up.railway.app",deployed+", evil.example",deployed+"/path","user@"+deployed,deployed+"?x=1",deployed+":444",null])("rejects untrusted or malformed forwarded host %s",host=>{expect(()=>verifyOrigin(request("https://"+deployed,host))).toThrow();});
 it.each([null,"http","https,http","ftp","HTTPS"])("rejects invalid forwarded protocol %s",proto=>{expect(()=>verifyOrigin(request("https://"+deployed,deployed,proto))).toThrow();});
 it("rejects matching attacker origin and forged forwarded headers",()=>{expect(()=>verifyOrigin(request("https://evil.example","evil.example"))).toThrow();});
 it("rejects proxy fallback without server-owned domain configuration",()=>{vi.stubEnv("RAILWAY_PUBLIC_DOMAIN","");expect(()=>verifyOrigin(request("https://"+deployed))).toThrow();});
 it("fails closed when APP_URL is absent or invalid",()=>{for(const value of ["","garbage","javascript:alert(1)"]){vi.stubEnv("APP_URL",value);expect(()=>verifyOrigin(request("https://"+deployed))).toThrow();}});
});

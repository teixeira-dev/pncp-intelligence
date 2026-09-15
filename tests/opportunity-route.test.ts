import {expect,it} from "vitest";
import {opportunityRoute} from "../src/lib/opportunity-route";
const id="11222333000181-1-000001/2026";
it("preserves official identifiers with encoded or split year and actions",()=>{
 expect(opportunityRoute([id])).toEqual({id,action:undefined});
 expect(opportunityRoute([encodeURIComponent(id),"favorite"])).toEqual({id,action:"favorite"});
 expect(opportunityRoute(["11222333000181-1-000001","2026","items"])).toEqual({id,action:"items"});
 expect(opportunityRoute(["simple","favorite"])).toEqual({id:"simple",action:"favorite"});
});

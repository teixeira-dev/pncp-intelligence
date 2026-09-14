import {describe,it,expect} from "vitest";
import {matchOpportunity} from "../src/lib/matching";
import {validCnpj} from "../src/lib/validation";
const p={keywords:["hospitalar"],excludedTerms:[],regions:["PE"],modalities:[6],minValue:"100",maxValue:"1000",products:"",services:"",activity:""};
const o={object:"Material hospitalar",description:"",state:"PE",modality:6,estimatedValue:"500"};
describe("explainable matching",()=>{
 it("gives 100 for all matching factors",()=>{expect(matchOpportunity(p,o).score).toBe(100);expect(matchOpportunity(p,o).reasons.join(" ")).toContain("hospitalar");});
 it("penalizes negative terms",()=>expect(matchOpportunity({...p,excludedTerms:["hospitalar"]},o).score).toBe(60));
 it("does not reward unknown value",()=>expect(matchOpportunity(p,{...o,estimatedValue:null}).score).toBe(85));
 it("normalizes accents",()=>expect(matchOpportunity({...p,keywords:["médico"]},{...o,object:"Equipamento medico"}).score).toBe(100));
 it("bounds score",()=>expect(matchOpportunity({...p,excludedTerms:["nada"]},{...o,object:"nada",state:"SP",estimatedValue:"99999",modality:1}).score).toBe(0));
});
describe("CNPJ",()=>{it("validates check digits",()=>{expect(validCnpj("11222333000181")).toBe(true);expect(validCnpj("11111111111111")).toBe(false);expect(validCnpj("11222333000182")).toBe(false);});});

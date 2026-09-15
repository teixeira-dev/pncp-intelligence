import {z} from "zod";
const text=z.string().trim().max(2000);
export const password=z.string().min(12,"Use pelo menos 12 caracteres.").max(72);
export const credentials=z.object({email:z.string().email().max(254).transform(s=>s.toLowerCase()),password:z.string().min(1).max(72)}).strict();
export function validCnpj(v:string){if(!/^\d{14}$/.test(v)||/^(\d)\1+$/.test(v))return false;const digit=(s:string)=>{let w=s.length-7;let sum=0;for(const c of s){sum+=Number(c)*w--;if(w<2)w=9;}const r=sum%11;return r<2?0:11-r;};return digit(v.slice(0,12))===Number(v[12])&&digit(v.slice(0,13))===Number(v[13]);}
const money=z.string().regex(/^\d{1,16}(\.\d{1,2})?$/).nullable().optional();
export const companyInput=z.object({
 legalName:z.string().trim().min(2).max(200),tradeName:text.default(""),cnpj:z.string().transform(v=>v.replace(/\D/g,"")).refine(validCnpj,"CNPJ inválido."),
 city:text.default(""),state:z.string().regex(/^([A-Z]{2})?$/).default(""),activity:text.default(""),products:text.default(""),services:text.default(""),
 keywords:z.array(z.string().trim().min(1).max(100)).max(50).default([]),excludedTerms:z.array(z.string().trim().min(1).max(100)).max(50).default([]),
 regions:z.array(z.string().regex(/^[A-Z]{2}$/)).max(27).default([]),modalities:z.array(z.number().int().min(1).max(20)).default([]),
 minValue:money,maxValue:money
}).strict().refine(v=>!v.minValue||!v.maxValue||Number(v.minValue)<=Number(v.maxValue),"Faixa de valor inválida.");
export const alertInput=z.object({
 name:z.string().trim().min(2).max(150),companyId:z.string().nullish(),
 keywords:z.array(z.string().trim().min(1).max(100)).max(50).default([]),
 state:z.string().regex(/^[A-Z]{2}$/).nullish(),city:text.nullish(),agency:text.nullish(),
 modality:z.number().int().min(1).max(20).nullish(),minValue:money,maxValue:money,
 minScore:z.number().int().min(0).max(100).default(0),active:z.boolean().default(true),email:z.boolean().default(false)
}).strict().refine(v=>!v.minScore||!!v.companyId,"Selecione uma empresa para filtrar por score.");

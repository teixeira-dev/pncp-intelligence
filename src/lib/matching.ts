export const normalize=(s:string)=>s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
type Profile={keywords:string[];excludedTerms:string[];regions:string[];modalities:number[];minValue:unknown;maxValue:unknown;products:string;services:string;activity:string};
type Tender={object:string;description:string;state:string;modality:number;estimatedValue:unknown;items?:{description:string}[]};
export function matchOpportunity(p:Profile,o:Tender){
 const content=normalize([o.object,o.description,...(o.items??[]).map(i=>i.description)].join(" "));
 const terms=p.keywords.length?p.keywords:[...new Set(normalize(p.products+" "+p.services+" "+p.activity).split(/\W+/).filter(t=>t.length>4))].slice(0,30);
 const positive=terms.filter(t=>content.includes(normalize(t)));
 const negative=p.excludedTerms.filter(t=>content.includes(normalize(t)));
 let score=0;const reasons:string[]=[];
 if(terms.length){score+=Math.round(60*positive.length/terms.length);reasons.push(positive.length?"Termos encontrados: "+positive.join(", "):"Nenhum termo do perfil encontrado.");}
 else reasons.push("Configure palavras-chave para melhorar a comparação.");
 if(!p.regions.length){score+=15;reasons.push("Perfil sem restrição regional.");}
 else if(p.regions.includes(o.state)){score+=15;reasons.push("UF dentro da região atendida.");}else reasons.push("UF fora da região atendida.");
 const value=o.estimatedValue==null?null:Number(o.estimatedValue);
 if(p.minValue==null&&p.maxValue==null){score+=15;reasons.push("Perfil sem restrição de valor.");}
 else if(value!==null&&(p.minValue==null||value>=Number(p.minValue))&&(p.maxValue==null||value<=Number(p.maxValue))){score+=15;reasons.push("Valor dentro da faixa configurada.");}
 else reasons.push(value===null?"Valor oficial não informado.":"Valor fora da faixa configurada.");
 if(!p.modalities.length||p.modalities.includes(o.modality)){score+=10;reasons.push("Modalidade compatível com o perfil.");}else reasons.push("Modalidade fora do perfil.");
 if(negative.length){score-=40;reasons.push("Termos negativos encontrados: "+negative.join(", "));}
 return {score:Math.max(0,Math.min(100,score)),reasons,version:1};
}
